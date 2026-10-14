import { randomUUID } from "node:crypto";

import { createDatabase } from "@utilitaire/database";
import { afterAll, describe, expect, it } from "vitest";

import { createWorkspaceForUser } from "./workspace.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://utilitaire:utilitaire@localhost:5432/utilitaire";

const { client, db } = createDatabase(databaseUrl);

async function deleteWorkspace(workspaceId: string) {
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
  it("creates Workspace, root Context, administrator membership, Object and Person atomically", async () => {
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
