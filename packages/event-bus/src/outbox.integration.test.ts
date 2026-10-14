import {
  activities,
  createDatabase,
  outboxEvents,
  processedEvents,
  workspaces,
} from "@utilitaire/database";
import { eq } from "drizzle-orm";
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
  await client`delete from processed_events where event_id in (select id from outbox_events where workspace_id = ${workspaceId})`;
  await client`delete from outbox_events where workspace_id = ${workspaceId}`;
  await client`delete from activities where workspace_id = ${workspaceId}`;
  await client`delete from workspace_modules where workspace_id = ${workspaceId}`;
  await client`delete from workspaces where id = ${workspaceId}`;
}

afterAll(async () => {
  await client.end();
});

describe("transactional activity and outbox", () => {
  it("writes Activity and Outbox atomically and processes exactly once per consumer", async () => {
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

      let calls = 0;
      const first = await processOutboxBatch(
        db,
        async () => {
          calls += 1;
        },
        { consumerKey: "test.consumer", maxAttempts: 3, retryDelayMs: 0 },
      );
      const second = await processOutboxBatch(
        db,
        async () => {
          calls += 1;
        },
        { consumerKey: "test.consumer", maxAttempts: 3, retryDelayMs: 0 },
      );

      expect(first).toEqual([{ eventId: created.eventId, status: "processed" }]);
      expect(second).toEqual([]);
      expect(calls).toBe(1);

      const processed = await db
        .select()
        .from(processedEvents)
        .where(eq(processedEvents.eventId, created.eventId));
      expect(processed).toHaveLength(1);
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

  it("retries failures and dead-letters after the configured maximum", async () => {
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
        .select({ status: outboxEvents.status, attempts: outboxEvents.attempts })
        .from(outboxEvents)
        .where(eq(outboxEvents.id, event.id));
      expect(stored).toMatchObject({ status: "dead_letter", attempts: 2 });
    } finally {
      await cleanupWorkspace(workspaceId);
    }
  });
});
