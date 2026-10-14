import {
  activities,
  createDatabase,
  outboxEvents,
  processedEvents,
  type OutboxEvent,
} from "@utilitaire/database";
import { and, asc, eq, lte } from "drizzle-orm";

export type DomainEvent<T = Record<string, unknown>> = {
  id: string;
  name: string;
  version: number;
  workspaceId: string;
  occurredAt: string;
  payload: T;
};

type Database = ReturnType<typeof createDatabase>["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Pick<Transaction, "insert" | "select" | "update">;

export interface ActivityInput {
  workspaceId: string;
  contextId?: string | null;
  objectId?: string | null;
  actorUserId?: string | null;
  moduleKey: string;
  action: string;
  metadata?: Record<string, unknown>;
}

export interface OutboxInput {
  workspaceId: string;
  eventName: string;
  eventVersion?: number;
  aggregateObjectId?: string | null;
  payload?: Record<string, unknown>;
}

export interface ActivityAndEventInput {
  activity: ActivityInput;
  event: OutboxInput;
}

function optionalValue<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

export async function writeActivity(executor: Executor, input: ActivityInput) {
  const [activity] = await executor
    .insert(activities)
    .values({
      workspaceId: input.workspaceId,
      contextId: optionalValue(input.contextId),
      objectId: optionalValue(input.objectId),
      actorUserId: optionalValue(input.actorUserId),
      moduleKey: input.moduleKey,
      action: input.action,
      metadata: input.metadata ?? {},
    })
    .returning({ id: activities.id });

  if (!activity) throw new Error("Activity creation failed");
  return activity;
}

export async function enqueueOutboxEvent(executor: Executor, input: OutboxInput) {
  const [event] = await executor
    .insert(outboxEvents)
    .values({
      workspaceId: input.workspaceId,
      eventName: input.eventName,
      eventVersion: input.eventVersion ?? 1,
      aggregateObjectId: optionalValue(input.aggregateObjectId),
      payload: input.payload ?? {},
    })
    .returning({ id: outboxEvents.id });

  if (!event) throw new Error("Outbox event creation failed");
  return event;
}

export async function recordActivityAndEvent(db: Database, input: ActivityAndEventInput) {
  return db.transaction(async (tx) => {
    const activity = await writeActivity(tx, input.activity);
    const event = await enqueueOutboxEvent(tx, input.event);
    return { activityId: activity.id, eventId: event.id };
  });
}

export type OutboxHandler = (tx: Transaction, event: OutboxEvent) => Promise<void>;

export interface ProcessOutboxOptions {
  consumerKey: string;
  maxAttempts?: number;
  retryDelayMs?: number;
}

async function alreadyProcessed(tx: Transaction, consumerKey: string, eventId: string) {
  const [row] = await tx
    .select({ id: processedEvents.id })
    .from(processedEvents)
    .where(and(eq(processedEvents.consumerKey, consumerKey), eq(processedEvents.eventId, eventId)))
    .limit(1);
  return Boolean(row);
}

async function processOne(
  db: Database,
  eventId: string,
  handler: OutboxHandler,
  options: Required<ProcessOutboxOptions>,
): Promise<"processed" | "skipped" | "failed" | "dead_letter"> {
  try {
    const result = await db.transaction(async (tx) => {
      const [event] = await tx
        .select()
        .from(outboxEvents)
        .where(and(eq(outboxEvents.id, eventId), eq(outboxEvents.status, "pending")))
        .limit(1);

      if (!event) return "skipped" as const;

      const [claimed] = await tx
        .update(outboxEvents)
        .set({ status: "processing", lockedAt: new Date() })
        .where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.status, "pending")))
        .returning({ id: outboxEvents.id });

      if (!claimed) return "skipped" as const;

      if (await alreadyProcessed(tx, options.consumerKey, event.id)) {
        await tx
          .update(outboxEvents)
          .set({ status: "processed", processedAt: new Date(), lockedAt: null, lastError: null })
          .where(eq(outboxEvents.id, event.id));
        return "processed" as const;
      }

      await handler(tx, event);
      await tx.insert(processedEvents).values({ consumerKey: options.consumerKey, eventId: event.id });
      await tx
        .update(outboxEvents)
        .set({
          status: "processed",
          attempts: event.attempts + 1,
          processedAt: new Date(),
          lockedAt: null,
          lastError: null,
        })
        .where(eq(outboxEvents.id, event.id));

      return "processed" as const;
    });

    return result;
  } catch (error) {
    const [current] = await db
      .select({ attempts: outboxEvents.attempts })
      .from(outboxEvents)
      .where(eq(outboxEvents.id, eventId))
      .limit(1);

    if (!current) return "failed";

    const attempts = current.attempts + 1;
    const deadLetter = attempts >= options.maxAttempts;
    const message = error instanceof Error ? error.message : String(error);

    await db
      .update(outboxEvents)
      .set({
        status: deadLetter ? "dead_letter" : "pending",
        attempts,
        availableAt: new Date(Date.now() + options.retryDelayMs * attempts),
        lockedAt: null,
        lastError: message.slice(0, 4000),
      })
      .where(eq(outboxEvents.id, eventId));

    return deadLetter ? "dead_letter" : "failed";
  }
}

export async function processOutboxBatch(
  db: Database,
  handler: OutboxHandler,
  options: ProcessOutboxOptions,
  limit = 20,
) {
  const resolved: Required<ProcessOutboxOptions> = {
    consumerKey: options.consumerKey,
    maxAttempts: options.maxAttempts ?? 5,
    retryDelayMs: options.retryDelayMs ?? 5_000,
  };

  const events = await db
    .select({ id: outboxEvents.id })
    .from(outboxEvents)
    .where(and(eq(outboxEvents.status, "pending"), lte(outboxEvents.availableAt, new Date())))
    .orderBy(asc(outboxEvents.createdAt))
    .limit(limit);

  const results = [] as Array<{ eventId: string; status: "processed" | "skipped" | "failed" | "dead_letter" }>;
  for (const event of events) {
    results.push({
      eventId: event.id,
      status: await processOne(db, event.id, handler, resolved),
    });
  }

  return results;
}
