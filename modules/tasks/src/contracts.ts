export const taskStatuses = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export const taskPriorities = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof taskPriorities)[number];

export const milestoneStatuses = ["open", "reached", "cancelled"] as const;
export type MilestoneStatus = (typeof milestoneStatuses)[number];

export const taskDependencyTypes = ["finish_start"] as const;
export type TaskDependencyType = (typeof taskDependencyTypes)[number];

export const taskPermissionKeys = [
  "tasks.task.create",
  "tasks.task.read",
  "tasks.task.update",
  "tasks.task.archive",
  "tasks.task.assign",
  "tasks.task.comment",
  "tasks.task.dependency_manage",
  "tasks.phase.create",
  "tasks.phase.read",
  "tasks.phase.update",
  "tasks.phase.archive",
  "tasks.milestone.create",
  "tasks.milestone.read",
  "tasks.milestone.update",
  "tasks.milestone.archive",
] as const;
export type TaskPermissionKey = (typeof taskPermissionKeys)[number];

export const taskEventNames = [
  "tasks.task.created.v1",
  "tasks.task.updated.v1",
  "tasks.task.moved.v1",
  "tasks.task.archived.v1",
  "tasks.task.assignment_changed.v1",
  "tasks.phase.created.v1",
  "tasks.phase.updated.v1",
  "tasks.phase.archived.v1",
  "tasks.milestone.created.v1",
  "tasks.milestone.updated.v1",
  "tasks.milestone.archived.v1",
  "tasks.task.milestone_changed.v1",
  "tasks.task.dependency_changed.v1",
] as const;
export type TaskEventName = (typeof taskEventNames)[number];

export interface TaskCreateInput {
  workspaceId: string;
  contextId: string;
  parentTaskId?: string | null | undefined;
  title: string;
  description?: string | null | undefined;
  status?: TaskStatus | undefined;
  priority?: TaskPriority | null | undefined;
  startAt?: Date | null | undefined;
  dueAt?: Date | null | undefined;
  estimatedMinutes?: number | null | undefined;
  position?: number | undefined;
}

export interface TaskUpdateInput {
  title?: string | undefined;
  description?: string | null | undefined;
  status?: TaskStatus | undefined;
  priority?: TaskPriority | null | undefined;
  startAt?: Date | null | undefined;
  dueAt?: Date | null | undefined;
  estimatedMinutes?: number | null | undefined;
  parentTaskId?: string | null | undefined;
  position?: number | undefined;
}

export interface PhaseCreateInput {
  workspaceId: string;
  contextId: string;
  name: string;
  description?: string | null | undefined;
  position?: number | undefined;
  startAt?: Date | null | undefined;
  dueAt?: Date | null | undefined;
}

export interface PhaseUpdateInput {
  name?: string | undefined;
  description?: string | null | undefined;
  position?: number | undefined;
  startAt?: Date | null | undefined;
  dueAt?: Date | null | undefined;
}

export interface MilestoneCreateInput {
  workspaceId: string;
  contextId: string;
  name: string;
  description?: string | null | undefined;
  dueAt: Date;
  status?: MilestoneStatus | undefined;
  position?: number | undefined;
}

export interface MilestoneUpdateInput {
  name?: string | undefined;
  description?: string | null | undefined;
  dueAt?: Date | undefined;
  status?: MilestoneStatus | undefined;
  position?: number | undefined;
}

export interface TaskDependencyCreateInput {
  workspaceId: string;
  predecessorTaskId: string;
  successorTaskId: string;
  dependencyType?: TaskDependencyType | undefined;
}
