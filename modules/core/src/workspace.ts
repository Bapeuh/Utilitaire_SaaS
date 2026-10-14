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
import { inArray } from "drizzle-orm";

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
  { key: "core.scope.create", moduleKey: "core", objectType: "scope", action: "create" },
  { key: "core.scope.read", moduleKey: "core", objectType: "scope", action: "read" },
  { key: "core.project.create", moduleKey: "core", objectType: "project", action: "create" },
  { key: "core.project.read", moduleKey: "core", objectType: "project", action: "read" },
] as const;

export async function createWorkspaceForUser(
  db: Database,
  input: CreateWorkspaceInput,
): Promise<CreatedWorkspace> {
  return db.transaction(async (tx) => {
    const [workspace] = await tx
      .insert(workspaces)
      .values({ name: input.workspaceName })
      .returning({ id: workspaces.id });

    if (!workspace) {
      throw new Error("Workspace creation failed");
    }

    const [rootContext] = await tx
      .insert(contexts)
      .values({
        workspaceId: workspace.id,
        type: "workspace",
        parentContextId: null,
      })
      .returning({ id: contexts.id });

    if (!rootContext) {
      throw new Error("Workspace root Context creation failed");
    }

    const [membership] = await tx
      .insert(workspaceUsers)
      .values({
        workspaceId: workspace.id,
        userId: input.userId,
        role: "administrator",
      })
      .returning({ id: workspaceUsers.id });

    if (!membership) {
      throw new Error("Workspace membership creation failed");
    }

    await tx.insert(permissions).values(corePermissions).onConflictDoNothing({ target: permissions.key });

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

    const administratorRole = createdRoles.find((role) => role.systemKey === "administrator");

    if (!administratorRole || createdRoles.length !== systemRoles.length) {
      throw new Error("Workspace system roles bootstrap failed");
    }

    await tx.insert(accessRolePermissions).values(
      permissionRows.map((permission) => ({
        workspaceId: workspace.id,
        accessRoleId: administratorRole.id,
        permissionId: permission.id,
      })),
    );

    const [personObject] = await tx
      .insert(objects)
      .values({
        workspaceId: workspace.id,
        contextId: rootContext.id,
        moduleKey: "core",
        objectType: "person",
      })
      .returning({ id: objects.id });

    if (!personObject) {
      throw new Error("Person registry Object creation failed");
    }

    const [person] = await tx
      .insert(persons)
      .values({
        workspaceId: workspace.id,
        objectId: personObject.id,
        userId: input.userId,
        displayName: input.personDisplayName,
      })
      .returning({ id: persons.id });

    if (!person) {
      throw new Error("Person creation failed");
    }

    return {
      workspaceId: workspace.id,
      rootContextId: rootContext.id,
      membershipId: membership.id,
      personObjectId: personObject.id,
      personId: person.id,
    };
  });
}
