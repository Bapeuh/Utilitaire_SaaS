import { randomUUID } from "node:crypto";

import { createDatabase } from "@utilitaire/database";
import { afterAll, describe, expect, it } from "vitest";

import { createWorkspaceForUser } from "./workspace.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://utilitaire:utilitaire@localhost:5432/utilitaire";

const { client, db } = createDatabase(databaseUrl);

async function deleteWorkspace(workspaceId: string) {
  await client`delete from access_role_permissions where workspace_id = ${workspaceId}`;
  await client`delete from user_access_grants where workspace_id = ${workspaceId}`;
  await client`delete from team_access_grants where workspace_id = ${workspaceId}`;
  await client`delete from access_roles where workspace_id = ${workspaceId}`;
  await client`delete from persons where workspace_id = ${workspaceId}`;
  await client`delete from objects where workspace_id = ${workspaceId}`;
  await client`delete from workspace_users where workspace_id = ${workspaceId}`;
  await client`delete from contexts where workspace_id = ${workspaceId}`;
  await client`delete from workspaces where id = ${workspaceId}`;
}

afterAll(async () => {
  await client.end();
});

describe("Core workspace creation", () => {
  it("creates Workspace foundations and bootstraps system access roles atomically", async () => {
    const userId = randomUUID();
    const email = `core-${randomUUID()}@example.test`;

    await client`
      insert into users (id, name, email, email_verified)
      values (${userId}, 'Core Test User', ${email}, false)
    `;

    let workspaceId: string | undefined;

    try {
      const created = await createWorkspaceForUser(db, {
        userId,
        workspaceName: "Core integration workspace",
        personDisplayName: "Core Test User",
      });
      workspaceId = created.workspaceId;

      const workspaceRows = await client`
        select id from workspaces where id = ${created.workspaceId}
      `;
      const contextRows = await client`
        select id, type, parent_context_id from contexts where id = ${created.rootContextId}
      `;
      const membershipRows = await client`
        select id, role from workspace_users where id = ${created.membershipId}
      `;
      const objectRows = await client`
        select id, module_key, object_type, context_id from objects where id = ${created.personObjectId}
      `;
      const personRows = await client`
        select id, user_id, object_id from persons where id = ${created.personId}
      `;
      const roleRows = await client`
        select id, name, system_key
        from access_roles
        where workspace_id = ${created.workspaceId}
        order by system_key
      `;
      const administratorPermissionRows = await client`
        select p.key
        from access_role_permissions arp
        join access_roles ar
          on ar.workspace_id = arp.workspace_id
         and ar.id = arp.access_role_id
        join permissions p on p.id = arp.permission_id
        where arp.workspace_id = ${created.workspaceId}
          and ar.system_key = 'administrator'
          and p.key = 'core.workspace.read'
      `;

      expect(workspaceRows).toHaveLength(1);
      expect(contextRows[0]).toMatchObject({
        type: "workspace",
        parent_context_id: null,
      });
      expect(membershipRows[0]).toMatchObject({ role: "administrator" });
      expect(objectRows[0]).toMatchObject({
        module_key: "core",
        object_type: "person",
        context_id: created.rootContextId,
      });
      expect(personRows[0]).toMatchObject({
        user_id: userId,
        object_id: created.personObjectId,
      });
      expect(roleRows).toHaveLength(4);
      expect(roleRows.map((role) => role.system_key)).toEqual([
        "administrator",
        "guest",
        "manager",
        "member",
      ]);
      expect(administratorPermissionRows).toHaveLength(1);
      expect(administratorPermissionRows[0]).toMatchObject({ key: "core.workspace.read" });
    } finally {
      if (workspaceId) {
        await deleteWorkspace(workspaceId);
      }
      await client`delete from users where id = ${userId}`;
    }
  });

  it("rolls back the whole Workspace when membership creation fails", async () => {
    const missingUserId = randomUUID();
    const workspaceName = `Rollback ${randomUUID()}`;

    await expect(
      createWorkspaceForUser(db, {
        userId: missingUserId,
        workspaceName,
        personDisplayName: "Missing User",
      }),
    ).rejects.toThrow();

    const workspaceRows = await client`
      select id from workspaces where name = ${workspaceName}
    `;

    expect(workspaceRows).toHaveLength(0);
  });
});
