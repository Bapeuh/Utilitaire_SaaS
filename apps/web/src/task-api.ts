const API_URL = "http://localhost:3000";

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "cancelled";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export interface TaskSummary {
  id: string;
  workspaceId: string;
  objectId: string;
  contextId: string;
  parentTaskId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority | null;
  startAt: string | null;
  dueAt: string | null;
  estimatedMinutes: number | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface TaskChecklistItem {
  id: string;
  workspaceId: string;
  taskId: string;
  label: string;
  isDone: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface TaskAssignmentSummary {
  people: Array<{ id: string; personId: string; taskId: string }>;
  teams: Array<{ id: string; teamId: string; taskId: string }>;
}

export interface TaskComment {
  id: string;
  body: string;
  authorUserId: string;
  createdAt: string;
}

export interface TaskTagLink {
  id: string;
  tagId: string;
  objectId: string;
  name?: string;
  normalizedName?: string;
}

export interface TaskFileLink {
  id?: string;
  fileId?: string;
  name?: string;
  storageKey?: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  label?: string | null;
  file?: {
    id: string;
    name: string;
    storageKey: string;
    mimeType: string | null;
    sizeBytes: number | null;
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function listTasks(workspaceId: string, filters: { contextId?: string; status?: TaskStatus; priority?: TaskPriority } = {}) {
  const params = new URLSearchParams();
  if (filters.contextId) params.set("contextId", filters.contextId);
  if (filters.status) params.set("status", filters.status);
  if (filters.priority) params.set("priority", filters.priority);
  const suffix = params.size ? `?${params.toString()}` : "";
  return request<TaskSummary[]>(`/api/workspaces/${workspaceId}/tasks${suffix}`);
}

export function createTask(workspaceId: string, input: { contextId: string; title: string; parentTaskId?: string | null }) {
  return request<TaskSummary>(`/api/workspaces/${workspaceId}/tasks`, { method: "POST", body: JSON.stringify(input) });
}

export function updateTask(workspaceId: string, taskId: string, input: Partial<Pick<TaskSummary, "title" | "description" | "status" | "priority" | "parentTaskId" | "position">> & { startAt?: string | null; dueAt?: string | null; estimatedMinutes?: number | null }) {
  return request<TaskSummary>(`/api/workspaces/${workspaceId}/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function archiveTask(workspaceId: string, taskId: string) {
  return request<TaskSummary>(`/api/workspaces/${workspaceId}/tasks/${taskId}/archive`, { method: "POST" });
}

export function listTaskAssignments(workspaceId: string, taskId: string) {
  return request<TaskAssignmentSummary>(`/api/workspaces/${workspaceId}/tasks/${taskId}/assignments`);
}

export function assignTaskPerson(workspaceId: string, taskId: string, personId: string) {
  return request<unknown>(`/api/workspaces/${workspaceId}/tasks/${taskId}/assignments/persons`, { method: "POST", body: JSON.stringify({ personId }) });
}

export function unassignTaskPerson(workspaceId: string, taskId: string, personId: string) {
  return request<unknown>(`/api/workspaces/${workspaceId}/tasks/${taskId}/assignments/persons/${personId}`, { method: "DELETE" });
}

export function assignTaskTeam(workspaceId: string, taskId: string, teamId: string) {
  return request<unknown>(`/api/workspaces/${workspaceId}/tasks/${taskId}/assignments/teams`, { method: "POST", body: JSON.stringify({ teamId }) });
}

export function unassignTaskTeam(workspaceId: string, taskId: string, teamId: string) {
  return request<unknown>(`/api/workspaces/${workspaceId}/tasks/${taskId}/assignments/teams/${teamId}`, { method: "DELETE" });
}

export function listTaskChecklist(workspaceId: string, taskId: string) {
  return request<TaskChecklistItem[]>(`/api/workspaces/${workspaceId}/tasks/${taskId}/checklist`);
}

export function addTaskChecklistItem(workspaceId: string, taskId: string, label: string) {
  return request<TaskChecklistItem>(`/api/workspaces/${workspaceId}/tasks/${taskId}/checklist`, { method: "POST", body: JSON.stringify({ label }) });
}

export function updateTaskChecklistItem(workspaceId: string, taskId: string, itemId: string, input: { label?: string | undefined; isDone?: boolean | undefined; position?: number | undefined }) {
  return request<TaskChecklistItem>(`/api/workspaces/${workspaceId}/tasks/${taskId}/checklist/${itemId}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function removeTaskChecklistItem(workspaceId: string, taskId: string, itemId: string) {
  return request<unknown>(`/api/workspaces/${workspaceId}/tasks/${taskId}/checklist/${itemId}`, { method: "DELETE" });
}

export function listTaskComments(workspaceId: string, taskId: string) {
  return request<TaskComment[]>(`/api/workspaces/${workspaceId}/tasks/${taskId}/comments`);
}

export function addTaskComment(workspaceId: string, taskId: string, body: string) {
  return request<TaskComment>(`/api/workspaces/${workspaceId}/tasks/${taskId}/comments`, { method: "POST", body: JSON.stringify({ body }) });
}

export function listTaskTags(workspaceId: string, taskId: string) {
  return request<TaskTagLink[]>(`/api/workspaces/${workspaceId}/tasks/${taskId}/tags`);
}

export function addTaskTag(workspaceId: string, taskId: string, name: string) {
  return request<unknown>(`/api/workspaces/${workspaceId}/tasks/${taskId}/tags`, { method: "POST", body: JSON.stringify({ name }) });
}

export function removeTaskTag(workspaceId: string, taskId: string, tagId: string) {
  return request<unknown>(`/api/workspaces/${workspaceId}/tasks/${taskId}/tags/${tagId}`, { method: "DELETE" });
}

export function listTaskFiles(workspaceId: string, taskId: string) {
  return request<TaskFileLink[]>(`/api/workspaces/${workspaceId}/tasks/${taskId}/files`);
}

export function addTaskFileMetadata(workspaceId: string, taskId: string, input: { storageKey: string; name: string; mimeType?: string | null; sizeBytes?: number | null; label?: string | null }) {
  return request<unknown>(`/api/workspaces/${workspaceId}/tasks/${taskId}/files`, { method: "POST", body: JSON.stringify(input) });
}

export function removeTaskFile(workspaceId: string, taskId: string, fileId: string) {
  return request<unknown>(`/api/workspaces/${workspaceId}/tasks/${taskId}/files/${fileId}`, { method: "DELETE" });
}