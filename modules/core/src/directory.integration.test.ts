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
import {
  disableWorkspaceModule,
  enableWorkspaceModule,
  isWorkspaceModuleEnabled,
  listWorkspaceModules,
} from "./module-registry.js";
import { createWorkspaceForUser } from "./workspace.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://utilitaire:utilitaire@localhost:5432/utilitaire";

const { client, db } = createDatabase(databaseUrl);

async function cleanup(workspaceId: string, userId: string) {
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
  await client`delete from persons where workspace_id = ${workspaceId}`;
  await client`delete from objects where workspace_id = ${workspaceId}`;
  await client`delete from workspace_users where workspace_id = ${workspaceId}`;
  await client`delete from contexts where workspace_id = ${workspaceId}`;
  await client`delete from workspaces where id = ${workspaceId}`;
  await client`delete from users where id = ${userId}`;
}

afterAll(async () => {
  await client.end();
});

describe("Core directory and module registry", () => {
  it("creates and lists organizations, teams, people, team members and job roles", async () => {
    const userId = randomUUID();
    const email = `directory-${randomUUID()}@example.test`;
    await client`insert into users (id, name, email, email_verified) values (${userId}, 'Directory User', ${email}, false)`;

    const created = await createWorkspaceForUser(db, {
      userId,
      workspaceName: "Directory workspace",
      personDisplayName: "Directory User",
    });

    try {
      const organization = await createOrganization(db, created.workspaceId, "Backlight");
      const team = await createTeam(db, created.workspaceId, "Operations");
      const role = await createJobRole(db, created.workspaceId, "Operator");
      const membership = await addTeamMember(db, created.workspaceId, team.id, created.personId);

      expect(organization.objectId).toBeTruthy();
      expect(team.objectId).toBeTruthy();
      expect(role.name).toBe("Operator");
      expect(membership.personId).toBe(created.personId);

      expect((await listOrganizations(db, created.workspaceId)).map((row) => row.name)).toEqual(["Backlight"]);
      expect((await listTeams(db, created.workspaceId)).map((row) => row.name)).toEqual(["Operations"]);
      expect((await listJobRoles(db, created.workspaceId)).map((row) => row.name)).toEqual(["Operator"]);
      expect(await listPersons(db, created.workspaceId)).toEqual([
        expect.objectContaining({ id: created.personId, displayName: "Directory User", userId }),
      ]);
      expect(await listTeamMembers(db, created.workspaceId, team.id)).toEqual([
        expect.objectContaining({ personId: created.personId, displayName: "Directory User" }),
      ]);

      const removed = await removeTeamMember(db, created.workspaceId, team.id, created.personId);
      expect(removed?.id).toBe(membership.id);
      expect(removed?.archivedAt).toBeInstanceOf(Date);
      expect(await listTeamMembers(db, created.workspaceId, team.id)).toEqual([]);

      const reactivated = await addTeamMember(db, created.workspaceId, team.id, created.personId);
      expect(reactivated.id).toBe(membership.id);
      expect(reactivated.archivedAt).toBeNull();
      expect(await listTeamMembers(db, created.workspaceId, team.id)).toHaveLength(1);
    } finally {
      await cleanup(created.workspaceId, userId);
    }
  });

  it("enables, disables and re-enables a workspace module without deleting its row", async () => {
    const userId = randomUUID();
    const email = `module-${randomUUID()}@example.test`;
    await client`insert into users (id, name, email, email_verified) values (${userId}, 'Module User', ${email}, false)`;

    const created = await createWorkspaceForUser(db, {
      userId,
      workspaceName: "Module workspace",
      personDisplayName: "Module User",
    });

    try {
      const first = await enableWorkspaceModule(db, created.workspaceId, "tasks", "1.0.0");
      expect(await isWorkspaceModuleEnabled(db, created.workspaceId, "tasks")).toBe(true);

      const disabled = await disableWorkspaceModule(db, created.workspaceId, "tasks");
      expect(disabled?.status).toBe("disabled");
      expect(await isWorkspaceModuleEnabled(db, created.workspaceId, "tasks")).toBe(false);

      const reenabled = await enableWorkspaceModule(db, created.workspaceId, "tasks", "1.1.0");
      expect(reenabled?.id).toBe(first.id);
      expect(reenabled?.installedVersion).toBe("1.1.0");
      expect(await listWorkspaceModules(db, created.workspaceId)).toHaveLength(1);
    } finally {
      await cleanup(created.workspaceId, userId);
    }
  });
});
