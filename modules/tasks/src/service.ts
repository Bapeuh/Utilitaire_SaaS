import {
  contexts,
  createDatabase,
  objects,
  persons,
  taskChecklistItems,
  taskPersonAssignments,
  taskTeamAssignments,
  tasks,
  teams,
} from "@utilitaire/database";
import { enqueueOutboxEvent, writeActivity } from "@utilitaire/event-bus";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type { TaskCreateInput, TaskPriority, TaskStatus, TaskUpdateInput } from "./index.js";

type Database = ReturnType<typeof createDatabase>["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Pick<Database, "select" | "insert" | "update">;

export class InvalidTaskContextError extends Error {}
export class InvalidParentTaskError extends Error {}
export class TaskHierarchyCycleError extends Error {}
export class InvalidTaskDatesError extends Error {}
export class InvalidTaskEstimateError extends Error {}
export class InvalidTaskAssignmentError extends Error {}

export interface TaskListFilters {
  contextId?: string | undefined;
  status?: TaskStatus | undefined;
  priority?: TaskPriority | undefined;
}

export interface TaskMutationContext {
  actorUserId?: string | null;
}

function validateDates(startAt: Date | null | undefined, dueAt: Date | null | undefined) {
  if (startAt && dueAt && startAt.getTime() > dueAt.getTime()) {
    throw new InvalidTaskDatesError("Task startAt must be before or equal to dueAt");
  }
}

function validateEstimate(estimatedMinutes: number | null | undefined) {
  if (estimatedMinutes != null && (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 0)) {
    throw new InvalidTaskEstimateError("estimatedMinutes must be a non-negative integer");
  }
}

async function requireActiveContext(executor: Executor, workspaceId: string, contextId: string) {
  const [context] = await executor
    .select({ id: contexts.id })
    .from(contexts)
    .where(and(eq(contexts.workspaceId, workspaceId), eq(contexts.id, contextId), isNull(contexts.archivedAt)))
    .limit(1);
  if (!context) throw new InvalidTaskContextError("Task Context is invalid for this Workspace");
  return context;
}

async function getTaskRow(executor: Executor, workspaceId: string, taskId: string, includeArchived = false) {
  const conditions = [eq(tasks.workspaceId, workspaceId), eq(tasks.id, taskId)];
  if (!includeArchived) conditions.push(isNull(tasks.archivedAt));
  const [task] = await executor.select().from(tasks).where(and(...conditions)).limit(1);
  return task ?? null;
}

async function assertParentValid(
  executor: Executor,
  workspaceId: string,
  contextId: string,
  taskId: string | null,
  parentTaskId: string | null,
) {
  if (!parentTaskId) return;
  if (taskId && taskId === parentTaskId) throw new InvalidParentTaskError("A Task cannot be its own parent");

  const parent = await getTaskRow(executor, workspaceId, parentTaskId);
  if (!parent || parent.contextId !== contextId) {
    throw new InvalidParentTaskError("Parent Task must be active and belong to the same Context");
  }

  if (!taskId) return;
  let cursor: string | null = parent.id;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor === taskId) throw new TaskHierarchyCycleError("Task hierarchy cycle detected");
    if (visited.has(cursor)) throw new TaskHierarchyCycleError("Existing Task hierarchy contains a cycle");
    visited.add(cursor);
    const row = await getTaskRow(executor, workspaceId, cursor);
    cursor = row?.parentTaskId ?? null;
  }
}

function taskPayload(taskId: string, contextId: string) {
  return { taskId, contextId };
}

async function recordTaskMutation(
  tx: Transaction,
  input: {
    workspaceId: string;
    contextId: string;
    objectId: string;
    taskId: string;
    actorUserId?: string | null | undefined;
    action: string;
    eventName: string;
    payload?: Record<string, unknown>;
  },
) {
  await writeActivity(tx, {
    workspaceId: input.workspaceId,
    contextId: input.contextId,
    objectId: input.objectId,
    actorUserId: input.actorUserId ?? null,
    moduleKey: "tasks",
    action: input.action,
    metadata: input.payload ?? {},
  });
  await enqueueOutboxEvent(tx, {
    workspaceId: input.workspaceId,
    eventName: input.eventName,
    aggregateObjectId: input.objectId,
    payload: { ...taskPayload(input.taskId, input.contextId), ...(input.payload ?? {}) },
  });
}

export async function createTask(db: Database, input: TaskCreateInput, mutation: TaskMutationContext = {}) {
  const title = input.title.trim();
  if (!title) throw new Error("Task title is required");
  validateDates(input.startAt, input.dueAt);
  validateEstimate(input.estimatedMinutes);

  return db.transaction(async (tx) => {
    await requireActiveContext(tx, input.workspaceId, input.contextId);
    await assertParentValid(tx, input.workspaceId, input.contextId, null, input.parentTaskId ?? null);

    const [object] = await tx
      .insert(objects)
      .values({
        workspaceId: input.workspaceId,
        contextId: input.contextId,
        moduleKey: "tasks",
        objectType: "task",
      })
      .returning({ id: objects.id });
    if (!object) throw new Error("Task Object creation failed");

    const [task] = await tx
      .insert(tasks)
      .values({
        workspaceId: input.workspaceId,
        objectId: object.id,
        contextId: input.contextId,
        parentTaskId: input.parentTaskId ?? null,
        title,
        description: input.description ?? null,
        status: input.status ?? "todo",
        priority: input.priority ?? null,
        startAt: input.startAt ?? null,
        dueAt: input.dueAt ?? null,
        estimatedMinutes: input.estimatedMinutes ?? null,
        position: input.position ?? 0,
      })
      .returning();
    if (!task) throw new Error("Task creation failed");

    await recordTaskMutation(tx, {
      workspaceId: task.workspaceId,
      contextId: task.contextId,
      objectId: task.objectId,
      taskId: task.id,
      actorUserId: mutation.actorUserId,
      action: "task.created",
      eventName: "tasks.task.created.v1",
      payload: { parentTaskId: task.parentTaskId },
    });
    return task;
  });
}

export async function getTask(db: Database, workspaceId: string, taskId: string) {
  return getTaskRow(db, workspaceId, taskId);
}

export async function listTasks(db: Database, workspaceId: string, filters: TaskListFilters = {}) {
  const conditions = [eq(tasks.workspaceId, workspaceId), isNull(tasks.archivedAt)];
  if (filters.contextId) conditions.push(eq(tasks.contextId, filters.contextId));
  if (filters.status) conditions.push(eq(tasks.status, filters.status));
  if (filters.priority) conditions.push(eq(tasks.priority, filters.priority));

  return db.select().from(tasks).where(and(...conditions)).orderBy(asc(tasks.position), asc(tasks.createdAt));
}

export async function updateTask(
  db: Database,
  workspaceId: string,
  taskId: string,
  input: TaskUpdateInput,
  mutation: TaskMutationContext = {},
) {
  return db.transaction(async (tx) => {
    const current = await getTaskRow(tx, workspaceId, taskId);
    if (!current) return null;

    const nextStartAt = input.startAt !== undefined ? input.startAt : current.startAt;
    const nextDueAt = input.dueAt !== undefined ? input.dueAt : current.dueAt;
    validateDates(nextStartAt, nextDueAt);
    validateEstimate(input.estimatedMinutes);

    if (input.parentTaskId !== undefined) {
      await assertParentValid(tx, workspaceId, current.contextId, current.id, input.parentTaskId);
    }

    const changes: {
      title?: string;
      description?: string | null;
      status?: TaskStatus;
      priority?: TaskPriority | null;
      startAt?: Date | null;
      dueAt?: Date | null;
      estimatedMinutes?: number | null;
      parentTaskId?: string | null;
      position?: number;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) throw new Error("Task title is required");
      changes.title = title;
    }
    if (input.description !== undefined) changes.description = input.description;
    if (input.status !== undefined) changes.status = input.status;
    if (input.priority !== undefined) changes.priority = input.priority;
    if (input.startAt !== undefined) changes.startAt = input.startAt;
    if (input.dueAt !== undefined) changes.dueAt = input.dueAt;
    if (input.estimatedMinutes !== undefined) changes.estimatedMinutes = input.estimatedMinutes;
    if (input.parentTaskId !== undefined) changes.parentTaskId = input.parentTaskId;
    if (input.position !== undefined) changes.position = input.position;

    const [updated] = await tx
      .update(tasks)
      .set(changes)
      .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, taskId), isNull(tasks.archivedAt)))
      .returning();
    if (!updated) return null;

    await recordTaskMutation(tx, {
      workspaceId,
      contextId: updated.contextId,
      objectId: updated.objectId,
      taskId: updated.id,
      actorUserId: mutation.actorUserId,
      action: "task.updated",
      eventName: "tasks.task.updated.v1",
    });
    return updated;
  });
}

export async function archiveTask(db: Database, workspaceId: string, taskId: string, mutation: TaskMutationContext = {}) {
  return db.transaction(async (tx) => {
    const current = await getTaskRow(tx, workspaceId, taskId);
    if (!current) return null;
    const now = new Date();
    const [archived] = await tx
      .update(tasks)
      .set({ archivedAt: now, updatedAt: now })
      .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, taskId), isNull(tasks.archivedAt)))
      .returning();
    if (!archived) return null;
    await tx.update(objects).set({ archivedAt: now }).where(and(eq(objects.workspaceId, workspaceId), eq(objects.id, archived.objectId)));

    await recordTaskMutation(tx, {
      workspaceId,
      contextId: archived.contextId,
      objectId: archived.objectId,
      taskId: archived.id,
      actorUserId: mutation.actorUserId,
      action: "task.archived",
      eventName: "tasks.task.archived.v1",
    });
    return archived;
  });
}

async function collectSubtree(tx: Transaction, workspaceId: string, rootTaskId: string) {
  const ids = [rootTaskId];
  let frontier = [rootTaskId];
  while (frontier.length) {
    const rows = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.workspaceId, workspaceId), inArray(tasks.parentTaskId, frontier), isNull(tasks.archivedAt)));
    frontier = rows.map((row) => row.id).filter((id) => !ids.includes(id));
    ids.push(...frontier);
  }
  return ids;
}

export async function moveTaskSubtree(
  db: Database,
  workspaceId: string,
  taskId: string,
  targetContextId: string,
  mutation: TaskMutationContext = {},
) {
  return db.transaction(async (tx) => {
    await requireActiveContext(tx, workspaceId, targetContextId);
    const root = await getTaskRow(tx, workspaceId, taskId);
    if (!root) return null;
    const subtreeIds = await collectSubtree(tx, workspaceId, taskId);
    const rows = await tx
      .select({ id: tasks.id, objectId: tasks.objectId })
      .from(tasks)
      .where(and(eq(tasks.workspaceId, workspaceId), inArray(tasks.id, subtreeIds)));
    const objectIds = rows.map((row) => row.objectId);
    const now = new Date();

    await tx
      .update(tasks)
      .set({ contextId: targetContextId, updatedAt: now })
      .where(and(eq(tasks.workspaceId, workspaceId), inArray(tasks.id, subtreeIds)));
    await tx
      .update(tasks)
      .set({ parentTaskId: null, updatedAt: now })
      .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, taskId)));
    if (objectIds.length) {
      await tx
        .update(objects)
        .set({ contextId: targetContextId })
        .where(and(eq(objects.workspaceId, workspaceId), inArray(objects.id, objectIds)));
    }

    await recordTaskMutation(tx, {
      workspaceId,
      contextId: targetContextId,
      objectId: root.objectId,
      taskId,
      actorUserId: mutation.actorUserId,
      action: "task.moved",
      eventName: "tasks.task.moved.v1",
      payload: { fromContextId: root.contextId, toContextId: targetContextId, movedTaskIds: subtreeIds },
    });
    return { taskId, fromContextId: root.contextId, toContextId: targetContextId, movedTaskIds: subtreeIds };
  });
}

async function requireAssignmentTask(tx: Transaction, workspaceId: string, taskId: string) {
  const task = await getTaskRow(tx, workspaceId, taskId);
  if (!task) throw new InvalidTaskAssignmentError("Task not found");
  return task;
}

export async function assignPerson(
  db: Database,
  workspaceId: string,
  taskId: string,
  personId: string,
  mutation: TaskMutationContext = {},
) {
  return db.transaction(async (tx) => {
    const task = await requireAssignmentTask(tx, workspaceId, taskId);
    const [person] = await tx
      .select({ id: persons.id })
      .from(persons)
      .where(and(eq(persons.workspaceId, workspaceId), eq(persons.id, personId), isNull(persons.archivedAt)))
      .limit(1);
    if (!person) throw new InvalidTaskAssignmentError("Person is invalid for this Workspace");

    const [existing] = await tx
      .select()
      .from(taskPersonAssignments)
      .where(and(eq(taskPersonAssignments.workspaceId, workspaceId), eq(taskPersonAssignments.taskId, taskId), eq(taskPersonAssignments.personId, personId)))
      .limit(1);
    const now = new Date();
    const assignment = existing
      ? (await tx.update(taskPersonAssignments).set({ archivedAt: null, updatedAt: now }).where(eq(taskPersonAssignments.id, existing.id)).returning())[0]
      : (await tx.insert(taskPersonAssignments).values({ workspaceId, taskId, personId }).returning())[0];
    if (!assignment) throw new Error("Person assignment failed");

    await recordTaskMutation(tx, {
      workspaceId,
      contextId: task.contextId,
      objectId: task.objectId,
      taskId,
      actorUserId: mutation.actorUserId,
      action: "task.assignment_changed",
      eventName: "tasks.task.assignment_changed.v1",
      payload: { assignmentType: "person", assigneeId: personId, assigned: true },
    });
    return assignment;
  });
}

export async function unassignPerson(db: Database, workspaceId: string, taskId: string, personId: string, mutation: TaskMutationContext = {}) {
  return db.transaction(async (tx) => {
    const task = await requireAssignmentTask(tx, workspaceId, taskId);
    const [assignment] = await tx
      .update(taskPersonAssignments)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(taskPersonAssignments.workspaceId, workspaceId), eq(taskPersonAssignments.taskId, taskId), eq(taskPersonAssignments.personId, personId), isNull(taskPersonAssignments.archivedAt)))
      .returning();
    if (!assignment) return null;
    await recordTaskMutation(tx, {
      workspaceId,
      contextId: task.contextId,
      objectId: task.objectId,
      taskId,
      actorUserId: mutation.actorUserId,
      action: "task.assignment_changed",
      eventName: "tasks.task.assignment_changed.v1",
      payload: { assignmentType: "person", assigneeId: personId, assigned: false },
    });
    return assignment;
  });
}

export async function assignTeam(
  db: Database,
  workspaceId: string,
  taskId: string,
  teamId: string,
  mutation: TaskMutationContext = {},
) {
  return db.transaction(async (tx) => {
    const task = await requireAssignmentTask(tx, workspaceId, taskId);
    const [team] = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.workspaceId, workspaceId), eq(teams.id, teamId), isNull(teams.archivedAt)))
      .limit(1);
    if (!team) throw new InvalidTaskAssignmentError("Team is invalid for this Workspace");

    const [existing] = await tx
      .select()
      .from(taskTeamAssignments)
      .where(and(eq(taskTeamAssignments.workspaceId, workspaceId), eq(taskTeamAssignments.taskId, taskId), eq(taskTeamAssignments.teamId, teamId)))
      .limit(1);
    const now = new Date();
    const assignment = existing
      ? (await tx.update(taskTeamAssignments).set({ archivedAt: null, updatedAt: now }).where(eq(taskTeamAssignments.id, existing.id)).returning())[0]
      : (await tx.insert(taskTeamAssignments).values({ workspaceId, taskId, teamId }).returning())[0];
    if (!assignment) throw new Error("Team assignment failed");

    await recordTaskMutation(tx, {
      workspaceId,
      contextId: task.contextId,
      objectId: task.objectId,
      taskId,
      actorUserId: mutation.actorUserId,
      action: "task.assignment_changed",
      eventName: "tasks.task.assignment_changed.v1",
      payload: { assignmentType: "team", assigneeId: teamId, assigned: true },
    });
    return assignment;
  });
}

export async function unassignTeam(db: Database, workspaceId: string, taskId: string, teamId: string, mutation: TaskMutationContext = {}) {
  return db.transaction(async (tx) => {
    const task = await requireAssignmentTask(tx, workspaceId, taskId);
    const [assignment] = await tx
      .update(taskTeamAssignments)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(taskTeamAssignments.workspaceId, workspaceId), eq(taskTeamAssignments.taskId, taskId), eq(taskTeamAssignments.teamId, teamId), isNull(taskTeamAssignments.archivedAt)))
      .returning();
    if (!assignment) return null;
    await recordTaskMutation(tx, {
      workspaceId,
      contextId: task.contextId,
      objectId: task.objectId,
      taskId,
      actorUserId: mutation.actorUserId,
      action: "task.assignment_changed",
      eventName: "tasks.task.assignment_changed.v1",
      payload: { assignmentType: "team", assigneeId: teamId, assigned: false },
    });
    return assignment;
  });
}

export async function listTaskAssignments(db: Database, workspaceId: string, taskId: string) {
  const [people, assignedTeams] = await Promise.all([
    db.select().from(taskPersonAssignments).where(and(eq(taskPersonAssignments.workspaceId, workspaceId), eq(taskPersonAssignments.taskId, taskId), isNull(taskPersonAssignments.archivedAt))),
    db.select().from(taskTeamAssignments).where(and(eq(taskTeamAssignments.workspaceId, workspaceId), eq(taskTeamAssignments.taskId, taskId), isNull(taskTeamAssignments.archivedAt))),
  ]);
  return { people, teams: assignedTeams };
}

export async function addChecklistItem(db: Database, workspaceId: string, taskId: string, label: string, position = 0, mutation: TaskMutationContext = {}) {
  const cleanLabel = label.trim();
  if (!cleanLabel) throw new Error("Checklist label is required");
  return db.transaction(async (tx) => {
    const task = await requireAssignmentTask(tx, workspaceId, taskId);
    const [item] = await tx.insert(taskChecklistItems).values({ workspaceId, taskId, label: cleanLabel, position }).returning();
    if (!item) throw new Error("Checklist item creation failed");
    await recordTaskMutation(tx, {
      workspaceId,
      contextId: task.contextId,
      objectId: task.objectId,
      taskId,
      actorUserId: mutation.actorUserId,
      action: "task.updated",
      eventName: "tasks.task.updated.v1",
      payload: { checklistItemId: item.id, checklistChange: "created" },
    });
    return item;
  });
}

export async function updateChecklistItem(
  db: Database,
  workspaceId: string,
  taskId: string,
  itemId: string,
  input: { label?: string | undefined; isDone?: boolean | undefined; position?: number | undefined },
  mutation: TaskMutationContext = {},
) {
  return db.transaction(async (tx) => {
    const task = await requireAssignmentTask(tx, workspaceId, taskId);
    const changes: { label?: string; isDone?: boolean; position?: number; updatedAt: Date } = { updatedAt: new Date() };
    if (input.label !== undefined) {
      const label = input.label.trim();
      if (!label) throw new Error("Checklist label is required");
      changes.label = label;
    }
    if (input.isDone !== undefined) changes.isDone = input.isDone;
    if (input.position !== undefined) changes.position = input.position;
    const [item] = await tx
      .update(taskChecklistItems)
      .set(changes)
      .where(and(eq(taskChecklistItems.workspaceId, workspaceId), eq(taskChecklistItems.taskId, taskId), eq(taskChecklistItems.id, itemId), isNull(taskChecklistItems.archivedAt)))
      .returning();
    if (!item) return null;
    await recordTaskMutation(tx, {
      workspaceId,
      contextId: task.contextId,
      objectId: task.objectId,
      taskId,
      actorUserId: mutation.actorUserId,
      action: "task.updated",
      eventName: "tasks.task.updated.v1",
      payload: { checklistItemId: item.id, checklistChange: "updated" },
    });
    return item;
  });
}

export async function archiveChecklistItem(db: Database, workspaceId: string, taskId: string, itemId: string, mutation: TaskMutationContext = {}) {
  return db.transaction(async (tx) => {
    const task = await requireAssignmentTask(tx, workspaceId, taskId);
    const [item] = await tx
      .update(taskChecklistItems)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(taskChecklistItems.workspaceId, workspaceId), eq(taskChecklistItems.taskId, taskId), eq(taskChecklistItems.id, itemId), isNull(taskChecklistItems.archivedAt)))
      .returning();
    if (!item) return null;
    await recordTaskMutation(tx, {
      workspaceId,
      contextId: task.contextId,
      objectId: task.objectId,
      taskId,
      actorUserId: mutation.actorUserId,
      action: "task.updated",
      eventName: "tasks.task.updated.v1",
      payload: { checklistItemId: item.id, checklistChange: "archived" },
    });
    return item;
  });
}

export async function listChecklistItems(db: Database, workspaceId: string, taskId: string) {
  return db
    .select()
    .from(taskChecklistItems)
    .where(and(eq(taskChecklistItems.workspaceId, workspaceId), eq(taskChecklistItems.taskId, taskId), isNull(taskChecklistItems.archivedAt)))
    .orderBy(asc(taskChecklistItems.position), asc(taskChecklistItems.createdAt));
}
