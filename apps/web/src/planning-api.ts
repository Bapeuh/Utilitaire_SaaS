const API_URL = "http://localhost:3000";

export type MilestoneStatus = "open" | "reached" | "cancelled";

export interface MilestoneSummary {
  id: string;
  workspaceId: string;
  objectId: string;
  contextId: string;
  name: string;
  description: string | null;
  dueAt: string;
  status: MilestoneStatus;
  position: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
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

export function listMilestones(workspaceId: string, contextId?: string) {
  const params = new URLSearchParams();
  if (contextId) params.set("contextId", contextId);
  const suffix = params.size ? `?${params.toString()}` : "";
  return request<MilestoneSummary[]>(`/api/workspaces/${workspaceId}/task-milestones${suffix}`);
}

export function updateMilestone(workspaceId: string, milestoneId: string, input: Partial<Pick<MilestoneSummary, "name" | "description" | "status" | "position">> & { dueAt?: string }) {
  return request<MilestoneSummary>(`/api/workspaces/${workspaceId}/task-milestones/${milestoneId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
