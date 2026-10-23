import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { contexts, objects, persons, teams, workspaces } from "./schema.js";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
};

export const taskStatus = pgEnum("task_status", ["todo", "in_progress", "blocked", "done", "cancelled"]);
export const taskPriority = pgEnum("task_priority", ["low", "normal", "high", "urgent"]);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    objectId: uuid("object_id").notNull().unique(),
    contextId: uuid("context_id").notNull(),
    parentTaskId: uuid("parent_task_id"),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatus("status").default("todo").notNull(),
    priority: taskPriority("priority"),
    startAt: timestamp("start_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    estimatedMinutes: integer("estimated_minutes"),
    position: integer("position").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    unique("tasks_workspace_id_id_unique").on(table.workspaceId, table.id),
    index("tasks_workspace_context_idx").on(table.workspaceId, table.contextId),
    index("tasks_workspace_parent_idx").on(table.workspaceId, table.parentTaskId),
    index("tasks_workspace_status_idx").on(table.workspaceId, table.status),
    foreignKey({
      name: "tasks_object_workspace_fk",
      columns: [table.workspaceId, table.objectId],
      foreignColumns: [objects.workspaceId, objects.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "tasks_context_workspace_fk",
      columns: [table.workspaceId, table.contextId],
      foreignColumns: [contexts.workspaceId, contexts.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "tasks_parent_workspace_fk",
      columns: [table.workspaceId, table.parentTaskId],
      foreignColumns: [table.workspaceId, table.id],
    }).onDelete("restrict"),
    check("tasks_parent_not_self_check", sql`${table.parentTaskId} is null or ${table.parentTaskId} <> ${table.id}`),
    check("tasks_estimated_minutes_nonnegative_check", sql`${table.estimatedMinutes} is null or ${table.estimatedMinutes} >= 0`),
    check("tasks_dates_order_check", sql`${table.startAt} is null or ${table.dueAt} is null or ${table.startAt} <= ${table.dueAt}`),
  ],
);

export const taskPersonAssignments = pgTable(
  "task_person_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    taskId: uuid("task_id").notNull(),
    personId: uuid("person_id").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("task_person_assignments_unique").on(table.workspaceId, table.taskId, table.personId),
    index("task_person_assignments_person_idx").on(table.workspaceId, table.personId),
    foreignKey({
      name: "task_person_assignments_task_workspace_fk",
      columns: [table.workspaceId, table.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "task_person_assignments_person_workspace_fk",
      columns: [table.workspaceId, table.personId],
      foreignColumns: [persons.workspaceId, persons.id],
    }).onDelete("restrict"),
  ],
);

export const taskTeamAssignments = pgTable(
  "task_team_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    taskId: uuid("task_id").notNull(),
    teamId: uuid("team_id").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("task_team_assignments_unique").on(table.workspaceId, table.taskId, table.teamId),
    index("task_team_assignments_team_idx").on(table.workspaceId, table.teamId),
    foreignKey({
      name: "task_team_assignments_task_workspace_fk",
      columns: [table.workspaceId, table.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "task_team_assignments_team_workspace_fk",
      columns: [table.workspaceId, table.teamId],
      foreignColumns: [teams.workspaceId, teams.id],
    }).onDelete("restrict"),
  ],
);

export const taskChecklistItems = pgTable(
  "task_checklist_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    taskId: uuid("task_id").notNull(),
    label: text("label").notNull(),
    isDone: boolean("is_done").default(false).notNull(),
    position: integer("position").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    unique("task_checklist_items_workspace_id_id_unique").on(table.workspaceId, table.id),
    index("task_checklist_items_task_idx").on(table.workspaceId, table.taskId, table.position),
    foreignKey({
      name: "task_checklist_items_task_workspace_fk",
      columns: [table.workspaceId, table.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }).onDelete("restrict"),
  ],
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskPersonAssignment = typeof taskPersonAssignments.$inferSelect;
export type NewTaskPersonAssignment = typeof taskPersonAssignments.$inferInsert;
export type TaskTeamAssignment = typeof taskTeamAssignments.$inferSelect;
export type NewTaskTeamAssignment = typeof taskTeamAssignments.$inferInsert;
export type TaskChecklistItem = typeof taskChecklistItems.$inferSelect;
export type NewTaskChecklistItem = typeof taskChecklistItems.$inferInsert;
