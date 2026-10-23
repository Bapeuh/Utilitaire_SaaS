import { randomUUID } from "node:crypto";

import {
  activities,
  contexts,
  createDatabase,
  objects,
  outboxEvents,
  taskDependencies,
  tasks,
  workspaces,
} from "@utilitaire/database";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import {
  addTaskDependency,
  createTask,
  InvalidTaskDependencyError,
  listTaskDependencies,
  removeTaskDependency,
  TaskDependencyCycleError,
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
  await db.delete(taskDependencies).where(eq(taskDependencies.workspaceId, workspaceId));
  await db.delete(activities).where(eq(activities.workspaceId, workspaceId));
  await db.delete(outboxEvents).where(eq(outboxEvents.workspaceId, workspaceId));
  await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
  await db.delete(objects).where(eq(objects.workspaceId, workspaceId));
  await db.delete(contexts).where(eq(contexts.workspaceId, workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
}

afterAll(async () => {
  await client.end();
});

describe("Task dependencies", () => {
  it("supports finish-start across Contexts while rejecting cycles and foreign Workspace tasks", async () => {
    const a = await createWorkspaceFixture(`Deps A ${randomUUID()}`);
    const b = await createWorkspaceFixture(`Deps B ${randomUUID()}`);

    try {
      const taskA = await createTask(db, {
        workspaceId: a.workspaceId,
        contextId: a.rootContextId,
        title: "A",
      });
      const taskB = await createTask(db, {
        workspaceId: a.workspaceId,
        contextId: a.projectContextId,
        title: "B",
      });
      const taskC = await createTask(db, {
        workspaceId: a.workspaceId,
        contextId: a.projectContextId,
        title: "C",
      });
      const foreignTask = await createTask(db, {
        workspaceId: b.workspaceId,
        contextId: b.rootContextId,
        title: "Foreign",
      });

      const dependencyAB = await addTaskDependency(db, {
        workspaceId: a.workspaceId,
        predecessorTaskId: taskA.id,
        successorTaskId: taskB.id,
      });
      expect(dependencyAB.dependencyType).toBe("finish_start");

      const dependencyBC = await addTaskDependency(db, {
        workspaceId: a.workspaceId,
        predecessorTaskId: taskB.id,
        successorTaskId: taskC.id,
      });
      expect(dependencyBC.id).toBeTruthy();

      await expect(addTaskDependency(db, {
        workspaceId: a.workspaceId,
        predecessorTaskId: taskC.id,
        successorTaskId: taskA.id,
      })).rejects.toBeInstanceOf(TaskDependencyCycleError);

      await expect(addTaskDependency(db, {
        workspaceId: a.workspaceId,
        predecessorTaskId: taskA.id,
        successorTaskId: foreignTask.id,
      })).rejects.toBeInstanceOf(InvalidTaskDependencyError);

      const dependenciesForB = await listTaskDependencies(db, a.workspaceId, taskB.id);
      expect(dependenciesForB).toHaveLength(2);

      const archived = await removeTaskDependency(db, a.workspaceId, dependencyAB.id);
      expect(archived?.archivedAt).toBeTruthy();
      expect(await listTaskDependencies(db, a.workspaceId, taskA.id)).toHaveLength(0);

      const reactivated = await addTaskDependency(db, {
        workspaceId: a.workspaceId,
        predecessorTaskId: taskA.id,
        successorTaskId: taskB.id,
      });
      expect(reactivated.id).toBe(dependencyAB.id);
      expect(reactivated.archivedAt).toBeNull();
    } finally {
      await cleanupWorkspace(a.workspaceId);
      await cleanupWorkspace(b.workspaceId);
    }
  });
});