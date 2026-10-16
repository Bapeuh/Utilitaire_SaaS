import { randomUUID } from "node:crypto";

import { createDatabase } from "@utilitaire/database";
import { afterAll, describe, expect, it } from "vitest";

import {
  addTeamMember,
  createJobRole,
  createOrganization,
  createTeam,
  listJobRoles,
  listOrganizations,
  listPersons,
  listTeamMembers,
  listTeams,
  removeTeamMember,
} from "./directory.js";
import { createProject, createScope, getProject, getScope, listProjects, listScopes } from "./context-entities.js";
import {
  disableWorkspaceModule,
  enableWorkspaceModule,
  isWorkspaceModuleEnabled,
  listWorkspaceModules,
} from "./module-registry.js";
import { listWorkspaceMembers, updateWorkspaceMemberRole } from "./workspace-members.js";
import { createWorkspaceForUser, listWorkspacesForUser } from "./workspace.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://utilitaire:utilitaire@localhost:5432/utilitaire";

const { client, db } = createDatabase(databaseUrl);

async function cleanupWorkspace(workspaceId: string) {
  await client`delete from workspace_modules where workspace_id = ${workspaceId}`;
  await client`delete from team_access_grants where workspace_id = ${workspaceId}`;
  await client`delete from user_access_grants where workspace_id = ${workspaceId}`;
  await client`delete from access_role_permissions where workspace_id = ${workspaceId}`;
  await client`delete from access_roles where workspace_id = ${workspaceId}`;
  await client`delete from team_members where workspace_id = ${workspaceId}`;
  await client`delete from person_organization_links where workspace_id = ${workspaceId}`;
  await client`delete from teams where workspace_id = ${workspaceId}`;
  await client`delete from organizations where workspace_id = ${workspaceId}`;
  await client`delete from job_roles where workspace_id = ${workspaceId}`;
  await client`delete from projects where workspace_id = ${workspaceId}`;
  await client`delete from scopes where workspace_id = ${workspaceId}`;
  await client`delete from persons where workspace_id = ${workspaceId}`;
  await client`delete from objects where workspace_id = ${workspaceId}`;
  await client`delete from workspace_users where workspace_id = ${workspaceId}`;
  await client`delete from contexts where workspace_id = ${workspaceId}`;
  await client`delete from workspaces where id = ${workspaceId}`;
}

afterAll(async () => {
  await client.end();
});

describe("multi-workspace isolation audit", () => {
  it("keeps workspace, directory, context, module and membership data tenant-scoped", async () => {
    const userAId = randomUUID();
    const userBId = randomUUID();
    const userAEmail = `tenant-a-${randomUUID()}@example.test`;
    const userBEmail = `tenant-b-${randomUUID()}@example.test`;

    await client`
      insert into users (id, name, email, email_verified)
      values
        (${userAId}, 'Tenant A Owner', ${userAEmail}, false),
        (${userBId}, 'Tenant B Owner', ${userBEmail}, false)
    `;

    let workspaceAId: string | undefined;
    let workspaceBId: string | undefined;

    try {
      const workspaceA = await createWorkspaceForUser(db, {
        userId: userAId,
        workspaceName: "Tenant A",
        personDisplayName: "Tenant A Owner",
      });
      workspaceAId = workspaceA.workspaceId;

      const workspaceB = await createWorkspaceForUser(db, {
        userId: userBId,
        workspaceName: "Tenant B",
        personDisplayName: "Tenant B Owner",
      });
      workspaceBId = workspaceB.workspaceId;

      const scopeA = await createScope(db, {
        workspaceId: workspaceA.workspaceId,
        parentContextId: workspaceA.rootContextId,
        name: "A Scope",
      });
      const projectA = await createProject(db, {
        workspaceId: workspaceA.workspaceId,
        parentContextId: scopeA.contextId,
        name: "A Project",
      });
      const scopeB = await createScope(db, {
        workspaceId: workspaceB.workspaceId,
        parentContextId: workspaceB.rootContextId,
        name: "B Scope",
      });

      const organizationA = await createOrganization(db, workspaceA.workspaceId, "A Organization");
      const organizationB = await createOrganization(db, workspaceB.workspaceId, "B Organization");
      const teamA = await createTeam(db, workspaceA.workspaceId, "A Team");
      const teamB = await createTeam(db, workspaceB.workspaceId, "B Team");
      const roleA = await createJobRole(db, workspaceA.workspaceId, "A Role");
      const roleB = await createJobRole(db, workspaceB.workspaceId, "B Role");

      await addTeamMember(db, workspaceA.workspaceId, teamA.id, workspaceA.personId);
      await addTeamMember(db, workspaceB.workspaceId, teamB.id, workspaceB.personId);
      await enableWorkspaceModule(db, workspaceA.workspaceId, "tasks", "1.0.0");
      await enableWorkspaceModule(db, workspaceB.workspaceId, "forms", "1.0.0");

      expect((await listWorkspacesForUser(db, userAId)).map((row) => row.id)).toEqual([workspaceA.workspaceId]);
      expect((await listWorkspacesForUser(db, userBId)).map((row) => row.id)).toEqual([workspaceB.workspaceId]);

      expect(await getScope(db, workspaceB.workspaceId, scopeA.scopeId)).toBeNull();
      expect(await getProject(db, workspaceB.workspaceId, projectA.projectId)).toBeNull();
      expect((await listScopes(db, workspaceB.workspaceId)).map((row) => row.scopeId)).toEqual([scopeB.scopeId]);
      expect(await listProjects(db, workspaceB.workspaceId)).toEqual([]);

      expect((await listOrganizations(db, workspaceA.workspaceId)).map((row) => row.id)).toEqual([organizationA.id]);
      expect((await listOrganizations(db, workspaceB.workspaceId)).map((row) => row.id)).toEqual([organizationB.id]);
      expect((await listTeams(db, workspaceA.workspaceId)).map((row) => row.id)).toEqual([teamA.id]);
      expect((await listTeams(db, workspaceB.workspaceId)).map((row) => row.id)).toEqual([teamB.id]);
      expect((await listJobRoles(db, workspaceA.workspaceId)).map((row) => row.id)).toEqual([roleA.id]);
      expect((await listJobRoles(db, workspaceB.workspaceId)).map((row) => row.id)).toEqual([roleB.id]);
      expect((await listPersons(db, workspaceA.workspaceId)).map((row) => row.id)).toEqual([workspaceA.personId]);
      expect((await listPersons(db, workspaceB.workspaceId)).map((row) => row.id)).toEqual([workspaceB.personId]);
      expect((await listTeamMembers(db, workspaceA.workspaceId, teamA.id)).map((row) => row.personId)).toEqual([workspaceA.personId]);
      expect(await listTeamMembers(db, workspaceB.workspaceId, teamA.id)).toEqual([]);

      await expect(
        addTeamMember(db, workspaceA.workspaceId, teamA.id, workspaceB.personId),
      ).rejects.toBeTruthy();
      await expect(
        addTeamMember(db, workspaceA.workspaceId, teamB.id, workspaceA.personId),
      ).rejects.toBeTruthy();
      expect(await removeTeamMember(db, workspaceB.workspaceId, teamA.id, workspaceA.personId)).toBeNull();

      expect((await listWorkspaceMembers(db, workspaceA.workspaceId)).map((row) => row.userId)).toEqual([userAId]);
      expect((await listWorkspaceMembers(db, workspaceB.workspaceId)).map((row) => row.userId)).toEqual([userBId]);
      expect(await updateWorkspaceMemberRole(db, workspaceB.workspaceId, userAId, "manager")).toBeNull();

      expect((await listWorkspaceModules(db, workspaceA.workspaceId)).map((row) => row.moduleKey)).toEqual(["tasks"]);
      expect((await listWorkspaceModules(db, workspaceB.workspaceId)).map((row) => row.moduleKey)).toEqual(["forms"]);
      expect(await isWorkspaceModuleEnabled(db, workspaceA.workspaceId, "tasks")).toBe(true);
      expect(await isWorkspaceModuleEnabled(db, workspaceB.workspaceId, "tasks")).toBe(false);

      expect(await disableWorkspaceModule(db, workspaceB.workspaceId, "tasks")).toBeNull();
      expect(await isWorkspaceModuleEnabled(db, workspaceA.workspaceId, "tasks")).toBe(true);
    } finally {
      if (workspaceAId) await cleanupWorkspace(workspaceAId);
      if (workspaceBId) await cleanupWorkspace(workspaceBId);
      await client`delete from users where id in (${userAId}, ${userBId})`;
    }
  });
});
