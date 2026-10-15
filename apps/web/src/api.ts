const API_URL = "http://localhost:3000";

export type WorkspaceRole = "administrator" | "manager" | "member" | "guest";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: WorkspaceRole;
  rootContextId: string;
  createdAt: string;
}

export interface ContextEntitySummary {
  id: string;
  contextId: string;
  objectId: string;
  parentContextId: string | null;
  name: string;
  createdAt: string;
}

interface ScopeApiSummary {
  scopeId: string;
  contextId: string;
  objectId: string;
  parentContextId: string | null;
  name: string;
  createdAt: string;
}

interface ProjectApiSummary {
  projectId: string;
  contextId: string;
  objectId: string;
  parentContextId: string | null;
  name: string;
  createdAt: string;
}

interface CreatedScopeApiSummary {
  scopeId: string;
  contextId: string;
  objectId: string;
}

interface CreatedProjectApiSummary {
  projectId: string;
  contextId: string;
  objectId: string;
}

export interface NamedWorkspaceEntity {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  archivedAt: string | null;
}

export interface PersonSummary {
  id: string;
  workspaceId: string;
  objectId: string;
  userId: string | null;
  displayName: string;
  createdAt: string;
}

export interface WorkspaceMemberSummary {
  membershipId: string;
  userId: string;
  role: WorkspaceRole;
  name: string;
  email: string;
  personId: string | null;
  personDisplayName: string | null;
}

export type WorkspaceCapabilities = Record<
  | "core.scope.create"
  | "core.project.create"
  | "core.organization.create"
  | "core.team.create"
  | "core.team.manage"
  | "core.job_role.create"
  | "core.module.manage"
  | "core.workspace_member.read"
  | "core.workspace_member.manage",
  boolean
>;

export interface TeamSummary extends NamedWorkspaceEntity {
  objectId: string;
}

export interface OrganizationSummary extends NamedWorkspaceEntity {
  objectId: string;
}

export interface TeamMemberSummary {
  membershipId: string;
  personId: string;
  displayName: string;
  userId: string | null;
}

export interface WorkspaceModuleSummary {
  id: string;
  workspaceId: string;
  moduleKey: string;
  status: "enabled" | "disabled";
  installedVersion: string | null;
  createdAt: string;
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

export async function signUp(name: string, email: string, password: string) {
  return request<unknown>("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
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

export async function getWorkspaceCapabilities(workspaceId: string) {
  return request<WorkspaceCapabilities>(`/api/workspaces/${workspaceId}/capabilities`);
}

export async function listWorkspaceMembers(workspaceId: string) {
  return request<WorkspaceMemberSummary[]>(`/api/workspaces/${workspaceId}/members`);
}

export async function updateWorkspaceMemberRole(workspaceId: string, userId: string, role: WorkspaceRole) {
  return request<unknown>(`/api/workspaces/${workspaceId}/members/${userId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export async function listScopes(workspaceId: string): Promise<ContextEntitySummary[]> {
  const rows = await request<ScopeApiSummary[]>(`/api/workspaces/${workspaceId}/scopes`);
  return rows.map((row) => ({
    id: row.scopeId,
    contextId: row.contextId,
    objectId: row.objectId,
    parentContextId: row.parentContextId,
    name: row.name,
    createdAt: row.createdAt,
  }));
}

export async function createScope(workspaceId: string, name: string, parentContextId: string): Promise<ContextEntitySummary> {
  const row = await request<CreatedScopeApiSummary>(`/api/workspaces/${workspaceId}/scopes`, {
    method: "POST",
    body: JSON.stringify({ name, parentContextId }),
  });
  return { id: row.scopeId, contextId: row.contextId, objectId: row.objectId, parentContextId, name, createdAt: new Date().toISOString() };
}

export async function listProjects(workspaceId: string): Promise<ContextEntitySummary[]> {
  const rows = await request<ProjectApiSummary[]>(`/api/workspaces/${workspaceId}/projects`);
  return rows.map((row) => ({
    id: row.projectId,
    contextId: row.contextId,
    objectId: row.objectId,
    parentContextId: row.parentContextId,
    name: row.name,
    createdAt: row.createdAt,
  }));
}

export async function createProject(workspaceId: string, name: string, parentContextId: string): Promise<ContextEntitySummary> {
  const row = await request<CreatedProjectApiSummary>(`/api/workspaces/${workspaceId}/projects`, {
    method: "POST",
    body: JSON.stringify({ name, parentContextId }),
  });
  return { id: row.projectId, contextId: row.contextId, objectId: row.objectId, parentContextId, name, createdAt: new Date().toISOString() };
}

export async function listPersons(workspaceId: string) {
  return request<PersonSummary[]>(`/api/workspaces/${workspaceId}/persons`);
}

export async function listOrganizations(workspaceId: string) {
  return request<OrganizationSummary[]>(`/api/workspaces/${workspaceId}/organizations`);
}

export async function createOrganization(workspaceId: string, name: string) {
  return request<OrganizationSummary>(`/api/workspaces/${workspaceId}/organizations`, { method: "POST", body: JSON.stringify({ name }) });
}

export async function listTeams(workspaceId: string) {
  return request<TeamSummary[]>(`/api/workspaces/${workspaceId}/teams`);
}

export async function createTeam(workspaceId: string, name: string) {
  return request<TeamSummary>(`/api/workspaces/${workspaceId}/teams`, { method: "POST", body: JSON.stringify({ name }) });
}

export async function listTeamMembers(workspaceId: string, teamId: string) {
  return request<TeamMemberSummary[]>(`/api/workspaces/${workspaceId}/teams/${teamId}/members`);
}

export async function addTeamMember(workspaceId: string, teamId: string, personId: string) {
  return request<unknown>(`/api/workspaces/${workspaceId}/teams/${teamId}/members`, { method: "POST", body: JSON.stringify({ personId }) });
}

export async function removeTeamMember(workspaceId: string, teamId: string, personId: string) {
  return request<unknown>(`/api/workspaces/${workspaceId}/teams/${teamId}/members/${personId}`, { method: "DELETE" });
}

export async function listJobRoles(workspaceId: string) {
  return request<NamedWorkspaceEntity[]>(`/api/workspaces/${workspaceId}/job-roles`);
}

export async function createJobRole(workspaceId: string, name: string) {
  return request<NamedWorkspaceEntity>(`/api/workspaces/${workspaceId}/job-roles`, { method: "POST", body: JSON.stringify({ name }) });
}

export async function listModules(workspaceId: string) {
  return request<WorkspaceModuleSummary[]>(`/api/workspaces/${workspaceId}/modules`);
}

export async function enableModule(workspaceId: string, moduleKey: string, installedVersion?: string) {
  return request<WorkspaceModuleSummary>(`/api/workspaces/${workspaceId}/modules/${moduleKey}/enable`, {
    method: "POST",
    body: JSON.stringify({ installedVersion }),
  });
}

export async function disableModule(workspaceId: string, moduleKey: string) {
  return request<WorkspaceModuleSummary>(`/api/workspaces/${workspaceId}/modules/${moduleKey}/disable`, { method: "POST" });
}
