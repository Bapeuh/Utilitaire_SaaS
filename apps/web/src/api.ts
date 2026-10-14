const API_URL = "http://localhost:3000";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: "administrator" | "manager" | "member" | "guest";
  rootContextId: string;
  createdAt: string;
}

export interface ContextEntitySummary {
  id: string;
  workspaceId: string;
  contextId: string;
  objectId: string;
  name: string;
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

export async function getSession(): Promise<SessionUser | null> {
  const response = await fetch(`${API_URL}/api/me`, { credentials: "include" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as { user?: SessionUser } | SessionUser;
  return "user" in data && data.user ? data.user : (data as SessionUser);
}

export async function signIn(email: string, password: string) {
  return request<unknown>("/api/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function signOut() {
  return request<unknown>("/api/auth/sign-out", { method: "POST" });
}

export async function listWorkspaces() {
  return request<WorkspaceSummary[]>("/api/workspaces");
}

export async function createWorkspace(name: string, personDisplayName?: string) {
  return request<{ workspaceId: string; rootContextId: string }>("/api/workspaces", {
    method: "POST",
    body: JSON.stringify({ name, personDisplayName }),
  });
}

export async function listScopes(workspaceId: string) {
  return request<ContextEntitySummary[]>(`/api/workspaces/${workspaceId}/scopes`);
}

export async function listProjects(workspaceId: string) {
  return request<ContextEntitySummary[]>(`/api/workspaces/${workspaceId}/projects`);
}
