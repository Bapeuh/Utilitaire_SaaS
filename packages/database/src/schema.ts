import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
};

export const contextType = pgEnum("context_type", ["workspace", "scope", "project"]);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  ...timestamps,
});

export const contexts = pgTable(
  "contexts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    type: contextType("type").notNull(),
    parentContextId: uuid("parent_context_id"),
    ...timestamps,
  },
  (table) => [
    unique("contexts_workspace_id_id_unique").on(table.workspaceId, table.id),
    uniqueIndex("contexts_one_workspace_root_unique")
      .on(table.workspaceId)
      .where(sql`${table.type} = 'workspace'`),
    foreignKey({
      name: "contexts_parent_workspace_fk",
      columns: [table.workspaceId, table.parentContextId],
      foreignColumns: [table.workspaceId, table.id],
    }).onDelete("restrict"),
    check(
      "contexts_parent_not_self_check",
      sql`${table.parentContextId} is null or ${table.parentContextId} <> ${table.id}`,
    ),
    check(
      "contexts_workspace_root_shape_check",
      sql`${table.type} <> 'workspace' or ${table.parentContextId} is null`,
    ),
  ],
);

export const objects = pgTable(
  "objects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    contextId: uuid("context_id"),
    moduleKey: text("module_key").notNull(),
    objectType: text("object_type").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("objects_workspace_id_id_unique").on(table.workspaceId, table.id),
    foreignKey({
      name: "objects_context_workspace_fk",
      columns: [table.workspaceId, table.contextId],
      foreignColumns: [contexts.workspaceId, contexts.id],
    }).onDelete("restrict"),
  ],
);

export const scopes = pgTable(
  "scopes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    contextId: uuid("context_id").notNull().unique(),
    objectId: uuid("object_id").notNull().unique(),
    name: text("name").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("scopes_workspace_id_id_unique").on(table.workspaceId, table.id),
    foreignKey({
      name: "scopes_context_workspace_fk",
      columns: [table.workspaceId, table.contextId],
      foreignColumns: [contexts.workspaceId, contexts.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "scopes_object_workspace_fk",
      columns: [table.workspaceId, table.objectId],
      foreignColumns: [objects.workspaceId, objects.id],
    }).onDelete("restrict"),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    contextId: uuid("context_id").notNull().unique(),
    objectId: uuid("object_id").notNull().unique(),
    name: text("name").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("projects_workspace_id_id_unique").on(table.workspaceId, table.id),
    foreignKey({
      name: "projects_context_workspace_fk",
      columns: [table.workspaceId, table.contextId],
      foreignColumns: [contexts.workspaceId, contexts.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "projects_object_workspace_fk",
      columns: [table.workspaceId, table.objectId],
      foreignColumns: [objects.workspaceId, objects.id],
    }).onDelete("restrict"),
  ],
);

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type Context = typeof contexts.$inferSelect;
export type NewContext = typeof contexts.$inferInsert;
export type RegistryObject = typeof objects.$inferSelect;
export type NewRegistryObject = typeof objects.$inferInsert;
export type Scope = typeof scopes.$inferSelect;
export type NewScope = typeof scopes.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
