import { randomUUID } from "node:crypto";

import { createDatabase } from "@utilitaire/database";
import { afterAll, describe, expect, it } from "vitest";

import { createProject, createScope, InvalidParentContextError } from "./context-entities.js";
import { createWorkspaceForUser } from "./workspace.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://utilitaire:utilitaire@localhost:5432/utilitaire";

const { client, db } = createDatabase(databaseUrl);

async function deleteWorkspace(workspaceId: string) {
  await client`delete from projects where workspace_id = ${workspaceId}`;
  await client`delete from scopes where workspace_id = ${workspaceId}`;
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

describe("Core Scope and Project creation", () => {
  it("creates Scope and Project with Context and Object atomically", async () => {
    const userId = randomUUID();
    const email = `context-${randomUUID()}@example.test`;

    await client`
      insert into users (id, name, email, email_verified)
      values (${userId}, 'Context Test User', ${email}, false)
    `;

    let workspaceId: string | undefined;

    try {
      const workspace = await createWorkspaceForUser(db, {
        userId,
        workspaceName: "Context integration workspace",
        personDisplayName: "Context Test User",
      });
      workspaceId = workspace.workspaceId;

      const scope = await createScope(db, {
        workspaceId: workspace.workspaceId,
        parentContextId: workspace.rootContextId,
        name: "Operations",
      });

      const project = await createProject(db, {
        workspaceId: workspace.workspaceId,
        parentContextId: scope.contextId,
        name: "Launch",
      });

      const scopeRows = await client`
        select s.id, s.context_id, s.object_id, c.type, c.parent_context_id, o.object_type
        from scopes s
        join contexts c on c.id = s.context_id
        join objects o on o.id = s.object_id
        where s.id = ${scope.scopeId}
      `;
      const projectRows = await client`
        select p.id, p.context_id, p.object_id, c.type, c.parent_context_id, o.object_type
        from projects p
        join contexts c on c.id = p.context_id
        join objects o on o.id = p.object_id
        where p.id = ${project.projectId}
      `;

      expect(scopeRows[0]).toMatchObject({
        context_id: scope.contextId,
        object_id: scope.objectId,
        type: "scope",
        parent_context_id: workspace.rootContextId,
        object_type: "scope",
      });
      expect(projectRows[0]).toMatchObject({
        context_id: project.contextId,
        object_id: project.objectId,
        type: "project",
        parent_context_id: scope.contextId,
        object_type: "project",
      });
    } finally {
      if (workspaceId) {
        await deleteWorkspace(workspaceId);
      }
      await client`delete from users where id = ${userId}`;
    }
  });

  it("rejects a parent Context from another Workspace", async () => {
    const userId = randomUUID();
    const email = `context-cross-${randomUUID()}@example.test`;

    await client`
      insert into users (id, name, email, email_verified)
      values (${userId}, 'Cross Workspace User', ${email}, false)
    `;

    let firstWorkspaceId: string | undefined;
    let secondWorkspaceId: string | undefined;

    try {
      const first = await createWorkspaceForUser(db, {
        userId,
        workspaceName: "First workspace",
        personDisplayName: "Cross Workspace User",
      });
      firstWorkspaceId = first.workspaceId;

      const second = await createWorkspaceForUser(db, {
        userId,
        workspaceName: "Second workspace",
        personDisplayName: "Cross Workspace User",
      });
      secondWorkspaceId = second.workspaceId;

      await expect(
        createScope(db, {
          workspaceId: first.workspaceId,
          parentContextId: second.rootContextId,
          name: "Forbidden scope",
        }),
      ).rejects.toBeInstanceOf(InvalidParentContextError);
    } finally {
      if (firstWorkspaceId) await deleteWorkspace(firstWorkspaceId);
      if (secondWorkspaceId) await deleteWorkspace(secondWorkspaceId);
      await client`delete from users where id = ${userId}`;
    }
  });
});
