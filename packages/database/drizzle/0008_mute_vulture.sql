CREATE TYPE "public"."milestone_status" AS ENUM('open', 'reached', 'cancelled');--> statement-breakpoint
CREATE TABLE "task_milestone_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"milestone_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "task_milestone_links_unique" UNIQUE("workspace_id","task_id","milestone_id")
);
--> statement-breakpoint
CREATE TABLE "task_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"object_id" uuid NOT NULL,
	"context_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"due_at" timestamp with time zone NOT NULL,
	"status" "milestone_status" DEFAULT 'open' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "task_milestones_object_id_unique" UNIQUE("object_id"),
	CONSTRAINT "task_milestones_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "task_milestones_position_nonnegative_check" CHECK ("task_milestones"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "task_phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"object_id" uuid NOT NULL,
	"context_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"start_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "task_phases_object_id_unique" UNIQUE("object_id"),
	CONSTRAINT "task_phases_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "task_phases_position_nonnegative_check" CHECK ("task_phases"."position" >= 0),
	CONSTRAINT "task_phases_dates_order_check" CHECK ("task_phases"."start_at" is null or "task_phases"."due_at" is null or "task_phases"."start_at" <= "task_phases"."due_at")
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "phase_id" uuid;--> statement-breakpoint
ALTER TABLE "task_milestone_links" ADD CONSTRAINT "task_milestone_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_milestone_links" ADD CONSTRAINT "task_milestone_links_task_workspace_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_milestone_links" ADD CONSTRAINT "task_milestone_links_milestone_workspace_fk" FOREIGN KEY ("workspace_id","milestone_id") REFERENCES "public"."task_milestones"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_milestones" ADD CONSTRAINT "task_milestones_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_milestones" ADD CONSTRAINT "task_milestones_object_workspace_fk" FOREIGN KEY ("workspace_id","object_id") REFERENCES "public"."objects"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_milestones" ADD CONSTRAINT "task_milestones_context_workspace_fk" FOREIGN KEY ("workspace_id","context_id") REFERENCES "public"."contexts"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_phases" ADD CONSTRAINT "task_phases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_phases" ADD CONSTRAINT "task_phases_object_workspace_fk" FOREIGN KEY ("workspace_id","object_id") REFERENCES "public"."objects"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_phases" ADD CONSTRAINT "task_phases_context_workspace_fk" FOREIGN KEY ("workspace_id","context_id") REFERENCES "public"."contexts"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_milestone_links_task_idx" ON "task_milestone_links" USING btree ("workspace_id","task_id");--> statement-breakpoint
CREATE INDEX "task_milestone_links_milestone_idx" ON "task_milestone_links" USING btree ("workspace_id","milestone_id");--> statement-breakpoint
CREATE INDEX "task_milestones_workspace_context_due_idx" ON "task_milestones" USING btree ("workspace_id","context_id","due_at");--> statement-breakpoint
CREATE INDEX "task_phases_workspace_context_idx" ON "task_phases" USING btree ("workspace_id","context_id","position");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_phase_workspace_fk" FOREIGN KEY ("workspace_id","phase_id") REFERENCES "public"."task_phases"("workspace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_workspace_phase_idx" ON "tasks" USING btree ("workspace_id","phase_id");