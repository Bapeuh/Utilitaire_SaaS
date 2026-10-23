import { createDatabase, taskDependencies, tasks } from "@utilitaire/database";
import { enqueueOutboxEvent, writeActivity } from "@utilitaire/event-bus";
import { and, eq, isNull, or } from "drizzle-orm";

import type { TaskDependencyCreateInput } from "./contracts.js";
import type { TaskMutationContext } from "./service.js";

type Database = ReturnType<typeof createDatabase>["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Pick<Database, "select" | "insert" | "update">;

export class InvalidTaskDependencyError extends Error {}
export class TaskDependencyCycleError extends Error {}

async function requireActiveTask(executor: Executor, workspaceId: string, taskId: string) {
  const [task] = await executor
    .select()
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, taskId), isNull(tasks.archivedAt)))
    .limit(1);
  if (!task) throw new InvalidTaskDependencyError("Task is invalid for this Workspace");
  return task;
}

async function wouldCreateCycle(
  executor: Executor,
  workspaceId: string,
  predecessorTaskId: string,
  successorTaskId: string,
) {
  if (predecessorTaskId === successorTaskId) return true;

  const visited = new Set<string>();
  let frontier = [successorTaskId];

  while (frontier.length) {
    if (frontier.includes(predecessorTaskId)) return true;
    for (const taskId of frontier) visited.add(taskId);

    const edges = await executor
      .select({ successorTaskId: taskDependencies.successorTaskId })
      .from(taskDependencies)
      .where(and(
        eq(taskDependencies.workspaceId, workspaceId),
        isNull(taskDependencies.archivedAt),
        or(...frontier.map((taskId) => eq(taskDependencies.predecessorTaskId, taskId))),
      ));

    frontier = edges
      .map((edge) => edge.successorTaskId)
      .filter((taskId) => !visited.has(taskId));
  }

  return false;
}

async function recordDependencyChange(
  tx: Transaction,
  input: {
    workspaceId: string;
    contextId: string;
    objectId: string;
    dependencyId: string;
    predecessorTaskId: string;
    successorTaskId: string;
    active: boolean;
    actorUserId?: string | null | undefined;
  },
) {
  const payload = {
    dependencyId: input.dependencyId,
    predecessorTaskId: input.predecessorTaskId,
    successorTaskId: input.successorTaskId,
    dependencyType: "finish_start",
    active: input.active,
  };

  await writeActivity(tx, {
    workspaceId: input.workspaceId,
    contextId: input.contextId,
    objectId: input.objectId,
    actorUserId: input.actorUserId ?? null,
    moduleKey: "tasks",
    action: "task.dependency_changed",
    metadata: payload,
  });
  await enqueueOutboxEvent(tx, {
    workspaceId: input.workspaceId,
    eventName: "tasks.task.dependency_changed.v1",
    aggregateObjectId: input.objectId,
    payload,
  });
}

export async function addTaskDependency(
  db: Database,
  input: TaskDependencyCreateInput,
  mutation: TaskMutationContext = {},
) {
  const dependencyType = input.dependencyType ?? "finish_start";
  if (dependencyType !== "finish_start") {
    throw new InvalidTaskDependencyError("Only finish_start dependencies are supported in Lot 3");
  }

  return db.transaction(async (tx) => {
    const predecessor = await requireActiveTask(tx, input.workspaceId, input.predecessorTaskId);
    const successor = await requireActiveTask(tx, input.workspaceId, input.successorTaskId);

    if (await wouldCreateCycle(tx, input.workspaceId, predecessor.id, successor.id)) {
      throw new TaskDependencyCycleError("Task dependency cycle detected");
    }

    const [existing] = await tx
      .select()
      .from(taskDependencies)
      .where(and(
        eq(taskDependencies.workspaceId, input.workspaceId),
        eq(taskDependencies.predecessorTaskId, predecessor.id),
        eq(taskDependencies.successorTaskId, successor.id),
        eq(taskDependencies.dependencyType, dependencyType),
      ))
      .limit(1);

    const now = new Date();
    const dependency = existing
      ? (await tx
          .update(taskDependencies)
          .set({ archivedAt: null, updatedAt: now })
          .where(eq(taskDependencies.id, existing.id))
          .returning())[0]
      : (await tx
          .insert(taskDependencies)
          .values({
            workspaceId: input.workspaceId,
            predecessorTaskId: predecessor.id,
            successorTaskId: successor.id,
            dependencyType,
          })
          .returning())[0];

    if (!dependency) throw new Error("Task dependency creation failed");

    await recordDependencyChange(tx, {
      workspaceId: input.workspaceId,
      contextId: successor.contextId,
      objectId: successor.objectId,
      dependencyId: dependency.id,
      predecessorTaskId: predecessor.id,
      successorTaskId: successor.id,
      active: true,
      actorUserId: mutation.actorUserId,
    });

    return dependency;
  });
}

export async function removeTaskDependency(
  db: Database,
  workspaceId: string,
  dependencyId: string,
  mutation: TaskMutationContext = {},
) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(taskDependencies)
      .where(and(
        eq(taskDependencies.workspaceId, workspaceId),
        eq(taskDependencies.id, dependencyId),
        isNull(taskDependencies.archivedAt),
      ))
      .limit(1);
    if (!current) return null;

    const successor = await requireActiveTask(tx, workspaceId, current.successorTaskId);
    const now = new Date();
    const [archived] = await tx
      .update(taskDependencies)
      .set({ archivedAt: now, updatedAt: now })
      .where(and(eq(taskDependencies.workspaceId, workspaceId), eq(taskDependencies.id, dependencyId)))
      .returning();
    if (!archived) return null;

    await recordDependencyChange(tx, {
      workspaceId,
      contextId: successor.contextId,
      objectId: successor.objectId,
      dependencyId: archived.id,
      predecessorTaskId: archived.predecessorTaskId,
      successorTaskId: archived.successorTaskId,
      active: false,
      actorUserId: mutation.actorUserId,
    });

    return archived;
  });
}

export async function listTaskDependencies(db: Database, workspaceId: string, taskId: string) {
  await requireActiveTask(db, workspaceId, taskId);
  return db
    .select()
    .from(taskDependencies)
    .where(and(
      eq(taskDependencies.workspaceId, workspaceId),
      isNull(taskDependencies.archivedAt),
      or(
        eq(taskDependencies.predecessorTaskId, taskId),
        eq(taskDependencies.successorTaskId, taskId),
      ),
    ));
}