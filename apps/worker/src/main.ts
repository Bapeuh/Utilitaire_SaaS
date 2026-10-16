import {
  createDatabase,
  notifications,
  persons,
  teamMembers,
} from "@utilitaire/database";
import { processOutboxBatch, type OutboxHandler } from "@utilitaire/event-bus";
import { and, eq, isNull } from "drizzle-orm";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://utilitaire:utilitaire@localhost:5432/utilitaire";

const { client, db } = createDatabase(databaseUrl);

const handlers = new Map<string, OutboxHandler>();
const noop: OutboxHandler = async () => {};

handlers.set("system.smoke", noop);
for (const eventName of [
  "tasks.task.created.v1",
  "tasks.task.updated.v1",
  "tasks.task.moved.v1",
  "tasks.task.archived.v1",
  "core.comment.created.v1",
  "core.comment.archived.v1",
  "core.file.linked.v1",
  "core.file.unlinked.v1",
  "core.tag.linked.v1",
  "core.tag.unlinked.v1",
  "core.relation.created.v1",
  "core.relation.archived.v1",
]) {
  handlers.set(eventName, noop);
}

handlers.set("tasks.task.assignment_changed.v1", async (tx, event) => {
  const assigned = event.payload.assigned;
  const assignmentType = event.payload.assignmentType;
  const assigneeId = event.payload.assigneeId;
  const taskId = event.payload.taskId;
  if (assigned !== true || typeof assignmentType !== "string" || typeof assigneeId !== "string") return;

  const userIds = new Set<string>();
  if (assignmentType === "person") {
    const [person] = await tx
      .select({ userId: persons.userId })
      .from(persons)
      .where(and(eq(persons.workspaceId, event.workspaceId), eq(persons.id, assigneeId), isNull(persons.archivedAt)))
      .limit(1);
    if (person?.userId) userIds.add(person.userId);
  } else if (assignmentType === "team") {
    const rows = await tx
      .select({ userId: persons.userId })
      .from(teamMembers)
      .innerJoin(persons, and(eq(persons.workspaceId, teamMembers.workspaceId), eq(persons.id, teamMembers.personId)))
      .where(and(eq(teamMembers.workspaceId, event.workspaceId), eq(teamMembers.teamId, assigneeId), isNull(teamMembers.archivedAt), isNull(persons.archivedAt)));
    for (const row of rows) if (row.userId) userIds.add(row.userId);
  }

  for (const userId of userIds) {
    await tx.insert(notifications).values({
      workspaceId: event.workspaceId,
      userId,
      sourceObjectId: event.aggregateObjectId,
      type: "task.assigned",
      title: "Nouvelle tâche assignée",
      body: typeof taskId === "string" ? `Tâche ${taskId}` : null,
      data: event.payload,
    });
  }
});

const dispatch: OutboxHandler = async (tx, event) => {
  const handler = handlers.get(event.eventName);
  if (!handler) throw new Error(`No outbox handler registered for ${event.eventName}`);
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
    if (results.length > 0) console.log("Outbox batch", results);
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
