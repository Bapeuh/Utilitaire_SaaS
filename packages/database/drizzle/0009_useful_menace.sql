CREATE TYPE "public"."task_dependency_type" AS ENUM('finish_start');--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"predecessor_task_id" uuid NOT NULL,
	"successor_task_id" uuid NOT NULL,
	"dependency_type" "task_dependency_type" DEFAULT 'finish_start' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "task_dependencies_unique" UNIQUE("workspace_id","predecessor_task_id","successor_task_id","dependency_type"),
	CONSTRAINT "task_dependencies_not_self_check" CHECK ("task_dependencies"."predecessor_task_id" <> "task_dependencies"."successor_task_id")
);
--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_predecessor_workspace_fk" FOREIGN KEY ("workspace_id","predecessor_task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_successor_workspace_fk" FOREIGN KEY ("workspace_id","successor_task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_dependencies_predecessor_idx" ON "task_dependencies" USING btree ("workspace_id","predecessor_task_id");--> statement-breakpoint
CREATE INDEX "task_dependencies_successor_idx" ON "task_dependencies" USING btree ("workspace_id","successor_task_id");