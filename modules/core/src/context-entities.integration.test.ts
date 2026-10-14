import { randomUUID } from "node:crypto";

import { createDatabase } from "@utilitaire/database";
import { afterAll, describe, expect, it } from "vitest";

import {
  createProject,
  createScope,
  getProject,
  getScope,
  InvalidParentContextError,
  listProjects,
  listScopes,
} from "./context-entities.js";
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

  it("lists and reads active Scopes and Projects inside one Workspace", async () => {
    const userId = randomUUID();
    const email = `context-read-${randomUUID()}@example.test`;

    await client`
      insert into users (id, name, email, email_verified)
      values (${userId}, 'Context Read User', ${email}, false)
    `;

    let workspaceId: string | undefined;

    try {
      const workspace = await createWorkspaceForUser(db, {
        userId,
        workspaceName: "Read integration workspace",
        personDisplayName: "Context Read User",
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

      const scopeList = await listScopes(db, workspace.workspaceId);
      const projectList = await listProjects(db, workspace.workspaceId);
      const scopeDetail = await getScope(db, workspace.workspaceId, scope.scopeId);
      const projectDetail = await getProject(db, workspace.workspaceId, project.projectId);

      expect(scopeList).toHaveLength(1);
      expect(scopeList[0]).toMatchObject({
        scopeId: scope.scopeId,
        contextId: scope.contextId,
        objectId: scope.objectId,
        parentContextId: workspace.rootContextId,
        name: "Operations",
      });
      expect(projectList).toHaveLength(1);
      expect(projectList[0]).toMatchObject({
        projectId: project.projectId,
        contextId: project.contextId,
        objectId: project.objectId,
        parentContextId: scope.contextId,
        name: "Launch",
      });
      expect(scopeDetail).toMatchObject({ scopeId: scope.scopeId, name: "Operations" });
      expect(projectDetail).toMatchObject({ projectId: project.projectId, name: "Launch" });
    } finally {
      if (workspaceId) await deleteWorkspace(workspaceId);
      await client`delete from users where id = ${userId}`;
    }
  });

  it("does not read Scope or Project through another Workspace id", async () => {
    const userId = randomUUID();
    const email = `context-isolation-${randomUUID()}@example.test`;

    await client`
      insert into users (id, name, email, email_verified)
      values (${userId}, 'Isolation User', ${email}, false)
    `;

    let firstWorkspaceId: string | undefined;
    let secondWorkspaceId: string | undefined;

    try {
      const first = await createWorkspaceForUser(db, {
        userId,
        workspaceName: "Isolation first",
        personDisplayName: "Isolation User",
      });
      firstWorkspaceId = first.workspaceId;
      const second = await createWorkspaceForUser(db, {
        userId,
        workspaceName: "Isolation second",
        personDisplayName: "Isolation User",
      });
      secondWorkspaceId = second.workspaceId;

      const scope = await createScope(db, {
        workspaceId: first.workspaceId,
        parentContextId: first.rootContextId,
        name: "Private scope",
      });
      const project = await createProject(db, {
        workspaceId: first.workspaceId,
        parentContextId: scope.contextId,
        name: "Private project",
      });

      expect(await getScope(db, second.workspaceId, scope.scopeId)).toBeNull();
      expect(await getProject(db, second.workspaceId, project.projectId)).toBeNull();
      expect(await listScopes(db, second.workspaceId)).toHaveLength(0);
      expect(await listProjects(db, second.workspaceId)).toHaveLength(0);
    } finally {
      if (firstWorkspaceId) await deleteWorkspace(firstWorkspaceId);
      if (secondWorkspaceId) await deleteWorkspace(secondWorkspaceId);
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
