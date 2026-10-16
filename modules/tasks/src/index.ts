export const taskStatuses = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export const taskPriorities = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof taskPriorities)[number];

export const taskPermissionKeys = [
  "tasks.task.create",
  "tasks.task.read",
  "tasks.task.update",
  "tasks.task.archive",
  "tasks.task.assign",
  "tasks.task.comment",
] as const;
export type TaskPermissionKey = (typeof taskPermissionKeys)[number];

export const taskEventNames = [
  "tasks.task.created.v1",
  "tasks.task.updated.v1",
  "tasks.task.moved.v1",
  "tasks.task.archived.v1",
  "tasks.task.assignment_changed.v1",
] as const;
export type TaskEventName = (typeof taskEventNames)[number];

export interface TaskCreateInput {
  workspaceId: string;
  contextId: string;
  parentTaskId?: string | null;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority | null;
  startAt?: Date | null;
  dueAt?: Date | null;
  estimatedMinutes?: number | null;
}

export interface TaskUpdateInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority | null;
  startAt?: Date | null;
  dueAt?: Date | null;
  estimatedMinutes?: number | null;
}
