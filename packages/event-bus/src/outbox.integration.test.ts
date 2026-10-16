import {
  activities,
  createDatabase,
  outboxDeliveries,
  outboxEvents,
  processedEvents,
  workspaces,
} from "@utilitaire/database";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import {
  enqueueOutboxEvent,
  processOutboxBatch,
  recordActivityAndEvent,
  writeActivity,
} from "./index.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://utilitaire:utilitaire@localhost:5432/utilitaire";

const { client, db } = createDatabase(databaseUrl);

async function createWorkspace(name: string) {
  const [workspace] = await db.insert(workspaces).values({ name }).returning({ id: workspaces.id });
  if (!workspace) throw new Error("Test workspace creation failed");
  return workspace.id;
}

async function cleanupWorkspace(workspaceId: string) {
  await client`delete from processed_events where workspace_id = ${workspaceId}`;
  await client`delete from outbox_deliveries where workspace_id = ${workspaceId}`;
  await client`delete from outbox_events where workspace_id = ${workspaceId}`;
  await client`delete from activities where workspace_id = ${workspaceId}`;
  await client`delete from workspace_modules where workspace_id = ${workspaceId}`;
  await client`delete from workspaces where id = ${workspaceId}`;
}

afterAll(async () => {
  await client.end();
});

describe("transactional activity and outbox", () => {
  it("writes Activity and Outbox atomically and processes once for each consumer", async () => {
    const workspaceId = await createWorkspace("Outbox integration");
    try {
      const created = await recordActivityAndEvent(db, {
        activity: {
          workspaceId,
          moduleKey: "core",
          action: "test.created",
          metadata: { source: "integration" },
        },
        event: {
          workspaceId,
          eventName: "system.smoke",
          payload: { ok: true },
        },
      });

      expect(created.activityId).toBeTruthy();
      expect(created.eventId).toBeTruthy();

      let consumerACalls = 0;
      let consumerBCalls = 0;

      const firstA = await processOutboxBatch(
        db,
        async () => {
          consumerACalls += 1;
        },
        { consumerKey: "test.consumer.a", maxAttempts: 3, retryDelayMs: 0 },
      );
      const secondA = await processOutboxBatch(
        db,
        async () => {
          consumerACalls += 1;
        },
        { consumerKey: "test.consumer.a", maxAttempts: 3, retryDelayMs: 0 },
      );
      const firstB = await processOutboxBatch(
        db,
        async () => {
          consumerBCalls += 1;
        },
        { consumerKey: "test.consumer.b", maxAttempts: 3, retryDelayMs: 0 },
      );

      expect(firstA).toEqual([{ eventId: created.eventId, status: "processed" }]);
      expect(secondA).toEqual([]);
      expect(firstB).toEqual([{ eventId: created.eventId, status: "processed" }]);
      expect(consumerACalls).toBe(1);
      expect(consumerBCalls).toBe(1);

      const processed = await db
        .select()
        .from(processedEvents)
        .where(eq(processedEvents.eventId, created.eventId));
      expect(processed).toHaveLength(2);

      const deliveries = await db
        .select({ consumerKey: outboxDeliveries.consumerKey, status: outboxDeliveries.status })
        .from(outboxDeliveries)
        .where(eq(outboxDeliveries.eventId, created.eventId));
      expect(deliveries).toHaveLength(2);
      expect(deliveries.every((delivery) => delivery.status === "processed")).toBe(true);
    } finally {
      await cleanupWorkspace(workspaceId);
    }
  });

  it("rolls Activity and Outbox back with the surrounding transaction", async () => {
    const workspaceId = await createWorkspace("Outbox rollback");
    try {
      await expect(
        db.transaction(async (tx) => {
          await writeActivity(tx, { workspaceId, moduleKey: "core", action: "rollback.test" });
          await enqueueOutboxEvent(tx, { workspaceId, eventName: "system.smoke" });
          throw new Error("rollback");
        }),
      ).rejects.toThrow("rollback");

      const activityRows = await db
        .select()
        .from(activities)
        .where(eq(activities.workspaceId, workspaceId));
      const eventRows = await db
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.workspaceId, workspaceId));
      expect(activityRows).toHaveLength(0);
      expect(eventRows).toHaveLength(0);
    } finally {
      await cleanupWorkspace(workspaceId);
    }
  });

  it("retries and dead-letters independently for one consumer", async () => {
    const workspaceId = await createWorkspace("Outbox dead letter");
    try {
      const [event] = await db
        .insert(outboxEvents)
        .values({ workspaceId, eventName: "test.failure" })
        .returning({ id: outboxEvents.id });
      if (!event) throw new Error("Test event creation failed");

      const handler = async () => {
        throw new Error("expected failure");
      };

      const first = await processOutboxBatch(
        db,
        handler,
        { consumerKey: "test.failure.consumer", maxAttempts: 2, retryDelayMs: 0 },
      );
      const second = await processOutboxBatch(
        db,
        handler,
        { consumerKey: "test.failure.consumer", maxAttempts: 2, retryDelayMs: 0 },
      );

      expect(first).toEqual([{ eventId: event.id, status: "failed" }]);
      expect(second).toEqual([{ eventId: event.id, status: "dead_letter" }]);

      const [stored] = await db
        .select({ status: outboxDeliveries.status, attempts: outboxDeliveries.attempts })
        .from(outboxDeliveries)
        .where(
          and(
            eq(outboxDeliveries.eventId, event.id),
            eq(outboxDeliveries.consumerKey, "test.failure.consumer"),
          ),
        );
      expect(stored).toMatchObject({ status: "dead_letter", attempts: 2 });

      let healthyCalls = 0;
      const healthy = await processOutboxBatch(
        db,
        async () => {
          healthyCalls += 1;
        },
        { consumerKey: "test.healthy.consumer", maxAttempts: 2, retryDelayMs: 0 },
      );
      expect(healthy).toEqual([{ eventId: event.id, status: "processed" }]);
      expect(healthyCalls).toBe(1);
    } finally {
      await cleanupWorkspace(workspaceId);
    }
  });
});
