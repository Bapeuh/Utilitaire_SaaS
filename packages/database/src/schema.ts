import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
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

const authTimestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  ...authTimestamps,
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...authTimestamps,
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    ...authTimestamps,
  },
  (table) => [
    index("accounts_user_id_idx").on(table.userId),
    unique("accounts_provider_account_unique").on(table.providerId, table.accountId),
  ],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...authTimestamps,
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

export const contextType = pgEnum("context_type", ["workspace", "scope", "project"]);
export const workspaceUserRole = pgEnum("workspace_user_role", [
  "administrator",
  "manager",
  "member",
  "guest",
]);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  ...timestamps,
});

export const workspaceUsers = pgTable(
  "workspace_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: workspaceUserRole("role").default("member").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("workspace_users_workspace_user_unique").on(table.workspaceId, table.userId),
    index("workspace_users_user_id_idx").on(table.userId),
  ],
);

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

export const persons = pgTable(
  "persons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    objectId: uuid("object_id").notNull().unique(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    displayName: text("display_name").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("persons_workspace_id_id_unique").on(table.workspaceId, table.id),
    unique("persons_workspace_user_unique").on(table.workspaceId, table.userId),
    foreignKey({
      name: "persons_object_workspace_fk",
      columns: [table.workspaceId, table.objectId],
      foreignColumns: [objects.workspaceId, objects.id],
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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Verification = typeof verifications.$inferSelect;
export type NewVerification = typeof verifications.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type WorkspaceUser = typeof workspaceUsers.$inferSelect;
export type NewWorkspaceUser = typeof workspaceUsers.$inferInsert;
export type Context = typeof contexts.$inferSelect;
export type NewContext = typeof contexts.$inferInsert;
export type RegistryObject = typeof objects.$inferSelect;
export type NewRegistryObject = typeof objects.$inferInsert;
export type Person = typeof persons.$inferSelect;
export type NewPerson = typeof persons.$inferInsert;
export type Scope = typeof scopes.$inferSelect;
export type NewScope = typeof scopes.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
