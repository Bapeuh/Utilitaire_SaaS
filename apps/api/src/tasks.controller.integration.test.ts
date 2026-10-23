import { randomUUID } from "node:crypto";

import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { addWorkspaceMemberByEmail, createWorkspaceForUser } from "@utilitaire/core";
import { createTask } from "@utilitaire/tasks";
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

describe("TasksController permissions", () => {
  it("enforces system roles and hides foreign workspaces", async () => {
    const admin = { id: randomUUID(), name: "Tasks Admin", email: `tasks-admin-${randomUUID()}@example.test` };
    const guest = { id: randomUUID(), name: "Tasks Guest", email: `tasks-guest-${randomUUID()}@example.test` };
    const foreign = { id: randomUUID(), name: "Tasks Foreign", email: `tasks-foreign-${randomUUID()}@example.test` };

    await apiDatabaseClient`
      insert into users (id, name, email, email_verified)
      values (${admin.id}, ${admin.name}, ${admin.email}, false),
             (${guest.id}, ${guest.name}, ${guest.email}, false),
             (${foreign.id}, ${foreign.name}, ${foreign.email}, false)
    `;

    const workspaceA = await createWorkspaceForUser(apiDatabase, {
      userId: admin.id,
      workspaceName: "Tasks API A",
      personDisplayName: admin.name,
    });
    const workspaceB = await createWorkspaceForUser(apiDatabase, {
      userId: foreign.id,
      workspaceName: "Tasks API B",
      personDisplayName: foreign.name,
    });
    await addWorkspaceMemberByEmail(apiDatabase, workspaceA.workspaceId, guest.email, "guest");

    try {
      const task = await createTask(
        apiDatabase,
        { workspaceId: workspaceA.workspaceId, contextId: workspaceA.rootContextId, title: "Visible to admin" },
        { actorUserId: admin.id },
      );
      const controller = new TasksController();

      sessionFor(admin);
      const adminRows = await controller.list(request, workspaceA.workspaceId);
      expect(adminRows.map((row) => row.id)).toContain(task.id);
      const created = await controller.create(request, workspaceA.workspaceId, {
        contextId: workspaceA.rootContextId,
        title: "Created via API",
      });
      expect(created.title).toBe("Created via API");

      sessionFor(guest);
      expect(await controller.list(request, workspaceA.workspaceId)).toEqual([]);
      await expect(
        controller.create(request, workspaceA.workspaceId, { contextId: workspaceA.rootContextId, title: "Forbidden" }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      sessionFor(foreign);
      await expect(controller.list(request, workspaceA.workspaceId)).rejects.toBeInstanceOf(NotFoundException);
      await expect(controller.get(request, workspaceA.workspaceId, task.id)).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      await cleanupWorkspace(workspaceA.workspaceId);
      await cleanupWorkspace(workspaceB.workspaceId);
      await apiDatabaseClient`delete from users where id in (${admin.id}, ${guest.id}, ${foreign.id})`;
    }
  });
});
