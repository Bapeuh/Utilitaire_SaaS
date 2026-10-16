import { randomUUID } from "node:crypto";

import { NotFoundException } from "@nestjs/common";
import {
  createProject,
  createScope,
  createTeam,
  createWorkspaceForUser,
  enableWorkspaceModule,
} from "@utilitaire/core";
import type { Request } from "express";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthSessionMock } = vi.hoisted(() => ({
  getAuthSessionMock: vi.fn(),
}));

vi.mock("@utilitaire/auth", () => ({
  getAuthSession: getAuthSessionMock,
}));

import { apiDatabase, apiDatabaseClient } from "./database.js";
import { WorkspacesController } from "./workspaces.controller.js";

const request = { headers: {} } as Request;

async function cleanupWorkspace(workspaceId: string) {
  await apiDatabaseClient`delete from workspace_modules where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from projects where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from scopes where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from team_access_grants where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from user_access_grants where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from access_role_permissions where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from access_roles where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from team_members where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from person_organization_links where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from teams where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from organizations where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from job_roles where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from persons where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from objects where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from workspace_users where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from contexts where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from workspaces where id = ${workspaceId}`;
}

function sessionFor(user: { id: string; name: string; email: string }) {
  getAuthSessionMock.mockResolvedValue({
    user: {
      ...user,
      emailVerified: false,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    session: {
      id: randomUUID(),
      userId: user.id,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

beforeEach(() => {
  getAuthSessionMock.reset();
});

afterAll(async () => {
  await apiDatabaseClient.end();
});

describe("WorkspacesController multi-workspace isolation", () => {
  it("hides foreign workspaces and blocks URL-based tenant bypass before permission synchronization", async () => {
    const userA = {
      id: randomUUID(),
      name: "API Tenant A",
      email: `api-a-${randomUUID()}@example.test`,
    };
    const userB = {
      id: randomUUID(),
      name: "API Tenant B",
      email: `api-b-${randomUUID()}@example.test`,
    };

    await apiDatabaseClient`
      insert into users (id, name, email, email_verified)
      values (${userA.id}, ${userA.name}, ${userA.email}, false),
             (${userB.id}, ${userB.name}, ${userB.email}, false)
    `;

    const workspaceA = await createWorkspaceForUser(apiDatabase, {
      userId: userA.id,
      workspaceName: "API Workspace A",
      personDisplayName: userA.name,
    });
    const workspaceB = await createWorkspaceForUser(apiDatabase, {
      userId: userB.id,
      workspaceName: "API Workspace B",
      personDisplayName: userB.name,
    });

    try {
      const scopeB = await createScope(apiDatabase, {
        workspaceId: workspaceB.workspaceId,
        parentContextId: workspaceB.rootContextId,
        name: "Private B Scope",
      });
      const projectB = await createProject(apiDatabase, {
        workspaceId: workspaceB.workspaceId,
        parentContextId: scopeB.contextId,
        name: "Private B Project",
      });
      const teamB = await createTeam(apiDatabase, workspaceB.workspaceId, "Private B Team");
      await enableWorkspaceModule(apiDatabase, workspaceB.workspaceId, "tasks", "1.0.0");

      const [adminRoleB] = await apiDatabaseClient`
        select id from access_roles
        where workspace_id = ${workspaceB.workspaceId} and system_key = 'administrator' and archived_at is null
        limit 1
      `;
      const [moduleManagePermission] = await apiDatabaseClient`
        select id from permissions where key = 'core.module.manage' limit 1
      `;
      if (!adminRoleB || !moduleManagePermission) throw new Error("Permission fixture missing");

      await apiDatabaseClient`
        delete from access_role_permissions
        where workspace_id = ${workspaceB.workspaceId}
          and access_role_id = ${adminRoleB.id}
          and permission_id = ${moduleManagePermission.id}
      `;

      const controller = new WorkspacesController();
      sessionFor(userA);

      const visibleWorkspaces = await controller.listWorkspaces(request);
      expect(visibleWorkspaces.map((workspace) => workspace.id)).toEqual([workspaceA.workspaceId]);

      await expect(controller.capabilities(request, workspaceB.workspaceId)).rejects.toBeInstanceOf(NotFoundException);
      await expect(controller.listScopes(request, workspaceB.workspaceId)).rejects.toBeInstanceOf(NotFoundException);
      await expect(controller.listProjects(request, workspaceB.workspaceId)).rejects.toBeInstanceOf(NotFoundException);
      await expect(controller.listTeams(request, workspaceB.workspaceId)).rejects.toBeInstanceOf(NotFoundException);
      await expect(controller.listModules(request, workspaceB.workspaceId)).rejects.toBeInstanceOf(NotFoundException);
      await expect(controller.listMembers(request, workspaceB.workspaceId)).rejects.toBeInstanceOf(NotFoundException);

      const missingPermissionAfterForeignRequest = await apiDatabaseClient`
        select id from access_role_permissions
        where workspace_id = ${workspaceB.workspaceId}
          and access_role_id = ${adminRoleB.id}
          and permission_id = ${moduleManagePermission.id}
      `;
      expect(missingPermissionAfterForeignRequest).toHaveLength(0);

      await expect(controller.getScope(request, workspaceA.workspaceId, scopeB.scopeId)).rejects.toBeInstanceOf(NotFoundException);
      await expect(controller.getProject(request, workspaceA.workspaceId, projectB.projectId)).rejects.toBeInstanceOf(NotFoundException);
      expect(await controller.listTeamMembers(request, workspaceA.workspaceId, teamB.id)).toEqual([]);

      sessionFor(userB);
      const capabilitiesB = await controller.capabilities(request, workspaceB.workspaceId);
      expect(capabilitiesB["core.module.manage"]).toBe(true);

      const restoredPermission = await apiDatabaseClient`
        select id from access_role_permissions
        where workspace_id = ${workspaceB.workspaceId}
          and access_role_id = ${adminRoleB.id}
          and permission_id = ${moduleManagePermission.id}
      `;
      expect(restoredPermission).toHaveLength(1);
    } finally {
      await cleanupWorkspace(workspaceA.workspaceId);
      await cleanupWorkspace(workspaceB.workspaceId);
      await apiDatabaseClient`delete from users where id in (${userA.id}, ${userB.id})`;
    }
  });
});
