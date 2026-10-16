import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addTeamMember,
  addWorkspaceMember,
  createJobRole,
  createOrganization,
  createProject,
  createScope,
  createTeam,
  createWorkspace,
  disableModule,
  enableModule,
  getSession,
  getWorkspaceCapabilities,
  listJobRoles,
  listModules,
  listOrganizations,
  listPersons,
  listProjects,
  listScopes,
  listTeamMembers,
  listTeams,
  listWorkspaceMembers,
  listWorkspaces,
  removeTeamMember,
  signIn,
  signOut,
  signUp,
  updateWorkspaceMemberRole,
  type ContextEntitySummary,
  type NamedWorkspaceEntity,
  type OrganizationSummary,
  type TeamMemberSummary,
  type TeamSummary,
  type WorkspaceCapabilities,
  type WorkspaceMemberSummary,
  type WorkspaceModuleSummary,
  type WorkspaceRole,
  type WorkspaceSummary,
} from "./api";

type Section = "overview" | "scopes" | "projects" | "people" | "modules";

export function App() {
  const queryClient = useQueryClient();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = React.useState<string | null>(null);
  const [section, setSection] = React.useState<Section>("overview");

  const sessionQuery = useQuery({ queryKey: ["session"], queryFn: getSession, retry: false });
  const user = sessionQuery.data ?? null;
  const workspacesQuery = useQuery({ queryKey: ["workspaces"], queryFn: listWorkspaces, enabled: Boolean(user) });

  React.useEffect(() => {
    if (!selectedWorkspaceId && workspacesQuery.data?.length) setSelectedWorkspaceId(workspacesQuery.data[0]!.id);
  }, [selectedWorkspaceId, workspacesQuery.data]);

  const selectedWorkspace = workspacesQuery.data?.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;
  const queryEnabled = Boolean(user && selectedWorkspaceId);
  const directoryReadEnabled = Boolean(queryEnabled && selectedWorkspace?.role !== "guest");

  const capabilitiesQuery = useQuery({ queryKey: ["capabilities", selectedWorkspaceId], queryFn: () => getWorkspaceCapabilities(selectedWorkspaceId!), enabled: queryEnabled });
  const scopesQuery = useQuery({ queryKey: ["scopes", selectedWorkspaceId], queryFn: () => listScopes(selectedWorkspaceId!), enabled: queryEnabled });
  const projectsQuery = useQuery({ queryKey: ["projects", selectedWorkspaceId], queryFn: () => listProjects(selectedWorkspaceId!), enabled: queryEnabled });
  const organizationsQuery = useQuery({ queryKey: ["organizations", selectedWorkspaceId], queryFn: () => listOrganizations(selectedWorkspaceId!), enabled: directoryReadEnabled });
  const teamsQuery = useQuery({ queryKey: ["teams", selectedWorkspaceId], queryFn: () => listTeams(selectedWorkspaceId!), enabled: directoryReadEnabled });
  const jobRolesQuery = useQuery({ queryKey: ["job-roles", selectedWorkspaceId], queryFn: () => listJobRoles(selectedWorkspaceId!), enabled: directoryReadEnabled });
  const modulesQuery = useQuery({ queryKey: ["modules", selectedWorkspaceId], queryFn: () => listModules(selectedWorkspaceId!), enabled: directoryReadEnabled });
  const workspaceMembersQuery = useQuery({ queryKey: ["workspace-members", selectedWorkspaceId], queryFn: () => listWorkspaceMembers(selectedWorkspaceId!), enabled: directoryReadEnabled });

  const logoutMutation = useMutation({
    mutationFn: signOut,
    onSuccess: async () => {
      setSelectedWorkspaceId(null);
      queryClient.clear();
      await queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  });

  if (sessionQuery.isLoading) return <div className="center-screen"><div className="spinner" />Chargement…</div>;
  if (!user) return <AuthScreen onSuccess={() => queryClient.invalidateQueries({ queryKey: ["session"] })} />;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-block"><div className="brand-mark">U</div><div><strong>Utilitaire</strong><span>SaaS modulaire</span></div></div>
      <WorkspaceSwitcher workspaces={workspacesQuery.data ?? []} selectedId={selectedWorkspaceId} onSelect={(workspaceId) => { setSelectedWorkspaceId(workspaceId); setSection("overview"); }} onCreated={async (workspaceId) => { await queryClient.invalidateQueries({ queryKey: ["workspaces"] }); setSelectedWorkspaceId(workspaceId); setSection("overview"); }} />
      <nav className="nav-list">
        <NavButton active={section === "overview"} onClick={() => setSection("overview")}>Vue d’ensemble</NavButton>
        <NavButton active={section === "scopes"} onClick={() => setSection("scopes")}>Scopes</NavButton>
        <NavButton active={section === "projects"} onClick={() => setSection("projects")}>Projets</NavButton>
        <NavButton active={section === "people"} onClick={() => setSection("people")}>Équipe</NavButton>
        <NavButton active={section === "modules"} onClick={() => setSection("modules")}>Modules</NavButton>
      </nav>
      <div className="sidebar-footer">
        <div className="user-card"><div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div><div className="user-meta"><strong>{user.name}</strong><span>{user.email}</span></div></div>
        <button className="ghost-button" onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>Se déconnecter</button>
      </div>
    </aside>

    <main className="content-area">
      <header className="page-header"><div><span className="eyebrow">Workspace</span><h1>{selectedWorkspace?.name ?? "Aucun workspace"}</h1></div>{selectedWorkspace && <span className="role-badge">{formatRole(selectedWorkspace.role)}</span>}</header>
      {!selectedWorkspace ? <EmptyState title="Créez votre premier workspace" text="Un workspace contient vos projets, équipes, événements et modules." /> : <SectionContent
        section={section}
        currentUserId={user.id}
        workspace={selectedWorkspace}
        capabilities={capabilitiesQuery.data}
        scopes={scopesQuery.data ?? []}
        projects={projectsQuery.data ?? []}
        organizations={organizationsQuery.data ?? []}
        teams={teamsQuery.data ?? []}
        jobRoles={jobRolesQuery.data ?? []}
        modules={modulesQuery.data ?? []}
        workspaceMembers={workspaceMembersQuery.data ?? []}
        loading={capabilitiesQuery.isLoading || scopesQuery.isLoading || projectsQuery.isLoading || organizationsQuery.isLoading || teamsQuery.isLoading || jobRolesQuery.isLoading || modulesQuery.isLoading || workspaceMembersQuery.isLoading}
      />}
    </main>
  </div>;
}

function AuthScreen({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = React.useState<"signin" | "signup">("signin");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const signInMutation = useMutation({ mutationFn: () => signIn(email, password), onSuccess });
  const signUpMutation = useMutation({ mutationFn: () => signUp(name, email, password), onSuccess });
  const mutation = mode === "signin" ? signInMutation : signUpMutation;
  return <div className="auth-layout"><section className="auth-panel auth-intro"><div className="brand-block large"><div className="brand-mark">U</div><div><strong>Utilitaire</strong><span>SaaS modulaire</span></div></div><div><span className="eyebrow light">Lot 1 — Foundation</span><h1>Un seul espace pour structurer vos opérations.</h1><p>Workspaces, scopes, projets, équipes et modules indépendants dans une architecture conçue pour évoluer.</p></div></section><section className="auth-panel auth-form-panel"><form className="auth-card" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><div><span className="eyebrow">{mode === "signin" ? "Connexion" : "Inscription"}</span><h2>{mode === "signin" ? "Bienvenue" : "Créer un compte"}</h2><p>{mode === "signin" ? "Connectez-vous à votre espace Utilitaire." : "Créez votre compte pour démarrer votre premier workspace."}</p></div>{mode === "signup" && <label>Nom<input type="text" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required /></label>}<label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Mot de passe<input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>{mutation.isError && <div className="error-box">{mode === "signin" ? "Connexion impossible. Vérifiez vos identifiants." : "Création du compte impossible. Vérifiez l’email et le mot de passe."}</div>}<button className="primary-button" disabled={mutation.isPending}>{mutation.isPending ? mode === "signin" ? "Connexion…" : "Création…" : mode === "signin" ? "Se connecter" : "Créer mon compte"}</button><div className="auth-switch"><span>{mode === "signin" ? "Pas encore de compte ?" : "Déjà un compte ?"}</span><button type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); signInMutation.reset(); signUpMutation.reset(); }}>{mode === "signin" ? "Créer un compte" : "Se connecter"}</button></div></form></section></div>;
}

function WorkspaceSwitcher({ workspaces, selectedId, onSelect, onCreated }: { workspaces: WorkspaceSummary[]; selectedId: string | null; onSelect: (id: string) => void; onCreated: (id: string) => Promise<void> }) {
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const mutation = useMutation({ mutationFn: () => createWorkspace(name), onSuccess: async (created) => { setName(""); setCreating(false); await onCreated(created.workspaceId); } });
  return <div className="workspace-switcher"><select value={selectedId ?? ""} onChange={(event) => onSelect(event.target.value)}>{workspaces.length === 0 && <option value="">Aucun workspace</option>}{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select>{creating ? <form className="inline-create" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><input autoFocus placeholder="Nom du workspace" value={name} onChange={(event) => setName(event.target.value)} required /><div><button className="small-primary">Créer</button><button type="button" className="small-ghost" onClick={() => setCreating(false)}>Annuler</button></div></form> : <button className="new-workspace" onClick={() => setCreating(true)}>＋ Nouveau workspace</button>}</div>;
}

function NavButton({ active, onClick, children }: React.PropsWithChildren<{ active: boolean; onClick: () => void }>) { return <button className={active ? "nav-button active" : "nav-button"} onClick={onClick}>{children}</button>; }

function SectionContent({ section, currentUserId, workspace, capabilities, scopes, projects, organizations, teams, jobRoles, modules, workspaceMembers, loading }: { section: Section; currentUserId: string; workspace: WorkspaceSummary; capabilities: WorkspaceCapabilities | undefined; scopes: ContextEntitySummary[]; projects: ContextEntitySummary[]; organizations: OrganizationSummary[]; teams: TeamSummary[]; jobRoles: NamedWorkspaceEntity[]; modules: WorkspaceModuleSummary[]; workspaceMembers: WorkspaceMemberSummary[]; loading: boolean }) {
  if (loading) return <div className="center-content"><div className="spinner" />Chargement…</div>;
  const caps = capabilities ?? emptyCapabilities;
  if (section === "overview") return <Overview workspace={workspace} scopes={scopes} projects={projects} teams={teams} modules={modules} />;
  if (section === "scopes") return <ContextEntitySection kind="scope" workspace={workspace} scopes={scopes} items={scopes} canCreate={caps["core.scope.create"]} />;
  if (section === "projects") return <ContextEntitySection kind="project" workspace={workspace} scopes={scopes} items={projects} canCreate={caps["core.project.create"]} />;
  if (section === "people") return <PeopleSection currentUserId={currentUserId} workspace={workspace} organizations={organizations} teams={teams} jobRoles={jobRoles} workspaceMembers={workspaceMembers} capabilities={caps} />;
  return <ModulesSection workspace={workspace} modules={modules} canManage={caps["core.module.manage"]} />;
}

const emptyCapabilities: WorkspaceCapabilities = {
  "core.scope.create": false, "core.project.create": false, "core.organization.create": false, "core.team.create": false, "core.team.manage": false, "core.job_role.create": false, "core.module.manage": false, "core.workspace_member.read": false, "core.workspace_member.manage": false,
};

function Overview({ workspace, scopes, projects, teams, modules }: { workspace: WorkspaceSummary; scopes: ContextEntitySummary[]; projects: ContextEntitySummary[]; teams: TeamSummary[]; modules: WorkspaceModuleSummary[] }) {
  const enabledModules = modules.filter((module) => module.status === "enabled").length;
  return <div className="dashboard-grid"><StatCard label="Scopes" value={scopes.length} detail="Périmètres durables" /><StatCard label="Projets" value={projects.length} detail="Initiatives bornées" /><StatCard label="Équipes" value={teams.length} detail="Équipes opérationnelles" /><StatCard label="Modules actifs" value={enabledModules} detail="Fonctions installées" /><StatCard label="Rôle" value={formatRole(workspace.role)} detail="Dans ce workspace" /><div className="panel wide"><div className="panel-heading"><div><span className="eyebrow">Structure</span><h2>Organisation du workspace</h2></div></div><div className="structure-list"><div className="structure-root"><strong>{workspace.name}</strong><span>Workspace racine</span></div>{scopes.map((scope) => <div className="structure-item" key={scope.id}><strong>{scope.name}</strong><span>Scope</span></div>)}{projects.map((project) => <div className="structure-item project" key={project.id}><strong>{project.name}</strong><span>Projet</span></div>)}</div></div></div>;
}

function ContextEntitySection({ kind, workspace, scopes, items, canCreate }: { kind: "scope" | "project"; workspace: WorkspaceSummary; scopes: ContextEntitySummary[]; items: ContextEntitySummary[]; canCreate: boolean }) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const [parentContextId, setParentContextId] = React.useState(workspace.rootContextId);
  React.useEffect(() => setParentContextId(workspace.rootContextId), [workspace.id, workspace.rootContextId]);
  const mutation = useMutation({ mutationFn: () => kind === "scope" ? createScope(workspace.id, name, parentContextId) : createProject(workspace.id, name, parentContextId), onSuccess: async () => { setName(""); setParentContextId(workspace.rootContextId); await queryClient.invalidateQueries({ queryKey: [kind === "scope" ? "scopes" : "projects", workspace.id] }); } });
  const title = kind === "scope" ? "Scopes" : "Projets";
  const subtitle = kind === "scope" ? "Périmètres durables de votre workspace" : "Initiatives et exploitations limitées dans le temps";
  return <div className="panel"><div className="panel-heading entity-heading"><div><span className="eyebrow">Core</span><h2>{title}</h2><p>{subtitle}</p></div>{canCreate && <form className="entity-create-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><input placeholder={kind === "scope" ? "Nouveau scope" : "Nouveau projet"} value={name} onChange={(event) => setName(event.target.value)} required /><select value={parentContextId} onChange={(event) => setParentContextId(event.target.value)}><option value={workspace.rootContextId}>{workspace.name} — racine</option>{scopes.map((scope) => <option key={scope.id} value={scope.contextId}>{scope.name} — scope</option>)}</select><button className="small-primary dark" disabled={mutation.isPending}>{mutation.isPending ? "Création…" : "Créer"}</button></form>}</div>{!canCreate && <PermissionNote text="Votre rôle permet la consultation, pas la création." />}{mutation.isError && <div className="error-box">Création impossible. Vérifiez le parent sélectionné et vos permissions.</div>}{items.length ? <div className="entity-list">{items.map((item) => <div className="entity-row" key={item.id}><strong>{item.name}</strong><code>{item.id.slice(0, 8)}</code></div>)}</div> : <p className="muted">Aucun {kind === "scope" ? "scope" : "projet"} pour le moment.</p>}</div>;
}

function PeopleSection({ currentUserId, workspace, organizations, teams, jobRoles, workspaceMembers, capabilities }: { currentUserId: string; workspace: WorkspaceSummary; organizations: OrganizationSummary[]; teams: TeamSummary[]; jobRoles: NamedWorkspaceEntity[]; workspaceMembers: WorkspaceMemberSummary[]; capabilities: WorkspaceCapabilities }) {
  if (workspace.role === "guest") return <EmptyState title="Équipe" text="Votre rôle Invité n’a pas accès à l’annuaire du workspace." />;
  return <div className="people-stack">
    {capabilities["core.workspace_member.read"] && <WorkspaceMembersPanel currentUserId={currentUserId} workspace={workspace} members={workspaceMembers} canManage={capabilities["core.workspace_member.manage"]} />}
    <div className="people-grid">
      <NamedEntityPanel title="Organizations" subtitle="Structures liées au workspace" placeholder="Nouvelle organization" items={organizations} onCreate={(name) => createOrganization(workspace.id, name)} queryKey="organizations" workspaceId={workspace.id} canCreate={capabilities["core.organization.create"]} />
      <NamedEntityPanel title="Teams" subtitle="Équipes opérationnelles" placeholder="Nouvelle équipe" items={teams} onCreate={(name) => createTeam(workspace.id, name)} queryKey="teams" workspaceId={workspace.id} canCreate={capabilities["core.team.create"]} />
      <NamedEntityPanel title="Job Roles" subtitle="Rôles métiers réutilisables" placeholder="Nouveau rôle" items={jobRoles} onCreate={(name) => createJobRole(workspace.id, name)} queryKey="job-roles" workspaceId={workspace.id} canCreate={capabilities["core.job_role.create"]} />
    </div>
    <TeamMembersPanel workspace={workspace} teams={teams} canManage={capabilities["core.team.manage"]} />
  </div>;
}

function WorkspaceMembersPanel({ currentUserId, workspace, members, canManage }: { currentUserId: string; workspace: WorkspaceSummary; members: WorkspaceMemberSummary[]; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<WorkspaceRole>("member");

  const addMutation = useMutation({
    mutationFn: () => addWorkspaceMember(workspace.id, email.trim(), role),
    onSuccess: async () => {
      setEmail("");
      setRole("member");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-members", workspace.id] }),
        queryClient.invalidateQueries({ queryKey: ["persons", workspace.id] }),
      ]);
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role: nextRole }: { userId: string; role: WorkspaceRole }) => updateWorkspaceMemberRole(workspace.id, userId, nextRole),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-members", workspace.id] }),
        queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
        queryClient.invalidateQueries({ queryKey: ["capabilities", workspace.id] }),
      ]);
    },
  });

  return <div className="panel workspace-members-panel">
    <div className="panel-heading"><div><span className="eyebrow">Accès</span><h2>Membres du workspace</h2><p>Rôles système et droits généraux. Un workspace conserve toujours au moins un administrateur.</p></div></div>
    {canManage && <form className="workspace-member-add" onSubmit={(event) => { event.preventDefault(); addMutation.mutate(); }}>
      <input type="email" placeholder="email@exemple.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
      <select value={role} onChange={(event) => setRole(event.target.value as WorkspaceRole)}>{roleOptions.map((option) => <option key={option} value={option}>{formatRole(option)}</option>)}</select>
      <button className="small-primary dark" disabled={addMutation.isPending || !email.trim()}>{addMutation.isPending ? "Ajout…" : "Ajouter"}</button>
    </form>}
    {addMutation.isError && <div className="error-box">Ajout impossible. Vérifiez que ce compte existe déjà et qu’il n’est pas déjà membre du workspace.</div>}
    <div className="workspace-member-list">{members.map((member) => <div className="workspace-member-row" key={member.membershipId}><div className="member-person"><div className="avatar light">{member.name.slice(0, 1).toUpperCase()}</div><div><strong>{member.name}{member.userId === currentUserId ? " (vous)" : ""}</strong><span>{member.email}</span></div></div>{canManage ? <select value={member.role} disabled={roleMutation.isPending} onChange={(event) => roleMutation.mutate({ userId: member.userId, role: event.target.value as WorkspaceRole })}>{roleOptions.map((option) => <option key={option} value={option}>{formatRole(option)}</option>)}</select> : <span className="role-badge">{formatRole(member.role)}</span>}</div>)}</div>
    {roleMutation.isError && <div className="error-box">Modification impossible. Vérifiez notamment qu’il reste au moins un administrateur.</div>}
    <div className="permission-legend"><strong>Droits par défaut</strong><span><b>Administrateur</b> : tous les droits Core</span><span><b>Manager</b> : création et gestion opérationnelle, sans gestion des rôles ni des modules</span><span><b>Membre</b> : consultation</span><span><b>Invité</b> : Workspace, Scopes et Projets en lecture seule</span></div>
  </div>;
}

const roleOptions: WorkspaceRole[] = ["administrator", "manager", "member", "guest"];

function TeamMembersPanel({ workspace, teams, canManage }: { workspace: WorkspaceSummary; teams: TeamSummary[]; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [selectedTeamId, setSelectedTeamId] = React.useState(teams[0]?.id ?? "");
  const [selectedPersonId, setSelectedPersonId] = React.useState("");
  React.useEffect(() => { if (!teams.some((team) => team.id === selectedTeamId)) setSelectedTeamId(teams[0]?.id ?? ""); }, [teams, selectedTeamId]);
  const personsQuery = useQuery({ queryKey: ["persons", workspace.id], queryFn: () => listPersons(workspace.id) });
  const membersQuery = useQuery({ queryKey: ["team-members", workspace.id, selectedTeamId], queryFn: () => listTeamMembers(workspace.id, selectedTeamId), enabled: Boolean(selectedTeamId) });
  const persons = personsQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const memberIds = new Set(members.map((member) => member.personId));
  const availablePersons = persons.filter((person) => !memberIds.has(person.id));
  React.useEffect(() => { if (!availablePersons.some((person) => person.id === selectedPersonId)) setSelectedPersonId(availablePersons[0]?.id ?? ""); }, [availablePersons, selectedPersonId]);
  const addMutation = useMutation({ mutationFn: () => addTeamMember(workspace.id, selectedTeamId, selectedPersonId), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["team-members", workspace.id, selectedTeamId] }); } });
  const removeMutation = useMutation({ mutationFn: (personId: string) => removeTeamMember(workspace.id, selectedTeamId, personId), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["team-members", workspace.id, selectedTeamId] }); } });
  return <div className="panel team-members-panel"><div className="panel-heading team-members-heading"><div><span className="eyebrow">People</span><h2>Membres des Teams</h2><p>Ajoutez ou retirez les personnes du workspace dans une équipe.</p></div>{teams.length > 0 && <select className="team-select" value={selectedTeamId} onChange={(event) => setSelectedTeamId(event.target.value)}>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>}</div>{teams.length === 0 ? <p className="muted">Créez d’abord une Team.</p> : <>{canManage ? <div className="member-add-row"><select value={selectedPersonId} onChange={(event) => setSelectedPersonId(event.target.value)} disabled={availablePersons.length === 0 || personsQuery.isLoading}>{availablePersons.length === 0 ? <option value="">Toutes les personnes sont déjà membres</option> : availablePersons.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select><button className="small-primary dark" disabled={!selectedPersonId || addMutation.isPending} onClick={() => addMutation.mutate()}>{addMutation.isPending ? "Ajout…" : "Ajouter"}</button></div> : <PermissionNote text="Votre rôle permet de voir les Teams, pas de modifier leurs membres." />}{(personsQuery.isError || membersQuery.isError || addMutation.isError || removeMutation.isError) && <div className="error-box">La gestion des membres a rencontré une erreur.</div>}{membersQuery.isLoading ? <p className="muted">Chargement des membres…</p> : members.length ? <div className="member-list">{members.map((member) => <MemberRow key={member.membershipId} member={member} onRemove={() => removeMutation.mutate(member.personId)} disabled={!canManage || removeMutation.isPending} canRemove={canManage} />)}</div> : <p className="muted">Cette Team n’a encore aucun membre.</p>}<p className="member-footnote">{persons.length} personne{persons.length > 1 ? "s" : ""} dans le workspace · {members.length} dans cette Team</p></>}</div>;
}

function MemberRow({ member, onRemove, disabled, canRemove }: { member: TeamMemberSummary; onRemove: () => void; disabled: boolean; canRemove: boolean }) { return <div className="member-row"><div className="member-person"><div className="avatar light">{member.displayName.slice(0, 1).toUpperCase()}</div><div><strong>{member.displayName}</strong><span>{member.userId ? "Compte utilisateur lié" : "Personne sans compte"}</span></div></div>{canRemove && <button className="small-ghost danger" onClick={onRemove} disabled={disabled}>Retirer</button>}</div>; }

function NamedEntityPanel({ title, subtitle, placeholder, items, onCreate, queryKey, workspaceId, canCreate }: { title: string; subtitle: string; placeholder: string; items: Array<{ id: string; name: string }>; onCreate: (name: string) => Promise<unknown>; queryKey: string; workspaceId: string; canCreate: boolean }) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const mutation = useMutation({ mutationFn: () => onCreate(name), onSuccess: async () => { setName(""); await queryClient.invalidateQueries({ queryKey: [queryKey, workspaceId] }); } });
  return <div className="panel"><div className="panel-heading stacked"><div><span className="eyebrow">People</span><h2>{title}</h2><p>{subtitle}</p></div>{canCreate && <form className="entity-create-form compact" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><input placeholder={placeholder} value={name} onChange={(event) => setName(event.target.value)} required /><button className="small-primary dark" disabled={mutation.isPending}>Créer</button></form>}</div>{!canCreate && <PermissionNote text="Consultation uniquement pour votre rôle." />}{mutation.isError && <div className="error-box">Création impossible.</div>}{items.length ? <div className="entity-list">{items.map((item) => <div className="entity-row" key={item.id}><strong>{item.name}</strong><code>{item.id.slice(0, 8)}</code></div>)}</div> : <p className="muted">Aucun élément pour le moment.</p>}</div>;
}

const availableModules = [
  { key: "tasks", name: "Tasks", description: "Tâches, phases et jalons" },
  { key: "scheduling", name: "Scheduling", description: "Plannings, shifts et affectations" },
  { key: "event", name: "Event", description: "Événements, programmes et sessions" },
  { key: "forms", name: "Forms", description: "Formulaires et réponses" },
  { key: "flux", name: "Flux Lite", description: "Simulation de flux visiteurs" },
];

function ModulesSection({ workspace, modules, canManage }: { workspace: WorkspaceSummary; modules: WorkspaceModuleSummary[]; canManage: boolean }) {
  if (workspace.role === "guest") return <EmptyState title="Modules" text="Votre rôle Invité n’a pas accès au registre des modules." />;
  const queryClient = useQueryClient();
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);
  const mutation = useMutation({ mutationFn: async ({ moduleKey, enabled }: { moduleKey: string; enabled: boolean }) => { setPendingKey(moduleKey); return enabled ? disableModule(workspace.id, moduleKey) : enableModule(workspace.id, moduleKey, "1.0.0"); }, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["modules", workspace.id] }); }, onSettled: () => setPendingKey(null) });
  return <div className="panel"><div className="panel-heading"><div><span className="eyebrow">Core</span><h2>Modules</h2><p>Activez uniquement les briques nécessaires. La désactivation ne supprime pas les données.</p></div></div>{!canManage && <PermissionNote text="Votre rôle permet de consulter les modules mais pas de les activer ou désactiver." />}<div className="module-list">{availableModules.map((definition) => { const installed = modules.find((module) => module.moduleKey === definition.key); const enabled = installed?.status === "enabled"; return <div className="module-row" key={definition.key}><div><strong>{definition.name}</strong><span>{definition.description}</span>{installed?.installedVersion && <small>Version {installed.installedVersion}</small>}</div><div className="module-actions"><span className={enabled ? "status-badge enabled" : "status-badge"}>{enabled ? "Actif" : "Inactif"}</span>{canManage && <button className={enabled ? "small-ghost danger" : "small-primary dark"} disabled={mutation.isPending && pendingKey === definition.key} onClick={() => mutation.mutate({ moduleKey: definition.key, enabled })}>{pendingKey === definition.key ? "…" : enabled ? "Désactiver" : "Activer"}</button>}</div></div>; })}</div>{mutation.isError && <div className="error-box">Modification du module impossible.</div>}</div>;
}

function PermissionNote({ text }: { text: string }) { return <div className="permission-note">{text}</div>; }
function StatCard({ label, value, detail }: { label: string; value: React.ReactNode; detail: string }) { return <div className="stat-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="empty-state"><div className="empty-icon">◇</div><h2>{title}</h2><p>{text}</p></div>; }
function formatRole(role: WorkspaceRole) { return ({ administrator: "Administrateur", manager: "Manager", member: "Membre", guest: "Invité" } as const)[role]; }
