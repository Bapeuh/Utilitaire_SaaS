import {
  activities,
  createDatabase,
  outboxDeliveries,
  outboxEvents,
  processedEvents,
  type OutboxEvent,
} from "@utilitaire/database";
import { and, asc, eq, isNull, lte, or } from "drizzle-orm";

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
  lockTimeoutMs?: number;
}

type ResolvedProcessOutboxOptions = Required<ProcessOutboxOptions>;
type ProcessStatus = "processed" | "skipped" | "failed" | "dead_letter";

async function alreadyProcessed(tx: Transaction, consumerKey: string, eventId: string) {
  const [row] = await tx
    .select({ id: processedEvents.id })
    .from(processedEvents)
    .where(and(eq(processedEvents.consumerKey, consumerKey), eq(processedEvents.eventId, eventId)))
    .limit(1);
  return Boolean(row);
}

async function ensureDelivery(db: Database, eventId: string, consumerKey: string) {
  const [event] = await db
    .select({ id: outboxEvents.id, workspaceId: outboxEvents.workspaceId })
    .from(outboxEvents)
    .where(eq(outboxEvents.id, eventId))
    .limit(1);

  if (!event) return null;

  await db
    .insert(outboxDeliveries)
    .values({
      workspaceId: event.workspaceId,
      eventId: event.id,
      consumerKey,
    })
    .onConflictDoNothing({
      target: [outboxDeliveries.consumerKey, outboxDeliveries.eventId],
    });

  return event;
}

async function processOne(
  db: Database,
  eventId: string,
  handler: OutboxHandler,
  options: ResolvedProcessOutboxOptions,
): Promise<ProcessStatus> {
  const ensured = await ensureDelivery(db, eventId, options.consumerKey);
  if (!ensured) return "skipped";

  const now = new Date();
  const staleBefore = new Date(now.getTime() - options.lockTimeoutMs);

  try {
    return await db.transaction(async (tx) => {
      const [event] = await tx
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.id, eventId))
        .limit(1);

      if (!event) return "skipped" as const;

      const [delivery] = await tx
        .select()
        .from(outboxDeliveries)
        .where(
          and(
            eq(outboxDeliveries.consumerKey, options.consumerKey),
            eq(outboxDeliveries.eventId, eventId),
          ),
        )
        .limit(1);

      if (!delivery || delivery.status === "processed" || delivery.status === "dead_letter") {
        return "skipped" as const;
      }

      const claimable = or(
        and(
          eq(outboxDeliveries.status, "pending"),
          lte(outboxDeliveries.availableAt, now),
        ),
        and(
          eq(outboxDeliveries.status, "processing"),
          lte(outboxDeliveries.lockedAt, staleBefore),
        ),
      );

      const [claimed] = await tx
        .update(outboxDeliveries)
        .set({ status: "processing", lockedAt: now })
        .where(
          and(
            eq(outboxDeliveries.id, delivery.id),
            claimable,
          ),
        )
        .returning({ id: outboxDeliveries.id });

      if (!claimed) return "skipped" as const;

      if (await alreadyProcessed(tx, options.consumerKey, event.id)) {
        await tx
          .update(outboxDeliveries)
          .set({
            status: "processed",
            processedAt: now,
            lockedAt: null,
            lastError: null,
          })
          .where(eq(outboxDeliveries.id, delivery.id));
        return "processed" as const;
      }

      await handler(tx, event);
      await tx.insert(processedEvents).values({
        workspaceId: event.workspaceId,
        consumerKey: options.consumerKey,
        eventId: event.id,
      });
      await tx
        .update(outboxDeliveries)
        .set({
          status: "processed",
          attempts: delivery.attempts + 1,
          processedAt: now,
          lockedAt: null,
          lastError: null,
        })
        .where(eq(outboxDeliveries.id, delivery.id));

      return "processed" as const;
    });
  } catch (error) {
    const [current] = await db
      .select({ id: outboxDeliveries.id, attempts: outboxDeliveries.attempts })
      .from(outboxDeliveries)
      .where(
        and(
          eq(outboxDeliveries.consumerKey, options.consumerKey),
          eq(outboxDeliveries.eventId, eventId),
        ),
      )
      .limit(1);

    if (!current) return "failed";

    const attempts = current.attempts + 1;
    const deadLetter = attempts >= options.maxAttempts;
    const message = error instanceof Error ? error.message : String(error);

    await db
      .update(outboxDeliveries)
      .set({
        status: deadLetter ? "dead_letter" : "pending",
        attempts,
        availableAt: new Date(Date.now() + options.retryDelayMs * attempts),
        lockedAt: null,
        lastError: message.slice(0, 4000),
      })
      .where(eq(outboxDeliveries.id, current.id));

    return deadLetter ? "dead_letter" : "failed";
  }
}

export async function processOutboxBatch(
  db: Database,
  handler: OutboxHandler,
  options: ProcessOutboxOptions,
  limit = 20,
) {
  const resolved: ResolvedProcessOutboxOptions = {
    consumerKey: options.consumerKey,
    maxAttempts: options.maxAttempts ?? 5,
    retryDelayMs: options.retryDelayMs ?? 5_000,
    lockTimeoutMs: options.lockTimeoutMs ?? 60_000,
  };

  const now = new Date();
  const staleBefore = new Date(now.getTime() - resolved.lockTimeoutMs);

  const events = await db
    .select({ id: outboxEvents.id })
    .from(outboxEvents)
    .leftJoin(
      outboxDeliveries,
      and(
        eq(outboxDeliveries.eventId, outboxEvents.id),
        eq(outboxDeliveries.consumerKey, resolved.consumerKey),
      ),
    )
    .where(
      or(
        isNull(outboxDeliveries.id),
        and(
          eq(outboxDeliveries.status, "pending"),
          lte(outboxDeliveries.availableAt, now),
        ),
        and(
          eq(outboxDeliveries.status, "processing"),
          lte(outboxDeliveries.lockedAt, staleBefore),
        ),
      ),
    )
    .orderBy(asc(outboxEvents.createdAt))
    .limit(limit);

  const results: Array<{ eventId: string; status: ProcessStatus }> = [];
  for (const event of events) {
    results.push({
      eventId: event.id,
      status: await processOne(db, event.id, handler, resolved),
    });
  }

  return results;
}
