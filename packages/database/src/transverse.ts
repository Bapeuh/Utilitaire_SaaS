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

import { contexts, objects, workspaceUsers, workspaces } from "./schema.js";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
};

const mutableTimestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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
    actorUserId: uuid("actor_user_id"),
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
    foreignKey({
      name: "activities_actor_workspace_user_fk",
      columns: [table.workspaceId, table.actorUserId],
      foreignColumns: [workspaceUsers.workspaceId, workspaceUsers.userId],
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
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("outbox_events_workspace_id_id_unique").on(table.workspaceId, table.id),
    index("outbox_events_created_idx").on(table.createdAt),
    foreignKey({
      name: "outbox_events_object_workspace_fk",
      columns: [table.workspaceId, table.aggregateObjectId],
      foreignColumns: [objects.workspaceId, objects.id],
    }).onDelete("restrict"),
  ],
);

export const outboxDeliveries = pgTable(
  "outbox_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    eventId: uuid("event_id").notNull(),
    consumerKey: text("consumer_key").notNull(),
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("outbox_deliveries_consumer_event_unique").on(table.consumerKey, table.eventId),
    index("outbox_deliveries_pending_idx").on(
      table.consumerKey,
      table.status,
      table.availableAt,
      table.createdAt,
    ),
    foreignKey({
      name: "outbox_deliveries_event_workspace_fk",
      columns: [table.workspaceId, table.eventId],
      foreignColumns: [outboxEvents.workspaceId, outboxEvents.id],
    }).onDelete("restrict"),
    check(
      "outbox_deliveries_status_check",
      sql`${table.status} in ('pending', 'processing', 'processed', 'dead_letter')`,
    ),
    check("outbox_deliveries_attempts_nonnegative_check", sql`${table.attempts} >= 0`),
  ],
);

export const processedEvents = pgTable(
  "processed_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    consumerKey: text("consumer_key").notNull(),
    eventId: uuid("event_id").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("processed_events_consumer_event_unique").on(table.consumerKey, table.eventId),
    foreignKey({
      name: "processed_events_event_workspace_fk",
      columns: [table.workspaceId, table.eventId],
      foreignColumns: [outboxEvents.workspaceId, outboxEvents.id],
    }).onDelete("restrict"),
  ],
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

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "restrict" }),
    objectId: uuid("object_id").notNull(),
    authorUserId: uuid("author_user_id").notNull(),
    body: text("body").notNull(),
    ...mutableTimestamps,
  },
  (table) => [
    unique("comments_workspace_id_id_unique").on(table.workspaceId, table.id),
    index("comments_object_idx").on(table.workspaceId, table.objectId, table.createdAt),
    foreignKey({
      name: "comments_object_workspace_fk",
      columns: [table.workspaceId, table.objectId],
      foreignColumns: [objects.workspaceId, objects.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "comments_author_workspace_user_fk",
      columns: [table.workspaceId, table.authorUserId],
      foreignColumns: [workspaceUsers.workspaceId, workspaceUsers.userId],
    }).onDelete("restrict"),
  ],
);

export const files = pgTable(
  "files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "restrict" }),
    storageKey: text("storage_key").notNull(),
    name: text("name").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    uploaderUserId: uuid("uploader_user_id").notNull(),
    ...mutableTimestamps,
  },
  (table) => [
    unique("files_workspace_id_id_unique").on(table.workspaceId, table.id),
    unique("files_workspace_storage_key_unique").on(table.workspaceId, table.storageKey),
    foreignKey({
      name: "files_uploader_workspace_user_fk",
      columns: [table.workspaceId, table.uploaderUserId],
      foreignColumns: [workspaceUsers.workspaceId, workspaceUsers.userId],
    }).onDelete("restrict"),
    check("files_size_nonnegative_check", sql`${table.sizeBytes} is null or ${table.sizeBytes} >= 0`),
  ],
);

export const fileLinks = pgTable(
  "file_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "restrict" }),
    fileId: uuid("file_id").notNull(),
    objectId: uuid("object_id").notNull(),
    label: text("label"),
    ...timestamps,
  },
  (table) => [
    unique("file_links_workspace_file_object_unique").on(table.workspaceId, table.fileId, table.objectId),
    index("file_links_object_idx").on(table.workspaceId, table.objectId),
    foreignKey({
      name: "file_links_file_workspace_fk",
      columns: [table.workspaceId, table.fileId],
      foreignColumns: [files.workspaceId, files.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "file_links_object_workspace_fk",
      columns: [table.workspaceId, table.objectId],
      foreignColumns: [objects.workspaceId, objects.id],
    }).onDelete("restrict"),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    ...mutableTimestamps,
  },
  (table) => [
    unique("tags_workspace_id_id_unique").on(table.workspaceId, table.id),
    unique("tags_workspace_normalized_name_unique").on(table.workspaceId, table.normalizedName),
  ],
);

export const tagLinks = pgTable(
  "tag_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "restrict" }),
    tagId: uuid("tag_id").notNull(),
    objectId: uuid("object_id").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("tag_links_workspace_tag_object_unique").on(table.workspaceId, table.tagId, table.objectId),
    index("tag_links_object_idx").on(table.workspaceId, table.objectId),
    foreignKey({
      name: "tag_links_tag_workspace_fk",
      columns: [table.workspaceId, table.tagId],
      foreignColumns: [tags.workspaceId, tags.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "tag_links_object_workspace_fk",
      columns: [table.workspaceId, table.objectId],
      foreignColumns: [objects.workspaceId, objects.id],
    }).onDelete("restrict"),
  ],
);

export const objectRelations = pgTable(
  "object_relations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "restrict" }),
    sourceObjectId: uuid("source_object_id").notNull(),
    targetObjectId: uuid("target_object_id").notNull(),
    relationType: text("relation_type").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    ...timestamps,
  },
  (table) => [
    unique("object_relations_workspace_relation_unique").on(
      table.workspaceId,
      table.sourceObjectId,
      table.targetObjectId,
      table.relationType,
    ),
    index("object_relations_source_idx").on(table.workspaceId, table.sourceObjectId),
    index("object_relations_target_idx").on(table.workspaceId, table.targetObjectId),
    foreignKey({
      name: "object_relations_source_workspace_fk",
      columns: [table.workspaceId, table.sourceObjectId],
      foreignColumns: [objects.workspaceId, objects.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "object_relations_target_workspace_fk",
      columns: [table.workspaceId, table.targetObjectId],
      foreignColumns: [objects.workspaceId, objects.id],
    }).onDelete("restrict"),
    check("object_relations_not_self_check", sql`${table.sourceObjectId} <> ${table.targetObjectId}`),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "restrict" }),
    userId: uuid("user_id").notNull(),
    sourceObjectId: uuid("source_object_id"),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    data: jsonb("data").$type<Record<string, unknown>>().default({}).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("notifications_workspace_id_id_unique").on(table.workspaceId, table.id),
    index("notifications_user_unread_idx").on(table.workspaceId, table.userId, table.readAt, table.createdAt),
    foreignKey({
      name: "notifications_workspace_user_fk",
      columns: [table.workspaceId, table.userId],
      foreignColumns: [workspaceUsers.workspaceId, workspaceUsers.userId],
    }).onDelete("restrict"),
    foreignKey({
      name: "notifications_source_object_workspace_fk",
      columns: [table.workspaceId, table.sourceObjectId],
      foreignColumns: [objects.workspaceId, objects.id],
    }).onDelete("restrict"),
  ],
);

export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type NewOutboxEvent = typeof outboxEvents.$inferInsert;
export type OutboxDelivery = typeof outboxDeliveries.$inferSelect;
export type NewOutboxDelivery = typeof outboxDeliveries.$inferInsert;
export type ProcessedEvent = typeof processedEvents.$inferSelect;
export type NewProcessedEvent = typeof processedEvents.$inferInsert;
export type WorkspaceModule = typeof workspaceModules.$inferSelect;
export type NewWorkspaceModule = typeof workspaceModules.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type FileRecord = typeof files.$inferSelect;
export type NewFileRecord = typeof files.$inferInsert;
export type FileLink = typeof fileLinks.$inferSelect;
export type NewFileLink = typeof fileLinks.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type TagLink = typeof tagLinks.$inferSelect;
export type NewTagLink = typeof tagLinks.$inferInsert;
export type ObjectRelation = typeof objectRelations.$inferSelect;
export type NewObjectRelation = typeof objectRelations.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
