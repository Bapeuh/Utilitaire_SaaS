import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { contexts, objects, users, workspaces } from "./schema.js";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
};

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    contextId: uuid("context_id"),
    objectId: uuid("object_id"),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    moduleKey: text("module_key").notNull(),
    action: text("action").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => [
    index("activities_workspace_occurred_idx").on(table.workspaceId, table.occurredAt),
    index("activities_object_idx").on(table.workspaceId, table.objectId),
    foreignKey({
      name: "activities_context_workspace_fk",
      columns: [table.workspaceId, table.contextId],
      foreignColumns: [contexts.workspaceId, contexts.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "activities_object_workspace_fk",
      columns: [table.workspaceId, table.objectId],
      foreignColumns: [objects.workspaceId, objects.id],
    }).onDelete("restrict"),
  ],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    eventName: text("event_name").notNull(),
    eventVersion: integer("event_version").default(1).notNull(),
    aggregateObjectId: uuid("aggregate_object_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("outbox_events_pending_idx").on(table.status, table.availableAt, table.createdAt),
    foreignKey({
      name: "outbox_events_object_workspace_fk",
      columns: [table.workspaceId, table.aggregateObjectId],
      foreignColumns: [objects.workspaceId, objects.id],
    }).onDelete("restrict"),
    check(
      "outbox_events_status_check",
      sql`${table.status} in ('pending', 'processing', 'processed', 'dead_letter')`,
    ),
    check("outbox_events_attempts_nonnegative_check", sql`${table.attempts} >= 0`),
  ],
);

export const processedEvents = pgTable(
  "processed_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    consumerKey: text("consumer_key").notNull(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => outboxEvents.id, { onDelete: "restrict" }),
    processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique("processed_events_consumer_event_unique").on(table.consumerKey, table.eventId)],
);

export const workspaceModules = pgTable(
  "workspace_modules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    moduleKey: text("module_key").notNull(),
    status: text("status").default("enabled").notNull(),
    installedVersion: text("installed_version"),
    ...timestamps,
  },
  (table) => [
    unique("workspace_modules_workspace_module_unique").on(table.workspaceId, table.moduleKey),
    check("workspace_modules_status_check", sql`${table.status} in ('enabled', 'disabled')`),
  ],
);

export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type NewOutboxEvent = typeof outboxEvents.$inferInsert;
export type ProcessedEvent = typeof processedEvents.$inferSelect;
export type NewProcessedEvent = typeof processedEvents.$inferInsert;
export type WorkspaceModule = typeof workspaceModules.$inferSelect;
export type NewWorkspaceModule = typeof workspaceModules.$inferInsert;
