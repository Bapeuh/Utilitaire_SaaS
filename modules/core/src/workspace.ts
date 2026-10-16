import {
  accessRolePermissions,
  accessRoles,
  contexts,
  createDatabase,
  objects,
  permissions,
  persons,
  workspaceUsers,
  workspaces,
} from "@utilitaire/database";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

export interface CreateWorkspaceInput {
  userId: string;
  workspaceName: string;
  personDisplayName: string;
}

export interface CreatedWorkspace {
  workspaceId: string;
  rootContextId: string;
  membershipId: string;
  personObjectId: string;
  personId: string;
}

type Database = ReturnType<typeof createDatabase>["db"];

const systemRoles = [
  { name: "Administrator", systemKey: "administrator" as const },
  { name: "Manager", systemKey: "manager" as const },
  { name: "Member", systemKey: "member" as const },
  { name: "Guest", systemKey: "guest" as const },
];

const corePermissions = [
  { key: "core.workspace.read", moduleKey: "core", objectType: "workspace", action: "read" },
  { key: "core.workspace_member.read", moduleKey: "core", objectType: "workspace_member", action: "read" },
  { key: "core.workspace_member.manage", moduleKey: "core", objectType: "workspace_member", action: "manage" },
  { key: "core.scope.create", moduleKey: "core", objectType: "scope", action: "create" },
  { key: "core.scope.read", moduleKey: "core", objectType: "scope", action: "read" },
  { key: "core.project.create", moduleKey: "core", objectType: "project", action: "create" },
  { key: "core.project.read", moduleKey: "core", objectType: "project", action: "read" },
  { key: "core.organization.create", moduleKey: "core", objectType: "organization", action: "create" },
  { key: "core.organization.read", moduleKey: "core", objectType: "organization", action: "read" },
  { key: "core.team.create", moduleKey: "core", objectType: "team", action: "create" },
  { key: "core.team.read", moduleKey: "core", objectType: "team", action: "read" },
  { key: "core.team.manage", moduleKey: "core", objectType: "team", action: "manage" },
  { key: "core.job_role.create", moduleKey: "core", objectType: "job_role", action: "create" },
  { key: "core.job_role.read", moduleKey: "core", objectType: "job_role", action: "read" },
  { key: "core.module.read", moduleKey: "core", objectType: "module", action: "read" },
  { key: "core.module.manage", moduleKey: "core", objectType: "module", action: "manage" },
];

const rolePermissionKeys = {
  administrator: corePermissions.map((permission) => permission.key),
  manager: [
    "core.workspace.read",
    "core.workspace_member.read",
    "core.scope.create",
    "core.scope.read",
    "core.project.create",
    "core.project.read",
    "core.organization.create",
    "core.organization.read",
    "core.team.create",
    "core.team.read",
    "core.team.manage",
    "core.job_role.create",
    "core.job_role.read",
    "core.module.read",
  ],
  member: [
    "core.workspace.read",
    "core.workspace_member.read",
    "core.scope.read",
    "core.project.read",
    "core.organization.read",
    "core.team.read",
    "core.job_role.read",
    "core.module.read",
  ],
  guest: ["core.workspace.read", "core.scope.read", "core.project.read"],
} as const;

export async function ensureCorePermissionsForWorkspace(db: Database, workspaceId: string) {
  await db.insert(permissions).values(corePermissions).onConflictDoNothing();

  const permissionRows = await db
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions)
    .where(inArray(permissions.key, corePermissions.map((permission) => permission.key)));

  const roleRows = await db
    .select({ id: accessRoles.id, systemKey: accessRoles.systemKey })
    .from(accessRoles)
    .where(and(eq(accessRoles.workspaceId, workspaceId), isNull(accessRoles.archivedAt)));

  const permissionIdByKey = new Map(permissionRows.map((permission) => [permission.key, permission.id]));
  const values = roleRows.flatMap((role) => {
    if (!role.systemKey) return [];
    return rolePermissionKeys[role.systemKey].flatMap((key) => {
      const permissionId = permissionIdByKey.get(key);
      return permissionId ? [{ workspaceId, accessRoleId: role.id, permissionId }] : [];
    });
  });

  if (values.length) await db.insert(accessRolePermissions).values(values).onConflictDoNothing();
}

export async function isActiveWorkspaceMember(db: Database, workspaceId: string, userId: string) {
  const [membership] = await db
    .select({ id: workspaceUsers.id })
    .from(workspaceUsers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceUsers.workspaceId))
    .where(
      and(
        eq(workspaceUsers.workspaceId, workspaceId),
        eq(workspaceUsers.userId, userId),
        isNull(workspaceUsers.archivedAt),
        isNull(workspaces.archivedAt),
      ),
    )
    .limit(1);

  return Boolean(membership);
}

export async function listWorkspacesForUser(db: Database, userId: string) {
  return db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      role: workspaceUsers.role,
      rootContextId: contexts.id,
      createdAt: workspaces.createdAt,
    })
    .from(workspaceUsers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceUsers.workspaceId))
    .innerJoin(
      contexts,
      and(
        eq(contexts.workspaceId, workspaces.id),
        eq(contexts.type, "workspace"),
        isNull(contexts.archivedAt),
      ),
    )
    .where(and(eq(workspaceUsers.userId, userId), isNull(workspaceUsers.archivedAt), isNull(workspaces.archivedAt)))
    .orderBy(asc(workspaces.name));
}

export async function createWorkspaceForUser(
  db: Database,
  input: CreateWorkspaceInput,
): Promise<CreatedWorkspace> {
  return db.transaction(async (tx) => {
    const [workspace] = await tx
      .insert(workspaces)
      .values({ name: input.workspaceName })
      .returning({ id: workspaces.id });

    if (!workspace) throw new Error("Workspace creation failed");

    const [rootContext] = await tx
      .insert(contexts)
      .values({ workspaceId: workspace.id, type: "workspace", parentContextId: null })
      .returning({ id: contexts.id });

    if (!rootContext) throw new Error("Workspace root Context creation failed");

    const [membership] = await tx
      .insert(workspaceUsers)
      .values({ workspaceId: workspace.id, userId: input.userId, role: "administrator" })
      .returning({ id: workspaceUsers.id });

    if (!membership) throw new Error("Workspace membership creation failed");

    await tx.insert(permissions).values(corePermissions).onConflictDoNothing();

    const permissionRows = await tx
      .select({ id: permissions.id, key: permissions.key })
      .from(permissions)
      .where(inArray(permissions.key, corePermissions.map((permission) => permission.key)));

    if (permissionRows.length !== corePermissions.length) {
      throw new Error("Core permissions bootstrap failed");
    }

    const createdRoles = await tx
      .insert(accessRoles)
      .values(
        systemRoles.map((role) => ({
          workspaceId: workspace.id,
          name: role.name,
          systemKey: role.systemKey,
        })),
      )
      .returning({ id: accessRoles.id, systemKey: accessRoles.systemKey });

    if (createdRoles.length !== systemRoles.length) {
      throw new Error("Workspace system roles bootstrap failed");
    }

    const permissionIdByKey = new Map(permissionRows.map((permission) => [permission.key, permission.id]));
    const rolePermissionValues = createdRoles.flatMap((role) => {
      if (!role.systemKey) return [];
      return rolePermissionKeys[role.systemKey].flatMap((key) => {
        const permissionId = permissionIdByKey.get(key);
        return permissionId ? [{ workspaceId: workspace.id, accessRoleId: role.id, permissionId }] : [];
      });
    });

    if (rolePermissionValues.length) await tx.insert(accessRolePermissions).values(rolePermissionValues);

    const [personObject] = await tx
      .insert(objects)
      .values({
        workspaceId: workspace.id,
        contextId: rootContext.id,
        moduleKey: "core",
        objectType: "person",
      })
      .returning({ id: objects.id });

    if (!personObject) throw new Error("Person registry Object creation failed");

    const [person] = await tx
      .insert(persons)
      .values({
        workspaceId: workspace.id,
        objectId: personObject.id,
        userId: input.userId,
        displayName: input.personDisplayName,
      })
      .returning({ id: persons.id });

    if (!person) throw new Error("Person creation failed");

    return {
      workspaceId: workspace.id,
      rootContextId: rootContext.id,
      membershipId: membership.id,
      personObjectId: personObject.id,
      personId: person.id,
    };
  });
}
