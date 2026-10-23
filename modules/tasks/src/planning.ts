import {
  contexts,
  createDatabase,
  objects,
  taskMilestoneLinks,
  taskMilestones,
  taskPhases,
  tasks,
} from "@utilitaire/database";
import { enqueueOutboxEvent, writeActivity } from "@utilitaire/event-bus";
import { and, asc, eq, isNull } from "drizzle-orm";

import type {
  MilestoneCreateInput,
  MilestoneUpdateInput,
  PhaseCreateInput,
  PhaseUpdateInput,
} from "./contracts.js";
import type { TaskMutationContext } from "./service.js";

type Database = ReturnType<typeof createDatabase>["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Pick<Database, "select" | "insert" | "update">;

export class InvalidPlanningContextError extends Error {}
export class InvalidPhaseError extends Error {}
export class InvalidMilestoneError extends Error {}
export class InvalidPlanningDatesError extends Error {}
export class InvalidPlanningPositionError extends Error {}

function validatePosition(position: number | undefined) {
  if (position !== undefined && (!Number.isInteger(position) || position < 0)) {
    throw new InvalidPlanningPositionError("position must be a non-negative integer");
  }
}

function validateDates(startAt: Date | null | undefined, dueAt: Date | null | undefined) {
  if (startAt && dueAt && startAt.getTime() > dueAt.getTime()) {
    throw new InvalidPlanningDatesError("startAt must be before or equal to dueAt");
  }
}

async function requireActiveContext(executor: Executor, workspaceId: string, contextId: string) {
  const [context] = await executor
    .select({ id: contexts.id })
    .from(contexts)
    .where(and(eq(contexts.workspaceId, workspaceId), eq(contexts.id, contextId), isNull(contexts.archivedAt)))
    .limit(1);
  if (!context) throw new InvalidPlanningContextError("Context is invalid for this Workspace");
  return context;
}

async function recordPlanningMutation(
  tx: Transaction,
  input: {
    workspaceId: string;
    contextId: string;
    objectId: string;
    actorUserId?: string | null | undefined;
    action: string;
    eventName: string;
    payload: Record<string, unknown>;
  },
) {
  await writeActivity(tx, {
    workspaceId: input.workspaceId,
    contextId: input.contextId,
    objectId: input.objectId,
    actorUserId: input.actorUserId ?? null,
    moduleKey: "tasks",
    action: input.action,
    metadata: input.payload,
  });
  await enqueueOutboxEvent(tx, {
    workspaceId: input.workspaceId,
    eventName: input.eventName,
    aggregateObjectId: input.objectId,
    payload: input.payload,
  });
}

export async function createPhase(db: Database, input: PhaseCreateInput, mutation: TaskMutationContext = {}) {
  const name = input.name.trim();
  if (!name) throw new InvalidPhaseError("Phase name is required");
  validatePosition(input.position);
  validateDates(input.startAt, input.dueAt);

  return db.transaction(async (tx) => {
    await requireActiveContext(tx, input.workspaceId, input.contextId);
    const [object] = await tx.insert(objects).values({
      workspaceId: input.workspaceId,
      contextId: input.contextId,
      moduleKey: "tasks",
      objectType: "phase",
    }).returning({ id: objects.id });
    if (!object) throw new Error("Phase Object creation failed");

    const [phase] = await tx.insert(taskPhases).values({
      workspaceId: input.workspaceId,
      objectId: object.id,
      contextId: input.contextId,
      name,
      description: input.description ?? null,
      position: input.position ?? 0,
      startAt: input.startAt ?? null,
      dueAt: input.dueAt ?? null,
    }).returning();
    if (!phase) throw new Error("Phase creation failed");

    await recordPlanningMutation(tx, {
      workspaceId: phase.workspaceId,
      contextId: phase.contextId,
      objectId: phase.objectId,
      actorUserId: mutation.actorUserId,
      action: "phase.created",
      eventName: "tasks.phase.created.v1",
      payload: { phaseId: phase.id, contextId: phase.contextId },
    });
    return phase;
  });
}

export async function getPhase(db: Database, workspaceId: string, phaseId: string) {
  const [phase] = await db.select().from(taskPhases).where(and(
    eq(taskPhases.workspaceId, workspaceId),
    eq(taskPhases.id, phaseId),
    isNull(taskPhases.archivedAt),
  )).limit(1);
  return phase ?? null;
}

export async function listPhases(db: Database, workspaceId: string, contextId?: string) {
  const conditions = [eq(taskPhases.workspaceId, workspaceId), isNull(taskPhases.archivedAt)];
  if (contextId) conditions.push(eq(taskPhases.contextId, contextId));
  return db.select().from(taskPhases).where(and(...conditions)).orderBy(asc(taskPhases.position), asc(taskPhases.createdAt));
}

export async function updatePhase(db: Database, workspaceId: string, phaseId: string, input: PhaseUpdateInput, mutation: TaskMutationContext = {}) {
  validatePosition(input.position);
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(taskPhases).where(and(
      eq(taskPhases.workspaceId, workspaceId),
      eq(taskPhases.id, phaseId),
      isNull(taskPhases.archivedAt),
    )).limit(1);
    if (!current) return null;

    const nextStartAt = input.startAt !== undefined ? input.startAt : current.startAt;
    const nextDueAt = input.dueAt !== undefined ? input.dueAt : current.dueAt;
    validateDates(nextStartAt, nextDueAt);

    const changes: Partial<typeof taskPhases.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() };
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new InvalidPhaseError("Phase name is required");
      changes.name = name;
    }
    if (input.description !== undefined) changes.description = input.description;
    if (input.position !== undefined) changes.position = input.position;
    if (input.startAt !== undefined) changes.startAt = input.startAt;
    if (input.dueAt !== undefined) changes.dueAt = input.dueAt;

    const [updated] = await tx.update(taskPhases).set(changes).where(and(
      eq(taskPhases.workspaceId, workspaceId),
      eq(taskPhases.id, phaseId),
      isNull(taskPhases.archivedAt),
    )).returning();
    if (!updated) return null;

    await recordPlanningMutation(tx, {
      workspaceId,
      contextId: updated.contextId,
      objectId: updated.objectId,
      actorUserId: mutation.actorUserId,
      action: "phase.updated",
      eventName: "tasks.phase.updated.v1",
      payload: { phaseId: updated.id, contextId: updated.contextId },
    });
    return updated;
  });
}

export async function archivePhase(db: Database, workspaceId: string, phaseId: string, mutation: TaskMutationContext = {}) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(taskPhases).where(and(
      eq(taskPhases.workspaceId, workspaceId),
      eq(taskPhases.id, phaseId),
      isNull(taskPhases.archivedAt),
    )).limit(1);
    if (!current) return null;
    const now = new Date();
    await tx.update(tasks).set({ phaseId: null, updatedAt: now }).where(and(
      eq(tasks.workspaceId, workspaceId),
      eq(tasks.phaseId, phaseId),
      isNull(tasks.archivedAt),
    ));
    const [archived] = await tx.update(taskPhases).set({ archivedAt: now, updatedAt: now }).where(eq(taskPhases.id, phaseId)).returning();
    if (!archived) return null;
    await tx.update(objects).set({ archivedAt: now }).where(and(eq(objects.workspaceId, workspaceId), eq(objects.id, archived.objectId)));
    await recordPlanningMutation(tx, {
      workspaceId,
      contextId: archived.contextId,
      objectId: archived.objectId,
      actorUserId: mutation.actorUserId,
      action: "phase.archived",
      eventName: "tasks.phase.archived.v1",
      payload: { phaseId: archived.id, contextId: archived.contextId },
    });
    return archived;
  });
}

export async function setTaskPhase(db: Database, workspaceId: string, taskId: string, phaseId: string | null, mutation: TaskMutationContext = {}) {
  return db.transaction(async (tx) => {
    const [task] = await tx.select().from(tasks).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, taskId), isNull(tasks.archivedAt))).limit(1);
    if (!task) return null;
    if (phaseId) {
      const [phase] = await tx.select().from(taskPhases).where(and(
        eq(taskPhases.workspaceId, workspaceId),
        eq(taskPhases.id, phaseId),
        isNull(taskPhases.archivedAt),
      )).limit(1);
      if (!phase || phase.contextId !== task.contextId) throw new InvalidPhaseError("Phase must belong to the same Context as Task");
    }
    const [updated] = await tx.update(tasks).set({ phaseId, updatedAt: new Date() }).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, taskId))).returning();
    if (!updated) return null;
    await recordPlanningMutation(tx, {
      workspaceId,
      contextId: updated.contextId,
      objectId: updated.objectId,
      actorUserId: mutation.actorUserId,
      action: "task.updated",
      eventName: "tasks.task.updated.v1",
      payload: { taskId: updated.id, contextId: updated.contextId, phaseId },
    });
    return updated;
  });
}

export async function createMilestone(db: Database, input: MilestoneCreateInput, mutation: TaskMutationContext = {}) {
  const name = input.name.trim();
  if (!name) throw new InvalidMilestoneError("Milestone name is required");
  validatePosition(input.position);
  return db.transaction(async (tx) => {
    await requireActiveContext(tx, input.workspaceId, input.contextId);
    const [object] = await tx.insert(objects).values({
      workspaceId: input.workspaceId,
      contextId: input.contextId,
      moduleKey: "tasks",
      objectType: "milestone",
    }).returning({ id: objects.id });
    if (!object) throw new Error("Milestone Object creation failed");
    const [milestone] = await tx.insert(taskMilestones).values({
      workspaceId: input.workspaceId,
      objectId: object.id,
      contextId: input.contextId,
      name,
      description: input.description ?? null,
      dueAt: input.dueAt,
      status: input.status ?? "open",
      position: input.position ?? 0,
    }).returning();
    if (!milestone) throw new Error("Milestone creation failed");
    await recordPlanningMutation(tx, {
      workspaceId: milestone.workspaceId,
      contextId: milestone.contextId,
      objectId: milestone.objectId,
      actorUserId: mutation.actorUserId,
      action: "milestone.created",
      eventName: "tasks.milestone.created.v1",
      payload: { milestoneId: milestone.id, contextId: milestone.contextId },
    });
    return milestone;
  });
}

export async function getMilestone(db: Database, workspaceId: string, milestoneId: string) {
  const [milestone] = await db.select().from(taskMilestones).where(and(
    eq(taskMilestones.workspaceId, workspaceId),
    eq(taskMilestones.id, milestoneId),
    isNull(taskMilestones.archivedAt),
  )).limit(1);
  return milestone ?? null;
}

export async function listMilestones(db: Database, workspaceId: string, contextId?: string) {
  const conditions = [eq(taskMilestones.workspaceId, workspaceId), isNull(taskMilestones.archivedAt)];
  if (contextId) conditions.push(eq(taskMilestones.contextId, contextId));
  return db.select().from(taskMilestones).where(and(...conditions)).orderBy(asc(taskMilestones.dueAt), asc(taskMilestones.position));
}

export async function updateMilestone(db: Database, workspaceId: string, milestoneId: string, input: MilestoneUpdateInput, mutation: TaskMutationContext = {}) {
  validatePosition(input.position);
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(taskMilestones).where(and(
      eq(taskMilestones.workspaceId, workspaceId),
      eq(taskMilestones.id, milestoneId),
      isNull(taskMilestones.archivedAt),
    )).limit(1);
    if (!current) return null;
    const changes: Partial<typeof taskMilestones.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() };
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new InvalidMilestoneError("Milestone name is required");
      changes.name = name;
    }
    if (input.description !== undefined) changes.description = input.description;
    if (input.dueAt !== undefined) changes.dueAt = input.dueAt;
    if (input.status !== undefined) changes.status = input.status;
    if (input.position !== undefined) changes.position = input.position;
    const [updated] = await tx.update(taskMilestones).set(changes).where(and(
      eq(taskMilestones.workspaceId, workspaceId),
      eq(taskMilestones.id, milestoneId),
      isNull(taskMilestones.archivedAt),
    )).returning();
    if (!updated) return null;
    await recordPlanningMutation(tx, {
      workspaceId,
      contextId: updated.contextId,
      objectId: updated.objectId,
      actorUserId: mutation.actorUserId,
      action: "milestone.updated",
      eventName: "tasks.milestone.updated.v1",
      payload: { milestoneId: updated.id, contextId: updated.contextId },
    });
    return updated;
  });
}

export async function archiveMilestone(db: Database, workspaceId: string, milestoneId: string, mutation: TaskMutationContext = {}) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(taskMilestones).where(and(
      eq(taskMilestones.workspaceId, workspaceId),
      eq(taskMilestones.id, milestoneId),
      isNull(taskMilestones.archivedAt),
    )).limit(1);
    if (!current) return null;
    const now = new Date();
    await tx.update(taskMilestoneLinks).set({ archivedAt: now, updatedAt: now }).where(and(
      eq(taskMilestoneLinks.workspaceId, workspaceId),
      eq(taskMilestoneLinks.milestoneId, milestoneId),
      isNull(taskMilestoneLinks.archivedAt),
    ));
    const [archived] = await tx.update(taskMilestones).set({ archivedAt: now, updatedAt: now }).where(eq(taskMilestones.id, milestoneId)).returning();
    if (!archived) return null;
    await tx.update(objects).set({ archivedAt: now }).where(and(eq(objects.workspaceId, workspaceId), eq(objects.id, archived.objectId)));
    await recordPlanningMutation(tx, {
      workspaceId,
      contextId: archived.contextId,
      objectId: archived.objectId,
      actorUserId: mutation.actorUserId,
      action: "milestone.archived",
      eventName: "tasks.milestone.archived.v1",
      payload: { milestoneId: archived.id, contextId: archived.contextId },
    });
    return archived;
  });
}

export async function linkTaskMilestone(db: Database, workspaceId: string, taskId: string, milestoneId: string, mutation: TaskMutationContext = {}) {
  return db.transaction(async (tx) => {
    const [task] = await tx.select().from(tasks).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, taskId), isNull(tasks.archivedAt))).limit(1);
    const [milestone] = await tx.select().from(taskMilestones).where(and(eq(taskMilestones.workspaceId, workspaceId), eq(taskMilestones.id, milestoneId), isNull(taskMilestones.archivedAt))).limit(1);
    if (!task || !milestone || task.contextId !== milestone.contextId) throw new InvalidMilestoneError("Task and Milestone must be active in the same Context");
    const [existing] = await tx.select().from(taskMilestoneLinks).where(and(
      eq(taskMilestoneLinks.workspaceId, workspaceId),
      eq(taskMilestoneLinks.taskId, taskId),
      eq(taskMilestoneLinks.milestoneId, milestoneId),
    )).limit(1);
    const link = existing
      ? (await tx.update(taskMilestoneLinks).set({ archivedAt: null, updatedAt: new Date() }).where(eq(taskMilestoneLinks.id, existing.id)).returning())[0]
      : (await tx.insert(taskMilestoneLinks).values({ workspaceId, taskId, milestoneId }).returning())[0];
    if (!link) throw new Error("Milestone link failed");
    await recordPlanningMutation(tx, {
      workspaceId,
      contextId: task.contextId,
      objectId: task.objectId,
      actorUserId: mutation.actorUserId,
      action: "task.milestone_changed",
      eventName: "tasks.task.milestone_changed.v1",
      payload: { taskId, contextId: task.contextId, milestoneId, linked: true },
    });
    return link;
  });
}

export async function unlinkTaskMilestone(db: Database, workspaceId: string, taskId: string, milestoneId: string, mutation: TaskMutationContext = {}) {
  return db.transaction(async (tx) => {
    const [task] = await tx.select().from(tasks).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, taskId), isNull(tasks.archivedAt))).limit(1);
    if (!task) return null;
    const [link] = await tx.update(taskMilestoneLinks).set({ archivedAt: new Date(), updatedAt: new Date() }).where(and(
      eq(taskMilestoneLinks.workspaceId, workspaceId),
      eq(taskMilestoneLinks.taskId, taskId),
      eq(taskMilestoneLinks.milestoneId, milestoneId),
      isNull(taskMilestoneLinks.archivedAt),
    )).returning();
    if (!link) return null;
    await recordPlanningMutation(tx, {
      workspaceId,
      contextId: task.contextId,
      objectId: task.objectId,
      actorUserId: mutation.actorUserId,
      action: "task.milestone_changed",
      eventName: "tasks.task.milestone_changed.v1",
      payload: { taskId, contextId: task.contextId, milestoneId, linked: false },
    });
    return link;
  });
}

export async function listTaskMilestones(db: Database, workspaceId: string, taskId: string) {
  return db
    .select({ link: taskMilestoneLinks, milestone: taskMilestones })
    .from(taskMilestoneLinks)
    .innerJoin(taskMilestones, and(
      eq(taskMilestones.workspaceId, taskMilestoneLinks.workspaceId),
      eq(taskMilestones.id, taskMilestoneLinks.milestoneId),
      isNull(taskMilestones.archivedAt),
    ))
    .where(and(
      eq(taskMilestoneLinks.workspaceId, workspaceId),
      eq(taskMilestoneLinks.taskId, taskId),
      isNull(taskMilestoneLinks.archivedAt),
    ))
    .orderBy(asc(taskMilestones.dueAt));
}