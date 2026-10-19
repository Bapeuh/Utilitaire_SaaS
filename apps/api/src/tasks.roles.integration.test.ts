import { randomUUID } from "node:crypto";

import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { addWorkspaceMemberByEmail, createWorkspaceForUser } from "@utilitaire/core";
import type { Request } from "express";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthSessionMock } = vi.hoisted(() => ({ getAuthSessionMock: vi.fn() }));

vi.mock("@utilitaire/auth", () => ({ getAuthSession: getAuthSessionMock }));

import { apiDatabase, apiDatabaseClient } from "./database.js";
import { TasksController } from "./tasks.controller.js";

const request = { headers: {} } as Request;

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

async function cleanupWorkspace(workspaceId: string) {
  await apiDatabaseClient`delete from notifications where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from object_relations where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from tag_links where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from tags where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from file_links where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from files where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from comments where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from task_checklist_items where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from task_person_assignments where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from task_team_assignments where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from activities where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from outbox_deliveries where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from processed_events where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from outbox_events where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from tasks where workspace_id = ${workspaceId}`;
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

beforeEach(() => getAuthSessionMock.mockReset());
afterAll(async () => apiDatabaseClient.end());

describe("TasksController role matrix", () => {
  it("matches Administrator / Manager / Member / Guest defaults and hides foreign workspaces", async () => {
    const admin = { id: randomUUID(), name: "Role Admin", email: `role-admin-${randomUUID()}@example.test` };
    const manager = { id: randomUUID(), name: "Role Manager", email: `role-manager-${randomUUID()}@example.test` };
    const member = { id: randomUUID(), name: "Role Member", email: `role-member-${randomUUID()}@example.test` };
    const guest = { id: randomUUID(), name: "Role Guest", email: `role-guest-${randomUUID()}@example.test` };
    const foreign = { id: randomUUID(), name: "Role Foreign", email: `role-foreign-${randomUUID()}@example.test` };

    await apiDatabaseClient`
      insert into users (id, name, email, email_verified)
      values (${admin.id}, ${admin.name}, ${admin.email}, false),
             (${manager.id}, ${manager.name}, ${manager.email}, false),
             (${member.id}, ${member.name}, ${member.email}, false),
             (${guest.id}, ${guest.name}, ${guest.email}, false),
             (${foreign.id}, ${foreign.name}, ${foreign.email}, false)
    `;

    const workspaceA = await createWorkspaceForUser(apiDatabase, {
      userId: admin.id,
      workspaceName: "Tasks roles A",
      personDisplayName: admin.name,
    });
    const workspaceB = await createWorkspaceForUser(apiDatabase, {
      userId: foreign.id,
      workspaceName: "Tasks roles B",
      personDisplayName: foreign.name,
    });
    await addWorkspaceMemberByEmail(apiDatabase, workspaceA.workspaceId, manager.email, "manager");
    await addWorkspaceMemberByEmail(apiDatabase, workspaceA.workspaceId, member.email, "member");
    await addWorkspaceMemberByEmail(apiDatabase, workspaceA.workspaceId, guest.email, "guest");

    const controller = new TasksController();

    try {
      sessionFor(admin);
      const adminTask = await controller.create(request, workspaceA.workspaceId, {
        contextId: workspaceA.rootContextId,
        title: "Admin task",
      });
      expect((await controller.archive(request, workspaceA.workspaceId, adminTask.id)).archivedAt).not.toBeNull();

      sessionFor(manager);
      const managerTask = await controller.create(request, workspaceA.workspaceId, {
        contextId: workspaceA.rootContextId,
        title: "Manager task",
      });
      expect((await controller.archive(request, workspaceA.workspaceId, managerTask.id)).archivedAt).not.toBeNull();

      sessionFor(member);
      const memberTask = await controller.create(request, workspaceA.workspaceId, {
        contextId: workspaceA.rootContextId,
        title: "Member task",
      });
      expect((await controller.update(request, workspaceA.workspaceId, memberTask.id, { title: "Member updated" })).title).toBe("Member updated");
      await expect(controller.archive(request, workspaceA.workspaceId, memberTask.id)).rejects.toBeInstanceOf(ForbiddenException);
      expect((await controller.list(request, workspaceA.workspaceId)).map((row) => row.id)).toContain(memberTask.id);

      sessionFor(guest);
      expect(await controller.list(request, workspaceA.workspaceId)).toEqual([]);
      await expect(controller.create(request, workspaceA.workspaceId, {
        contextId: workspaceA.rootContextId,
        title: "Guest forbidden",
      })).rejects.toBeInstanceOf(ForbiddenException);

      sessionFor(foreign);
      await expect(controller.list(request, workspaceA.workspaceId)).rejects.toBeInstanceOf(NotFoundException);
      await expect(controller.get(request, workspaceA.workspaceId, memberTask.id)).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      await cleanupWorkspace(workspaceA.workspaceId);
      await cleanupWorkspace(workspaceB.workspaceId);
      await apiDatabaseClient`delete from users where id in (${admin.id}, ${manager.id}, ${member.id}, ${guest.id}, ${foreign.id})`;
    }
  });
});
