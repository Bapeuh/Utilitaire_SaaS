import {
  accessRolePermissions,
  accessRoles,
  contexts,
  createDatabase,
  permissions,
  persons,
  teamAccessGrants,
  teamMembers,
  teams,
  userAccessGrants,
  workspaceUsers,
} from "@utilitaire/database";
import { and, eq, inArray, isNull } from "drizzle-orm";

export interface HasPermissionInput {
  workspaceId: string;
  userId: string;
  contextId: string;
  permissionKey: string;
}

type Database = ReturnType<typeof createDatabase>["db"];

async function getContextAncestry(
  db: Database,
  workspaceId: string,
  contextId: string,
): Promise<string[] | null> {
  const rows = await db
    .select({ id: contexts.id, parentContextId: contexts.parentContextId })
    .from(contexts)
    .where(and(eq(contexts.workspaceId, workspaceId), isNull(contexts.archivedAt)));

  const byId = new Map(rows.map((row) => [row.id, row.parentContextId]));
  if (!byId.has(contextId)) {
    return null;
  }

  const ancestry: string[] = [];
  const visited = new Set<string>();
  let currentId: string | null = contextId;

  while (currentId) {
    if (visited.has(currentId)) {
      return null;
    }

    visited.add(currentId);
    ancestry.push(currentId);
    currentId = byId.get(currentId) ?? null;
  }

  return ancestry;
}

export async function hasPermission(db: Database, input: HasPermissionInput): Promise<boolean> {
  const [membership] = await db
    .select({ role: workspaceUsers.role })
    .from(workspaceUsers)
    .where(
      and(
        eq(workspaceUsers.workspaceId, input.workspaceId),
        eq(workspaceUsers.userId, input.userId),
        isNull(workspaceUsers.archivedAt),
      ),
    )
    .limit(1);

  if (!membership) {
    return false;
  }

  const ancestry = await getContextAncestry(db, input.workspaceId, input.contextId);
  if (!ancestry) {
    return false;
  }

  const roleIds = new Set<string>();

  const implicitSystemRoles = await db
    .select({ id: accessRoles.id })
    .from(accessRoles)
    .where(
      and(
        eq(accessRoles.workspaceId, input.workspaceId),
        eq(accessRoles.systemKey, membership.role),
        isNull(accessRoles.archivedAt),
      ),
    );

  for (const role of implicitSystemRoles) {
    roleIds.add(role.id);
  }

  const directUserGrants = await db
    .select({ accessRoleId: userAccessGrants.accessRoleId })
    .from(userAccessGrants)
    .where(
      and(
        eq(userAccessGrants.workspaceId, input.workspaceId),
        eq(userAccessGrants.userId, input.userId),
        inArray(userAccessGrants.contextId, ancestry),
        isNull(userAccessGrants.archivedAt),
      ),
    );

  for (const grant of directUserGrants) {
    roleIds.add(grant.accessRoleId);
  }

  const userTeams = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .innerJoin(
      persons,
      and(eq(teamMembers.workspaceId, persons.workspaceId), eq(teamMembers.personId, persons.id)),
    )
    .innerJoin(
      teams,
      and(eq(teamMembers.workspaceId, teams.workspaceId), eq(teamMembers.teamId, teams.id)),
    )
    .where(
      and(
        eq(teamMembers.workspaceId, input.workspaceId),
        eq(persons.userId, input.userId),
        isNull(teamMembers.archivedAt),
        isNull(persons.archivedAt),
        isNull(teams.archivedAt),
      ),
    );

  const teamIds = [...new Set(userTeams.map((row) => row.teamId))];
  if (teamIds.length > 0) {
    const teamGrants = await db
      .select({ accessRoleId: teamAccessGrants.accessRoleId })
      .from(teamAccessGrants)
      .where(
        and(
          eq(teamAccessGrants.workspaceId, input.workspaceId),
          inArray(teamAccessGrants.teamId, teamIds),
          inArray(teamAccessGrants.contextId, ancestry),
          isNull(teamAccessGrants.archivedAt),
        ),
      );

    for (const grant of teamGrants) {
      roleIds.add(grant.accessRoleId);
    }
  }

  const candidateRoleIds = [...roleIds];
  if (candidateRoleIds.length === 0) {
    return false;
  }

  const [match] = await db
    .select({ id: accessRolePermissions.id })
    .from(accessRolePermissions)
    .innerJoin(
      accessRoles,
      and(
        eq(accessRolePermissions.workspaceId, accessRoles.workspaceId),
        eq(accessRolePermissions.accessRoleId, accessRoles.id),
      ),
    )
    .innerJoin(permissions, eq(accessRolePermissions.permissionId, permissions.id))
    .where(
      and(
        eq(accessRolePermissions.workspaceId, input.workspaceId),
        inArray(accessRolePermissions.accessRoleId, candidateRoleIds),
        eq(permissions.key, input.permissionKey),
        isNull(accessRolePermissions.archivedAt),
        isNull(accessRoles.archivedAt),
        isNull(permissions.archivedAt),
      ),
    )
    .limit(1);

  return Boolean(match);
}
