import { randomUUID } from "node:crypto";

import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { addWorkspaceMemberByEmail, createWorkspaceForUser } from "@utilitaire/core";
import type { Request } from "express";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthSessionMock } = vi.hoisted(() => ({ getAuthSessionMock: vi.fn() }));
vi.mock("@utilitaire/auth", () => ({ getAuthSession: getAuthSessionMock }));

import { apiDatabase, apiDatabaseClient } from "./database.js";
import { TaskMilestonesController, TaskPhasesController, TaskPlanningController } from "./task-planning.controller.js";
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
  await apiDatabaseClient`delete from task_dependencies where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from task_milestone_links where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from task_checklist_items where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from task_person_assignments where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from task_team_assignments where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`update tasks set phase_id = null where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from task_milestones where workspace_id = ${workspaceId}`;
  await apiDatabaseClient`delete from task_phases where workspace_id = ${workspaceId}`;
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

describe("Project planning API role matrix", () => {
  it("enforces planning permissions and tenant isolation", async () => {
    const admin = { id: randomUUID(), name: "Planning Admin", email: `planning-admin-${randomUUID()}@example.test` };
    const member = { id: randomUUID(), name: "Planning Member", email: `planning-member-${randomUUID()}@example.test` };
    const guest = { id: randomUUID(), name: "Planning Guest", email: `planning-guest-${randomUUID()}@example.test` };
    const foreign = { id: randomUUID(), name: "Planning Foreign", email: `planning-foreign-${randomUUID()}@example.test` };

    await apiDatabaseClient`
      insert into users (id, name, email, email_verified)
      values (${admin.id}, ${admin.name}, ${admin.email}, false),
             (${member.id}, ${member.name}, ${member.email}, false),
             (${guest.id}, ${guest.name}, ${guest.email}, false),
             (${foreign.id}, ${foreign.name}, ${foreign.email}, false)
    `;

    const workspaceA = await createWorkspaceForUser(apiDatabase, {
      userId: admin.id,
      workspaceName: "Planning roles A",
      personDisplayName: admin.name,
    });
    const workspaceB = await createWorkspaceForUser(apiDatabase, {
      userId: foreign.id,
      workspaceName: "Planning roles B",
      personDisplayName: foreign.name,
    });
    await addWorkspaceMemberByEmail(apiDatabase, workspaceA.workspaceId, member.email, "member");
    await addWorkspaceMemberByEmail(apiDatabase, workspaceA.workspaceId, guest.email, "guest");

    const tasks = new TasksController();
    const phases = new TaskPhasesController();
    const milestones = new TaskMilestonesController();
    const planning = new TaskPlanningController();

    try {
      sessionFor(member);
      const phase = await phases.create(request, workspaceA.workspaceId, {
        contextId: workspaceA.rootContextId,
        name: "Member phase",
      });
      const milestone = await milestones.create(request, workspaceA.workspaceId, {
        contextId: workspaceA.rootContextId,
        name: "Member milestone",
        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
      const taskA = await tasks.create(request, workspaceA.workspaceId, {
        contextId: workspaceA.rootContextId,
        title: "Dependency predecessor",
      });
      const taskB = await tasks.create(request, workspaceA.workspaceId, {
        contextId: workspaceA.rootContextId,
        title: "Dependency successor",
      });

      await planning.linkMilestone(request, workspaceA.workspaceId, taskA.id, { milestoneId: milestone.id });
      const dependency = await planning.addDependency(request, workspaceA.workspaceId, taskA.id, {
        predecessorTaskId: taskA.id,
        successorTaskId: taskB.id,
      });
      expect(dependency.dependencyType).toBe("finish_start");
      expect(await phases.get(request, workspaceA.workspaceId, phase.id)).toMatchObject({ id: phase.id });
      expect(await milestones.get(request, workspaceA.workspaceId, milestone.id)).toMatchObject({ id: milestone.id });
      await expect(phases.archive(request, workspaceA.workspaceId, phase.id)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(milestones.archive(request, workspaceA.workspaceId, milestone.id)).rejects.toBeInstanceOf(ForbiddenException);

      sessionFor(admin);
      expect((await planning.dependencies(request, workspaceA.workspaceId, taskA.id))[0]).toMatchObject({
        id: dependency.id,
        predecessor: { hidden: false, id: taskA.id },
        successor: { hidden: false, id: taskB.id },
      });
      expect((await phases.archive(request, workspaceA.workspaceId, phase.id)).archivedAt).not.toBeNull();
      expect((await milestones.archive(request, workspaceA.workspaceId, milestone.id)).archivedAt).not.toBeNull();

      sessionFor(guest);
      expect(await phases.list(request, workspaceA.workspaceId)).toEqual([]);
      expect(await milestones.list(request, workspaceA.workspaceId)).toEqual([]);

      sessionFor(foreign);
      await expect(phases.get(request, workspaceA.workspaceId, phase.id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(planning.dependencies(request, workspaceA.workspaceId, taskA.id)).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      await cleanupWorkspace(workspaceA.workspaceId);
      await cleanupWorkspace(workspaceB.workspaceId);
      await apiDatabaseClient`delete from users where id in (${admin.id}, ${member.id}, ${guest.id}, ${foreign.id})`;
    }
  });
});
