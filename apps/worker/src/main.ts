import { createDatabase } from "@utilitaire/database";
import { processOutboxBatch, type OutboxHandler } from "@utilitaire/event-bus";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://utilitaire:utilitaire@localhost:5432/utilitaire";

const { client, db } = createDatabase(databaseUrl);

const handlers = new Map<string, OutboxHandler>();

handlers.set("system.smoke", async () => {
  // Infrastructure smoke event: intentionally no-op.
});

const dispatch: OutboxHandler = async (tx, event) => {
  const handler = handlers.get(event.eventName);
  if (!handler) {
    throw new Error(`No outbox handler registered for ${event.eventName}`);
  }
  await handler(tx, event);
};

let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const results = await processOutboxBatch(
      db,
      dispatch,
      { consumerKey: "worker.main", maxAttempts: 5, retryDelayMs: 5_000 },
      20,
    );

    if (results.length > 0) {
      console.log("Outbox batch", results);
    }
  } catch (error) {
    console.error("Outbox worker tick failed", error);
  } finally {
    running = false;
  }
}

console.log("Utilitaire worker ready");
await tick();
const timer = setInterval(() => void tick(), 2_000);

async function shutdown() {
  clearInterval(timer);
  await client.end();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
