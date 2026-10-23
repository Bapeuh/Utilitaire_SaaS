import { randomUUID } from "node:crypto";

import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { addWorkspaceMemberByEmail, createWorkspaceForUser } from "@utilitaire/core";
import { createTask } from "@utilitaire/tasks";
import { createNotification } from "@utilitaire/transverse";
import type { Request } from "express";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthSessionMock } = vi.hoisted(() => ({ getAuthSessionMock: vi.fn() }));

vi.mock("@utilitaire/auth", () => ({ getAuthSession: getAuthSessionMock }));

import { apiDatabase, apiDatabaseClient } from "./database.js";
import { NotificationsController, TaskTransverseController } from "./task-transverse.controller.js";

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

describe("Task transverse API hardening", () => {
  it("enforces task permissions, relation visibility, tenant isolation and notification user scoping", async () => {
    const admin = { id: randomUUID(), name: "Transverse Admin", email: `transverse-admin-${randomUUID()}@example.test` };
    const member = { id: randomUUID(), name: "Transverse Member", email: `transverse-member-${randomUUID()}@example.test` };
    const guest = { id: randomUUID(), name: "Transverse Guest", email: `transverse-guest-${randomUUID()}@example.test` };
    const foreign = { id: randomUUID(), name: "Transverse Foreign", email: `transverse-foreign-${randomUUID()}@example.test` };

    await apiDatabaseClient`
      insert into users (id, name, email, email_verified)
      values (${admin.id}, ${admin.name}, ${admin.email}, false),
             (${member.id}, ${member.name}, ${member.email}, false),
             (${guest.id}, ${guest.name}, ${guest.email}, false),
             (${foreign.id}, ${foreign.name}, ${foreign.email}, false)
    `;

    const workspaceA = await createWorkspaceForUser(apiDatabase, {
      userId: admin.id,
      workspaceName: "Transverse API A",
      personDisplayName: admin.name,
    });
    const workspaceB = await createWorkspaceForUser(apiDatabase, {
      userId: foreign.id,
      workspaceName: "Transverse API B",
      personDisplayName: foreign.name,
    });
    await addWorkspaceMemberByEmail(apiDatabase, workspaceA.workspaceId, member.email, "member");
    await addWorkspaceMemberByEmail(apiDatabase, workspaceA.workspaceId, guest.email, "guest");

    try {
      const task = await createTask(
        apiDatabase,
        { workspaceId: workspaceA.workspaceId, contextId: workspaceA.rootContextId, title: "Task with transverse data" },
        { actorUserId: admin.id },
      );
      const targetTask = await createTask(
        apiDatabase,
        { workspaceId: workspaceA.workspaceId, contextId: workspaceA.rootContextId, title: "Readable relation target" },
        { actorUserId: admin.id },
      );
      const foreignTask = await createTask(
        apiDatabase,
        { workspaceId: workspaceB.workspaceId, contextId: workspaceB.rootContextId, title: "Foreign relation target" },
        { actorUserId: foreign.id },
      );
      const transverse = new TaskTransverseController();
      const notifications = new NotificationsController();

      sessionFor(member);
      const comment = await transverse.addComment(request, workspaceA.workspaceId, task.id, { body: "Member comment" });
      expect(comment.body).toBe("Member comment");
      await transverse.addTag(request, workspaceA.workspaceId, task.id, { name: "important" });
      expect((await transverse.comments(request, workspaceA.workspaceId, task.id)).map((row) => row.id)).toContain(comment.id);

      const relation = await transverse.addRelation(request, workspaceA.workspaceId, task.id, {
        targetObjectId: targetTask.objectId,
        relationType: "related_to",
      });
      expect((await transverse.relations(request, workspaceA.workspaceId, task.id)).map((row) => row.id)).toContain(relation.id);
      await expect(transverse.addRelation(request, workspaceA.workspaceId, task.id, {
        targetObjectId: foreignTask.objectId,
        relationType: "related_to",
      })).rejects.toBeInstanceOf(BadRequestException);

      sessionFor(guest);
      await expect(transverse.comments(request, workspaceA.workspaceId, task.id)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(transverse.addComment(request, workspaceA.workspaceId, task.id, { body: "Forbidden" })).rejects.toBeInstanceOf(ForbiddenException);

      sessionFor(foreign);
      await expect(transverse.comments(request, workspaceA.workspaceId, task.id)).rejects.toBeInstanceOf(NotFoundException);

      const adminNotification = await createNotification(apiDatabase, {
        workspaceId: workspaceA.workspaceId,
        userId: admin.id,
        sourceObjectId: task.objectId,
        type: "test.admin",
        title: "Admin only",
      });
      const memberNotification = await createNotification(apiDatabase, {
        workspaceId: workspaceA.workspaceId,
        userId: member.id,
        sourceObjectId: task.objectId,
        type: "test.member",
        title: "Member only",
      });

      sessionFor(member);
      const memberRows = await notifications.list(request, workspaceA.workspaceId);
      expect(memberRows.map((row) => row.id)).toContain(memberNotification.id);
      expect(memberRows.map((row) => row.id)).not.toContain(adminNotification.id);
      await expect(notifications.read(request, workspaceA.workspaceId, adminNotification.id)).rejects.toBeInstanceOf(NotFoundException);
      expect((await notifications.read(request, workspaceA.workspaceId, memberNotification.id)).readAt).not.toBeNull();
    } finally {
      await cleanupWorkspace(workspaceA.workspaceId);
      await cleanupWorkspace(workspaceB.workspaceId);
      await apiDatabaseClient`delete from users where id in (${admin.id}, ${member.id}, ${guest.id}, ${foreign.id})`;
    }
  });
});
