import { randomUUID } from "node:crypto";

import {
  activities,
  contexts,
  createDatabase,
  objects,
  outboxEvents,
  taskMilestoneLinks,
  taskMilestones,
  taskPhases,
  tasks,
  workspaces,
} from "@utilitaire/database";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import {
  archiveMilestone,
  archivePhase,
  createMilestone,
  createPhase,
  createTask,
  InvalidMilestoneError,
  InvalidPhaseError,
  linkTaskMilestone,
  listTaskMilestones,
  moveTaskSubtree,
  setTaskPhase,
} from "./index.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://utilitaire:utilitaire@localhost:5432/utilitaire";
const { db, client } = createDatabase(databaseUrl);

async function createWorkspaceFixture(name: string) {
  const [workspace] = await db.insert(workspaces).values({ name }).returning({ id: workspaces.id });
  if (!workspace) throw new Error("Workspace fixture failed");
  const [rootContext] = await db
    .insert(contexts)
    .values({ workspaceId: workspace.id, type: "workspace", parentContextId: null })
    .returning({ id: contexts.id });
  if (!rootContext) throw new Error("Root Context fixture failed");
  const [projectContext] = await db
    .insert(contexts)
    .values({ workspaceId: workspace.id, type: "project", parentContextId: rootContext.id })
    .returning({ id: contexts.id });
  if (!projectContext) throw new Error("Project Context fixture failed");
  return { workspaceId: workspace.id, rootContextId: rootContext.id, projectContextId: projectContext.id };
}

async function cleanupWorkspace(workspaceId: string) {
  await db.delete(taskMilestoneLinks).where(eq(taskMilestoneLinks.workspaceId, workspaceId));
  await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
  await db.delete(taskMilestones).where(eq(taskMilestones.workspaceId, workspaceId));
  await db.delete(taskPhases).where(eq(taskPhases.workspaceId, workspaceId));
  await db.delete(activities).where(eq(activities.workspaceId, workspaceId));
  await db.delete(outboxEvents).where(eq(outboxEvents.workspaceId, workspaceId));
  await db.delete(objects).where(eq(objects.workspaceId, workspaceId));
  await db.delete(contexts).where(eq(contexts.workspaceId, workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
}

afterAll(async () => client.end());

describe("Tasks planning domain", () => {
  it("keeps Phase and Milestone links tenant-safe and Context-safe across subtree moves", async () => {
    const a = await createWorkspaceFixture(`Planning A ${randomUUID()}`);
    const b = await createWorkspaceFixture(`Planning B ${randomUUID()}`);

    try {
      const rootPhase = await createPhase(db, {
        workspaceId: a.workspaceId,
        contextId: a.rootContextId,
        name: "Preparation",
        position: 1,
      });
      const foreignPhase = await createPhase(db, {
        workspaceId: b.workspaceId,
        contextId: b.rootContextId,
        name: "Foreign phase",
      });
      const milestone = await createMilestone(db, {
        workspaceId: a.workspaceId,
        contextId: a.rootContextId,
        name: "Approval",
        dueAt: new Date("2026-11-15T12:00:00Z"),
      });
      const foreignMilestone = await createMilestone(db, {
        workspaceId: b.workspaceId,
        contextId: b.rootContextId,
        name: "Foreign milestone",
        dueAt: new Date("2026-11-20T12:00:00Z"),
      });

      const parent = await createTask(db, {
        workspaceId: a.workspaceId,
        contextId: a.rootContextId,
        title: "Parent planning task",
      });
      const child = await createTask(db, {
        workspaceId: a.workspaceId,
        contextId: a.rootContextId,
        parentTaskId: parent.id,
        title: "Child planning task",
      });

      await setTaskPhase(db, a.workspaceId, parent.id, rootPhase.id);
      await setTaskPhase(db, a.workspaceId, child.id, rootPhase.id);
      await linkTaskMilestone(db, a.workspaceId, parent.id, milestone.id);
      await linkTaskMilestone(db, a.workspaceId, child.id, milestone.id);

      await expect(setTaskPhase(db, a.workspaceId, parent.id, foreignPhase.id)).rejects.toBeInstanceOf(InvalidPhaseError);
      await expect(linkTaskMilestone(db, a.workspaceId, parent.id, foreignMilestone.id)).rejects.toBeInstanceOf(InvalidMilestoneError);

      const beforeMoveLinks = await listTaskMilestones(db, a.workspaceId, parent.id);
      expect(beforeMoveLinks).toHaveLength(1);

      const moved = await moveTaskSubtree(db, a.workspaceId, parent.id, a.projectContextId);
      expect(moved?.movedTaskIds.sort()).toEqual([parent.id, child.id].sort());
      expect(moved?.detachedPhaseTaskIds.sort()).toEqual([parent.id, child.id].sort());
      expect(moved?.archivedMilestoneLinkIds).toHaveLength(2);

      const movedTasks = await db
        .select({ id: tasks.id, contextId: tasks.contextId, phaseId: tasks.phaseId })
        .from(tasks)
        .where(and(eq(tasks.workspaceId, a.workspaceId), eq(tasks.contextId, a.projectContextId)));
      expect(movedTasks).toHaveLength(2);
      expect(movedTasks.every((row) => row.phaseId === null)).toBe(true);

      const activeLinks = await db
        .select()
        .from(taskMilestoneLinks)
        .where(and(eq(taskMilestoneLinks.workspaceId, a.workspaceId), eq(taskMilestoneLinks.taskId, parent.id)));
      expect(activeLinks).toHaveLength(1);
      expect(activeLinks[0]?.archivedAt).toBeTruthy();

      const [phaseObject] = await db
        .select({ moduleKey: objects.moduleKey, objectType: objects.objectType })
        .from(objects)
        .where(and(eq(objects.workspaceId, a.workspaceId), eq(objects.id, rootPhase.objectId)));
      expect(phaseObject).toEqual({ moduleKey: "tasks", objectType: "phase" });

      const [milestoneObject] = await db
        .select({ moduleKey: objects.moduleKey, objectType: objects.objectType })
        .from(objects)
        .where(and(eq(objects.workspaceId, a.workspaceId), eq(objects.id, milestone.objectId)));
      expect(milestoneObject).toEqual({ moduleKey: "tasks", objectType: "milestone" });

      const archivedPhase = await archivePhase(db, a.workspaceId, rootPhase.id);
      expect(archivedPhase?.archivedAt).toBeTruthy();
      const archivedMilestone = await archiveMilestone(db, a.workspaceId, milestone.id);
      expect(archivedMilestone?.archivedAt).toBeTruthy();

      const activityRows = await db.select().from(activities).where(eq(activities.workspaceId, a.workspaceId));
      const outboxRows = await db.select().from(outboxEvents).where(eq(outboxEvents.workspaceId, a.workspaceId));
      expect(activityRows.length).toBeGreaterThanOrEqual(10);
      expect(outboxRows).toHaveLength(activityRows.length);
    } finally {
      await cleanupWorkspace(a.workspaceId);
      await cleanupWorkspace(b.workspaceId);
    }
  });
});
