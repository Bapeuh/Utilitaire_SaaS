import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createDatabase } from "./client.js";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://utilitaire:utilitaire@localhost:5432/utilitaire";

const { client } = createDatabase(connectionString);

async function createWorkspace(name: string) {
  const id = randomUUID();
  await client`insert into workspaces (id, name) values (${id}, ${name})`;
  return id;
}

async function createRootContext(workspaceId: string) {
  const id = randomUUID();
  await client`
    insert into contexts (id, workspace_id, type, parent_context_id)
    values (${id}, ${workspaceId}, 'workspace', null)
  `;
  return id;
}

async function cleanupWorkspace(workspaceId: string) {
  await client`delete from projects where workspace_id = ${workspaceId}`;
  await client`delete from scopes where workspace_id = ${workspaceId}`;
  await client`delete from objects where workspace_id = ${workspaceId}`;
  await client`delete from contexts where workspace_id = ${workspaceId}`;
  await client`delete from workspaces where id = ${workspaceId}`;
}

afterAll(async () => {
  await client.end();
});

describe.sequential("Core database integrity", () => {
  it("rejects a second workspace root context", async () => {
    const workspaceId = await createWorkspace("Integrity root uniqueness");

    try {
      await createRootContext(workspaceId);

      await expect(
        createRootContext(workspaceId),
      ).rejects.toMatchObject({ code: "23505" });
    } finally {
      await cleanupWorkspace(workspaceId);
    }
  });

  it("rejects a context parent from another workspace", async () => {
    const workspaceA = await createWorkspace("Integrity workspace A");
    const workspaceB = await createWorkspace("Integrity workspace B");

    try {
      const rootA = await createRootContext(workspaceA);
      await createRootContext(workspaceB);

      await expect(
        client`
          insert into contexts (id, workspace_id, type, parent_context_id)
          values (${randomUUID()}, ${workspaceB}, 'scope', ${rootA})
        `,
      ).rejects.toMatchObject({ code: "23503" });
    } finally {
      await cleanupWorkspace(workspaceA);
      await cleanupWorkspace(workspaceB);
    }
  });

  it("rejects a self-referencing context", async () => {
    const workspaceId = await createWorkspace("Integrity self reference");
    const contextId = randomUUID();

    try {
      await expect(
        client`
          insert into contexts (id, workspace_id, type, parent_context_id)
          values (${contextId}, ${workspaceId}, 'scope', ${contextId})
        `,
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await cleanupWorkspace(workspaceId);
    }
  });

  it("rejects Scope references crossing workspace boundaries", async () => {
    const workspaceA = await createWorkspace("Integrity scope A");
    const workspaceB = await createWorkspace("Integrity scope B");

    try {
      const contextA = await createRootContext(workspaceA);
      const contextB = await createRootContext(workspaceB);
      const objectA = randomUUID();

      await client`
        insert into objects (id, workspace_id, context_id, module_key, object_type)
        values (${objectA}, ${workspaceA}, ${contextA}, 'core', 'scope')
      `;

      await expect(
        client`
          insert into scopes (workspace_id, context_id, object_id, name)
          values (${workspaceB}, ${contextB}, ${objectA}, 'Cross-workspace scope')
        `,
      ).rejects.toMatchObject({ code: "23503" });
    } finally {
      await cleanupWorkspace(workspaceA);
      await cleanupWorkspace(workspaceB);
    }
  });

  it("rejects Project references crossing workspace boundaries", async () => {
    const workspaceA = await createWorkspace("Integrity project A");
    const workspaceB = await createWorkspace("Integrity project B");

    try {
      const contextA = await createRootContext(workspaceA);
      const contextB = await createRootContext(workspaceB);
      const objectA = randomUUID();

      await client`
        insert into objects (id, workspace_id, context_id, module_key, object_type)
        values (${objectA}, ${workspaceA}, ${contextA}, 'core', 'project')
      `;

      await expect(
        client`
          insert into projects (workspace_id, context_id, object_id, name)
          values (${workspaceB}, ${contextB}, ${objectA}, 'Cross-workspace project')
        `,
      ).rejects.toMatchObject({ code: "23503" });
    } finally {
      await cleanupWorkspace(workspaceA);
      await cleanupWorkspace(workspaceB);
    }
  });
});
