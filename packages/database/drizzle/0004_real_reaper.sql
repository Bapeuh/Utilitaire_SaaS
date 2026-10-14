CREATE TABLE "access_role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"access_role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "access_role_permissions_unique" UNIQUE("workspace_id","access_role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "access_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"system_key" "workspace_user_role",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "access_roles_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "access_roles_workspace_name_unique" UNIQUE("workspace_id","name"),
	CONSTRAINT "access_roles_workspace_system_key_unique" UNIQUE("workspace_id","system_key")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"module_key" text NOT NULL,
	"object_type" text NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "permissions_key_unique" UNIQUE("key"),
	CONSTRAINT "permissions_capability_unique" UNIQUE("module_key","object_type","action")
);
--> statement-breakpoint
CREATE TABLE "team_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"context_id" uuid NOT NULL,
	"access_role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "team_access_grants_unique" UNIQUE("workspace_id","team_id","context_id","access_role_id")
);
--> statement-breakpoint
CREATE TABLE "user_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"context_id" uuid NOT NULL,
	"access_role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "user_access_grants_unique" UNIQUE("workspace_id","user_id","context_id","access_role_id")
);
--> statement-breakpoint
ALTER TABLE "access_role_permissions" ADD CONSTRAINT "access_role_permissions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_role_permissions" ADD CONSTRAINT "access_role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_role_permissions" ADD CONSTRAINT "access_role_permissions_role_workspace_fk" FOREIGN KEY ("workspace_id","access_role_id") REFERENCES "public"."access_roles"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_roles" ADD CONSTRAINT "access_roles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_access_grants" ADD CONSTRAINT "team_access_grants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_access_grants" ADD CONSTRAINT "team_access_grants_team_workspace_fk" FOREIGN KEY ("workspace_id","team_id") REFERENCES "public"."teams"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_access_grants" ADD CONSTRAINT "team_access_grants_context_workspace_fk" FOREIGN KEY ("workspace_id","context_id") REFERENCES "public"."contexts"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_access_grants" ADD CONSTRAINT "team_access_grants_role_workspace_fk" FOREIGN KEY ("workspace_id","access_role_id") REFERENCES "public"."access_roles"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_access_grants" ADD CONSTRAINT "user_access_grants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_access_grants" ADD CONSTRAINT "user_access_grants_workspace_user_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."workspace_users"("workspace_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_access_grants" ADD CONSTRAINT "user_access_grants_context_workspace_fk" FOREIGN KEY ("workspace_id","context_id") REFERENCES "public"."contexts"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_access_grants" ADD CONSTRAINT "user_access_grants_role_workspace_fk" FOREIGN KEY ("workspace_id","access_role_id") REFERENCES "public"."access_roles"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_access_grants_lookup_idx" ON "team_access_grants" USING btree ("workspace_id","team_id","context_id");--> statement-breakpoint
CREATE INDEX "user_access_grants_lookup_idx" ON "user_access_grants" USING btree ("workspace_id","user_id","context_id");