import { randomUUID } from "node:crypto";

import { createDatabase } from "@utilitaire/database";
import { afterAll, describe, expect, it } from "vitest";

import { createWorkspaceForUser } from "./workspace.js";
import {
  addWorkspaceMemberByEmail,
  LastWorkspaceAdministratorError,
  listWorkspaceMembers,
  updateWorkspaceMemberRole,
  WorkspaceMemberUserNotFoundError,
} from "./workspace-members.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://utilitaire:utilitaire@localhost:5432/utilitaire";

const { client, db } = createDatabase(databaseUrl);

async function cleanup(workspaceId: string, userIds: string[]) {
  await client`delete from team_access_grants where workspace_id = ${workspaceId}`;
  await client`delete from user_access_grants where workspace_id = ${workspaceId}`;
  await client`delete from access_role_permissions where workspace_id = ${workspaceId}`;
  await client`delete from access_roles where workspace_id = ${workspaceId}`;
  await client`delete from team_members where workspace_id = ${workspaceId}`;
  await client`delete from person_organization_links where workspace_id = ${workspaceId}`;
  await client`delete from persons where workspace_id = ${workspaceId}`;
  await client`delete from objects where workspace_id = ${workspaceId}`;
  await client`delete from workspace_users where workspace_id = ${workspaceId}`;
  await client`delete from contexts where workspace_id = ${workspaceId}`;
  await client`delete from workspaces where id = ${workspaceId}`;
  for (const userId of userIds) await client`delete from users where id = ${userId}`;
}

afterAll(async () => {
  await client.end();
});

describe("Workspace members", () => {
  it("adds an existing account by email and creates its Person", async () => {
    const ownerId = randomUUID();
    const memberId = randomUUID();
    const ownerEmail = `owner-${randomUUID()}@example.test`;
    const memberEmail = `member-${randomUUID()}@example.test`;

    await client`insert into users (id, name, email, email_verified) values (${ownerId}, 'Owner User', ${ownerEmail}, false)`;
    await client`insert into users (id, name, email, email_verified) values (${memberId}, 'Member User', ${memberEmail}, false)`;

    const created = await createWorkspaceForUser(db, {
      userId: ownerId,
      workspaceName: "Member integration workspace",
      personDisplayName: "Owner User",
    });

    try {
      const added = await addWorkspaceMemberByEmail(db, created.workspaceId, memberEmail, "manager");
      expect(added).toMatchObject({
        userId: memberId,
        role: "manager",
        name: "Member User",
        email: memberEmail,
      });
      expect(added.personId).toBeTruthy();

      const members = await listWorkspaceMembers(db, created.workspaceId);
      expect(members).toHaveLength(2);
      expect(members).toContainEqual(expect.objectContaining({ userId: memberId, role: "manager", personId: added.personId }));

      const updated = await updateWorkspaceMemberRole(db, created.workspaceId, memberId, "guest");
      expect(updated?.role).toBe("guest");
    } finally {
      await cleanup(created.workspaceId, [ownerId, memberId]);
    }
  });

  it("rejects an unknown email and protects the last administrator", async () => {
    const ownerId = randomUUID();
    const ownerEmail = `owner-${randomUUID()}@example.test`;
    await client`insert into users (id, name, email, email_verified) values (${ownerId}, 'Owner User', ${ownerEmail}, false)`;

    const created = await createWorkspaceForUser(db, {
      userId: ownerId,
      workspaceName: "Member safety workspace",
      personDisplayName: "Owner User",
    });

    try {
      await expect(
        addWorkspaceMemberByEmail(db, created.workspaceId, `missing-${randomUUID()}@example.test`, "member"),
      ).rejects.toBeInstanceOf(WorkspaceMemberUserNotFoundError);

      await expect(
        updateWorkspaceMemberRole(db, created.workspaceId, ownerId, "member"),
      ).rejects.toBeInstanceOf(LastWorkspaceAdministratorError);
    } finally {
      await cleanup(created.workspaceId, [ownerId]);
    }
  });
});
