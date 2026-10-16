import {
  accessRolePermissions,
  accessRoles,
  contexts,
  createDatabase,
  objects,
  permissions,
  persons,
  teamAccessGrants,
  teamMembers,
  teams,
  userAccessGrants,
  users,
  workspaceUsers,
  workspaces,
} from "@utilitaire/database";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hasPermission } from "./authorization.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://utilitaire:utilitaire@localhost:5432/utilitaire";

const { client, db } = createDatabase(databaseUrl);

const ids = {
  userId: randomUUID(),
  workspaceId: randomUUID(),
  otherWorkspaceId: randomUUID(),
  rootContextId: randomUUID(),
  childContextId: randomUUID(),
  grandchildContextId: randomUUID(),
  otherContextId: randomUUID(),
  personObjectId: randomUUID(),
  personId: randomUUID(),
  teamObjectId: randomUUID(),
  teamId: randomUUID(),
  systemRoleId: randomUUID(),
  directRoleId: randomUUID(),
  teamRoleId: randomUUID(),
  systemPermissionId: randomUUID(),
  directPermissionId: randomUUID(),
  teamPermissionId: randomUUID(),
};

describe("contextual permissions", () => {
  beforeAll(async () => {
    await db.insert(users).values({
      id: ids.userId,
      name: "Permission Test User",
      email: `permissions-${ids.userId}@example.test`,
    });

    await db.insert(workspaces).values([
      { id: ids.workspaceId, name: "Permission Test Workspace" },
      { id: ids.otherWorkspaceId, name: "Other Permission Workspace" },
    ]);

    await db.insert(workspaceUsers).values({
      workspaceId: ids.workspaceId,
      userId: ids.userId,
      role: "member",
    });

    await db.insert(contexts).values([
      {
        id: ids.rootContextId,
        workspaceId: ids.workspaceId,
        type: "workspace",
        parentContextId: null,
      },
      {
        id: ids.childContextId,
        workspaceId: ids.workspaceId,
        type: "scope",
        parentContextId: ids.rootContextId,
      },
      {
        id: ids.grandchildContextId,
        workspaceId: ids.workspaceId,
        type: "project",
        parentContextId: ids.childContextId,
      },
      {
        id: ids.otherContextId,
        workspaceId: ids.otherWorkspaceId,
        type: "workspace",
        parentContextId: null,
      },
    ]);

    await db.insert(objects).values([
      {
        id: ids.personObjectId,
        workspaceId: ids.workspaceId,
        contextId: ids.rootContextId,
        moduleKey: "core",
        objectType: "person",
      },
      {
        id: ids.teamObjectId,
        workspaceId: ids.workspaceId,
        contextId: ids.rootContextId,
        moduleKey: "core",
        objectType: "team",
      },
    ]);

    await db.insert(persons).values({
      id: ids.personId,
      workspaceId: ids.workspaceId,
      objectId: ids.personObjectId,
      userId: ids.userId,
      displayName: "Permission Test User",
    });

    await db.insert(teams).values({
      id: ids.teamId,
      workspaceId: ids.workspaceId,
      objectId: ids.teamObjectId,
      name: "Permission Test Team",
    });

    await db.insert(teamMembers).values({
      workspaceId: ids.workspaceId,
      teamId: ids.teamId,
      personId: ids.personId,
    });

    await db.insert(permissions).values([
      {
        id: ids.systemPermissionId,
        key: `test.system.read.${ids.workspaceId}`,
        moduleKey: "test",
        objectType: "system",
        action: `read-${ids.workspaceId}`,
      },
      {
        id: ids.directPermissionId,
        key: `test.direct.read.${ids.workspaceId}`,
        moduleKey: "test",
        objectType: "direct",
        action: `read-${ids.workspaceId}`,
      },
      {
        id: ids.teamPermissionId,
        key: `test.team.read.${ids.workspaceId}`,
        moduleKey: "test",
        objectType: "team",
        action: `read-${ids.workspaceId}`,
      },
    ]);

    await db.insert(accessRoles).values([
      {
        id: ids.systemRoleId,
        workspaceId: ids.workspaceId,
        name: "Member",
        systemKey: "member",
      },
      {
        id: ids.directRoleId,
        workspaceId: ids.workspaceId,
        name: "Direct Reader",
      },
      {
        id: ids.teamRoleId,
        workspaceId: ids.workspaceId,
        name: "Team Reader",
      },
    ]);

    await db.insert(accessRolePermissions).values([
      {
        workspaceId: ids.workspaceId,
        accessRoleId: ids.systemRoleId,
        permissionId: ids.systemPermissionId,
      },
      {
        workspaceId: ids.workspaceId,
        accessRoleId: ids.directRoleId,
        permissionId: ids.directPermissionId,
      },
      {
        workspaceId: ids.workspaceId,
        accessRoleId: ids.teamRoleId,
        permissionId: ids.teamPermissionId,
      },
    ]);

    await db.insert(userAccessGrants).values({
      workspaceId: ids.workspaceId,
      userId: ids.userId,
      contextId: ids.childContextId,
      accessRoleId: ids.directRoleId,
    });

    await db.insert(teamAccessGrants).values({
      workspaceId: ids.workspaceId,
      teamId: ids.teamId,
      contextId: ids.rootContextId,
      accessRoleId: ids.teamRoleId,
    });
  });

  afterAll(async () => {
    await db.delete(teamAccessGrants).where(eq(teamAccessGrants.workspaceId, ids.workspaceId));
    await db.delete(userAccessGrants).where(eq(userAccessGrants.workspaceId, ids.workspaceId));
    await db
      .delete(accessRolePermissions)
      .where(eq(accessRolePermissions.workspaceId, ids.workspaceId));
    await db.delete(teamMembers).where(eq(teamMembers.workspaceId, ids.workspaceId));
    await db.delete(teams).where(eq(teams.workspaceId, ids.workspaceId));
    await db.delete(persons).where(eq(persons.workspaceId, ids.workspaceId));
    await db
      .delete(objects)
      .where(inArray(objects.id, [ids.personObjectId, ids.teamObjectId]));
    await db.delete(contexts).where(eq(contexts.id, ids.grandchildContextId));
    await db.delete(contexts).where(eq(contexts.id, ids.childContextId));
    await db.delete(contexts).where(eq(contexts.id, ids.rootContextId));
    await db.delete(contexts).where(eq(contexts.id, ids.otherContextId));
    await db.delete(accessRoles).where(eq(accessRoles.workspaceId, ids.workspaceId));
    await db
      .delete(permissions)
      .where(
        inArray(permissions.id, [
          ids.systemPermissionId,
          ids.directPermissionId,
          ids.teamPermissionId,
        ]),
      );
    await db.delete(workspaceUsers).where(eq(workspaceUsers.workspaceId, ids.workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, ids.workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, ids.otherWorkspaceId));
    await db.delete(users).where(eq(users.id, ids.userId));
    await client.end();
  });

  it("applies the workspace system role", async () => {
    await expect(
      hasPermission(db, {
        workspaceId: ids.workspaceId,
        userId: ids.userId,
        contextId: ids.grandchildContextId,
        permissionKey: `test.system.read.${ids.workspaceId}`,
      }),
    ).resolves.toBe(true);
  });

  it("inherits direct user and team grants from ancestor Contexts", async () => {
    await expect(
      hasPermission(db, {
        workspaceId: ids.workspaceId,
        userId: ids.userId,
        contextId: ids.grandchildContextId,
        permissionKey: `test.direct.read.${ids.workspaceId}`,
      }),
    ).resolves.toBe(true);

    await expect(
      hasPermission(db, {
        workspaceId: ids.workspaceId,
        userId: ids.userId,
        contextId: ids.grandchildContextId,
        permissionKey: `test.team.read.${ids.workspaceId}`,
      }),
    ).resolves.toBe(true);
  });

  it("does not authorize a Context from another Workspace", async () => {
    await expect(
      hasPermission(db, {
        workspaceId: ids.workspaceId,
        userId: ids.userId,
        contextId: ids.otherContextId,
        permissionKey: `test.system.read.${ids.workspaceId}`,
      }),
    ).resolves.toBe(false);
  });
});
