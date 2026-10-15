import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addTeamMember,
  createJobRole,
  createOrganization,
  createProject,
  createScope,
  createTeam,
  createWorkspace,
  disableModule,
  enableModule,
  getSession,
  listJobRoles,
  listModules,
  listOrganizations,
  listPersons,
  listProjects,
  listScopes,
  listTeamMembers,
  listTeams,
  listWorkspaces,
  removeTeamMember,
  signIn,
  signOut,
  signUp,
  type ContextEntitySummary,
  type NamedWorkspaceEntity,
  type OrganizationSummary,
  type PersonSummary,
  type TeamMemberSummary,
  type TeamSummary,
  type WorkspaceModuleSummary,
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

  const scopesQuery = useQuery({
    queryKey: ["scopes", selectedWorkspaceId],
    queryFn: () => listScopes(selectedWorkspaceId!),
    enabled: queryEnabled,
  });
  const projectsQuery = useQuery({
    queryKey: ["projects", selectedWorkspaceId],
    queryFn: () => listProjects(selectedWorkspaceId!),
    enabled: queryEnabled,
  });
  const organizationsQuery = useQuery({
    queryKey: ["organizations", selectedWorkspaceId],
    queryFn: () => listOrganizations(selectedWorkspaceId!),
    enabled: queryEnabled,
  });
  const teamsQuery = useQuery({
    queryKey: ["teams", selectedWorkspaceId],
    queryFn: () => listTeams(selectedWorkspaceId!),
    enabled: queryEnabled,
  });
  const jobRolesQuery = useQuery({
    queryKey: ["job-roles", selectedWorkspaceId],
    queryFn: () => listJobRoles(selectedWorkspaceId!),
    enabled: queryEnabled,
  });
  const modulesQuery = useQuery({
    queryKey: ["modules", selectedWorkspaceId],
    queryFn: () => listModules(selectedWorkspaceId!),
    enabled: queryEnabled,
  });

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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block"><div className="brand-mark">U</div><div><strong>Utilitaire</strong><span>SaaS modulaire</span></div></div>
        <WorkspaceSwitcher
          workspaces={workspacesQuery.data ?? []}
          selectedId={selectedWorkspaceId}
          onSelect={(workspaceId) => { setSelectedWorkspaceId(workspaceId); setSection("overview"); }}
          onCreated={async (workspaceId) => {
            await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
            setSelectedWorkspaceId(workspaceId);
            setSection("overview");
          }}
        />
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
        <header className="page-header">
          <div><span className="eyebrow">Workspace</span><h1>{selectedWorkspace?.name ?? "Aucun workspace"}</h1></div>
          {selectedWorkspace && <span className="role-badge">{formatRole(selectedWorkspace.role)}</span>}
        </header>

        {!selectedWorkspace ? (
          <EmptyState title="Créez votre premier workspace" text="Un workspace contient vos projets, équipes, événements et modules." />
        ) : (
          <SectionContent
            section={section}
            workspace={selectedWorkspace}
            scopes={scopesQuery.data ?? []}
            projects={projectsQuery.data ?? []}
            organizations={organizationsQuery.data ?? []}
            teams={teamsQuery.data ?? []}
            jobRoles={jobRolesQuery.data ?? []}
            modules={modulesQuery.data ?? []}
            loading={scopesQuery.isLoading || projectsQuery.isLoading || organizationsQuery.isLoading || teamsQuery.isLoading || jobRolesQuery.isLoading || modulesQuery.isLoading}
          />
        )}
      </main>
    </div>
  );
}

function AuthScreen({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = React.useState<"signin" | "signup">("signin");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const signInMutation = useMutation({ mutationFn: () => signIn(email, password), onSuccess });
  const signUpMutation = useMutation({ mutationFn: () => signUp(name, email, password), onSuccess });
  const mutation = mode === "signin" ? signInMutation : signUpMutation;

  return (
    <div className="auth-layout">
      <section className="auth-panel auth-intro">
        <div className="brand-block large"><div className="brand-mark">U</div><div><strong>Utilitaire</strong><span>SaaS modulaire</span></div></div>
        <div><span className="eyebrow light">Lot 1 — Foundation</span><h1>Un seul espace pour structurer vos opérations.</h1><p>Workspaces, scopes, projets, équipes et modules indépendants dans une architecture conçue pour évoluer.</p></div>
      </section>
      <section className="auth-panel auth-form-panel">
        <form className="auth-card" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
          <div><span className="eyebrow">{mode === "signin" ? "Connexion" : "Inscription"}</span><h2>{mode === "signin" ? "Bienvenue" : "Créer un compte"}</h2><p>{mode === "signin" ? "Connectez-vous à votre espace Utilitaire." : "Créez votre compte pour démarrer votre premier workspace."}</p></div>
          {mode === "signup" && <label>Nom<input type="text" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required /></label>}
          <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Mot de passe<input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>
          {mutation.isError && <div className="error-box">{mode === "signin" ? "Connexion impossible. Vérifiez vos identifiants." : "Création du compte impossible. Vérifiez l’email et le mot de passe."}</div>}
          <button className="primary-button" disabled={mutation.isPending}>{mutation.isPending ? mode === "signin" ? "Connexion…" : "Création…" : mode === "signin" ? "Se connecter" : "Créer mon compte"}</button>
          <div className="auth-switch"><span>{mode === "signin" ? "Pas encore de compte ?" : "Déjà un compte ?"}</span><button type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); signInMutation.reset(); signUpMutation.reset(); }}>{mode === "signin" ? "Créer un compte" : "Se connecter"}</button></div>
        </form>
      </section>
    </div>
  );
}

function WorkspaceSwitcher({ workspaces, selectedId, onSelect, onCreated }: { workspaces: WorkspaceSummary[]; selectedId: string | null; onSelect: (id: string) => void; onCreated: (id: string) => Promise<void> }) {
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const mutation = useMutation({ mutationFn: () => createWorkspace(name), onSuccess: async (created) => { setName(""); setCreating(false); await onCreated(created.workspaceId); } });
  return <div className="workspace-switcher"><select value={selectedId ?? ""} onChange={(event) => onSelect(event.target.value)}>{workspaces.length === 0 && <option value="">Aucun workspace</option>}{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select>{creating ? <form className="inline-create" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><input autoFocus placeholder="Nom du workspace" value={name} onChange={(event) => setName(event.target.value)} required /><div><button className="small-primary">Créer</button><button type="button" className="small-ghost" onClick={() => setCreating(false)}>Annuler</button></div></form> : <button className="new-workspace" onClick={() => setCreating(true)}>＋ Nouveau workspace</button>}</div>;
}

function NavButton({ active, onClick, children }: React.PropsWithChildren<{ active: boolean; onClick: () => void }>) {
  return <button className={active ? "nav-button active" : "nav-button"} onClick={onClick}>{children}</button>;
}

function SectionContent({ section, workspace, scopes, projects, organizations, teams, jobRoles, modules, loading }: {
  section: Section;
  workspace: WorkspaceSummary;
  scopes: ContextEntitySummary[];
  projects: ContextEntitySummary[];
  organizations: OrganizationSummary[];
  teams: TeamSummary[];
  jobRoles: NamedWorkspaceEntity[];
  modules: WorkspaceModuleSummary[];
  loading: boolean;
}) {
  if (loading) return <div className="center-content"><div className="spinner" />Chargement…</div>;
  if (section === "overview") return <Overview workspace={workspace} scopes={scopes} projects={projects} teams={teams} modules={modules} />;
  if (section === "scopes") return <ContextEntitySection kind="scope" workspace={workspace} scopes={scopes} items={scopes} />;
  if (section === "projects") return <ContextEntitySection kind="project" workspace={workspace} scopes={scopes} items={projects} />;
  if (section === "people") return <PeopleSection workspace={workspace} organizations={organizations} teams={teams} jobRoles={jobRoles} />;
  return <ModulesSection workspace={workspace} modules={modules} />;
}

function Overview({ workspace, scopes, projects, teams, modules }: { workspace: WorkspaceSummary; scopes: ContextEntitySummary[]; projects: ContextEntitySummary[]; teams: TeamSummary[]; modules: WorkspaceModuleSummary[] }) {
  const enabledModules = modules.filter((module) => module.status === "enabled").length;
  return <div className="dashboard-grid">
    <StatCard label="Scopes" value={scopes.length} detail="Périmètres durables" />
    <StatCard label="Projets" value={projects.length} detail="Initiatives bornées" />
    <StatCard label="Équipes" value={teams.length} detail="Équipes opérationnelles" />
    <StatCard label="Modules actifs" value={enabledModules} detail="Fonctions installées" />
    <StatCard label="Rôle" value={formatRole(workspace.role)} detail="Dans ce workspace" />
    <div className="panel wide"><div className="panel-heading"><div><span className="eyebrow">Structure</span><h2>Organisation du workspace</h2></div></div><div className="structure-list"><div className="structure-root"><strong>{workspace.name}</strong><span>Workspace racine</span></div>{scopes.map((scope) => <div className="structure-item" key={scope.id}><strong>{scope.name}</strong><span>Scope</span></div>)}{projects.map((project) => <div className="structure-item project" key={project.id}><strong>{project.name}</strong><span>Projet</span></div>)}</div></div>
  </div>;
}

function ContextEntitySection({ kind, workspace, scopes, items }: { kind: "scope" | "project"; workspace: WorkspaceSummary; scopes: ContextEntitySummary[]; items: ContextEntitySummary[] }) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const [parentContextId, setParentContextId] = React.useState(workspace.rootContextId);
  React.useEffect(() => setParentContextId(workspace.rootContextId), [workspace.id, workspace.rootContextId]);
  const mutation = useMutation({
    mutationFn: () => kind === "scope" ? createScope(workspace.id, name, parentContextId) : createProject(workspace.id, name, parentContextId),
    onSuccess: async () => { setName(""); setParentContextId(workspace.rootContextId); await queryClient.invalidateQueries({ queryKey: [kind === "scope" ? "scopes" : "projects", workspace.id] }); },
  });
  const title = kind === "scope" ? "Scopes" : "Projets";
  const subtitle = kind === "scope" ? "Périmètres durables de votre workspace" : "Initiatives et exploitations limitées dans le temps";
  return <div className="panel"><div className="panel-heading entity-heading"><div><span className="eyebrow">Core</span><h2>{title}</h2><p>{subtitle}</p></div><form className="entity-create-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><input placeholder={kind === "scope" ? "Nouveau scope" : "Nouveau projet"} value={name} onChange={(event) => setName(event.target.value)} required /><select value={parentContextId} onChange={(event) => setParentContextId(event.target.value)}><option value={workspace.rootContextId}>{workspace.name} — racine</option>{scopes.map((scope) => <option key={scope.id} value={scope.contextId}>{scope.name} — scope</option>)}</select><button className="small-primary dark" disabled={mutation.isPending}>{mutation.isPending ? "Création…" : "Créer"}</button></form></div>{mutation.isError && <div className="error-box">Création impossible. Vérifiez le parent sélectionné et vos permissions.</div>}{items.length ? <div className="entity-list">{items.map((item) => <div className="entity-row" key={item.id}><strong>{item.name}</strong><code>{item.id.slice(0, 8)}</code></div>)}</div> : <p className="muted">Aucun {kind === "scope" ? "scope" : "projet"} pour le moment.</p>}</div>;
}

function PeopleSection({ workspace, organizations, teams, jobRoles }: { workspace: WorkspaceSummary; organizations: OrganizationSummary[]; teams: TeamSummary[]; jobRoles: NamedWorkspaceEntity[] }) {
  return <div className="people-stack">
    <div className="people-grid">
      <NamedEntityPanel title="Organizations" subtitle="Structures liées au workspace" placeholder="Nouvelle organization" items={organizations} onCreate={(name) => createOrganization(workspace.id, name)} queryKey="organizations" workspaceId={workspace.id} />
      <NamedEntityPanel title="Teams" subtitle="Équipes opérationnelles" placeholder="Nouvelle équipe" items={teams} onCreate={(name) => createTeam(workspace.id, name)} queryKey="teams" workspaceId={workspace.id} />
      <NamedEntityPanel title="Job Roles" subtitle="Rôles métiers réutilisables" placeholder="Nouveau rôle" items={jobRoles} onCreate={(name) => createJobRole(workspace.id, name)} queryKey="job-roles" workspaceId={workspace.id} />
    </div>
    <TeamMembersPanel workspace={workspace} teams={teams} />
  </div>;
}

function TeamMembersPanel({ workspace, teams }: { workspace: WorkspaceSummary; teams: TeamSummary[] }) {
  const queryClient = useQueryClient();
  const [selectedTeamId, setSelectedTeamId] = React.useState(teams[0]?.id ?? "");
  const [selectedPersonId, setSelectedPersonId] = React.useState("");

  React.useEffect(() => {
    if (!teams.some((team) => team.id === selectedTeamId)) setSelectedTeamId(teams[0]?.id ?? "");
  }, [teams, selectedTeamId]);

  const personsQuery = useQuery({
    queryKey: ["persons", workspace.id],
    queryFn: () => listPersons(workspace.id),
  });

  const membersQuery = useQuery({
    queryKey: ["team-members", workspace.id, selectedTeamId],
    queryFn: () => listTeamMembers(workspace.id, selectedTeamId),
    enabled: Boolean(selectedTeamId),
  });

  const persons = personsQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const memberIds = new Set(members.map((member) => member.personId));
  const availablePersons = persons.filter((person) => !memberIds.has(person.id));

  React.useEffect(() => {
    if (!availablePersons.some((person) => person.id === selectedPersonId)) {
      setSelectedPersonId(availablePersons[0]?.id ?? "");
    }
  }, [availablePersons, selectedPersonId]);

  const addMutation = useMutation({
    mutationFn: () => addTeamMember(workspace.id, selectedTeamId, selectedPersonId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["team-members", workspace.id, selectedTeamId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (personId: string) => removeTeamMember(workspace.id, selectedTeamId, personId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["team-members", workspace.id, selectedTeamId] });
    },
  });

  return <div className="panel team-members-panel">
    <div className="panel-heading team-members-heading">
      <div><span className="eyebrow">People</span><h2>Membres des Teams</h2><p>Ajoutez ou retirez les personnes du workspace dans une équipe.</p></div>
      {teams.length > 0 && <select className="team-select" value={selectedTeamId} onChange={(event) => setSelectedTeamId(event.target.value)}>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>}
    </div>

    {teams.length === 0 ? <p className="muted">Créez d’abord une Team.</p> : (
      <>
        <div className="member-add-row">
          <select value={selectedPersonId} onChange={(event) => setSelectedPersonId(event.target.value)} disabled={availablePersons.length === 0 || personsQuery.isLoading}>
            {availablePersons.length === 0 ? <option value="">Toutes les personnes sont déjà membres</option> : availablePersons.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
          </select>
          <button className="small-primary dark" disabled={!selectedPersonId || addMutation.isPending} onClick={() => addMutation.mutate()}>{addMutation.isPending ? "Ajout…" : "Ajouter"}</button>
        </div>

        {(personsQuery.isError || membersQuery.isError || addMutation.isError || removeMutation.isError) && <div className="error-box">La gestion des membres a rencontré une erreur.</div>}

        {membersQuery.isLoading ? <p className="muted">Chargement des membres…</p> : members.length ? <div className="member-list">{members.map((member) => <MemberRow key={member.membershipId} member={member} onRemove={() => removeMutation.mutate(member.personId)} disabled={removeMutation.isPending} />)}</div> : <p className="muted">Cette Team n’a encore aucun membre.</p>}

        <p className="member-footnote">{persons.length} personne{persons.length > 1 ? "s" : ""} dans le workspace · {members.length} dans cette Team</p>
      </>
    )}
  </div>;
}

function MemberRow({ member, onRemove, disabled }: { member: TeamMemberSummary; onRemove: () => void; disabled: boolean }) {
  return <div className="member-row"><div className="member-person"><div className="avatar light">{member.displayName.slice(0, 1).toUpperCase()}</div><div><strong>{member.displayName}</strong><span>{member.userId ? "Compte utilisateur lié" : "Personne sans compte"}</span></div></div><button className="small-ghost danger" onClick={onRemove} disabled={disabled}>Retirer</button></div>;
}

function NamedEntityPanel({ title, subtitle, placeholder, items, onCreate, queryKey, workspaceId }: { title: string; subtitle: string; placeholder: string; items: Array<{ id: string; name: string }>; onCreate: (name: string) => Promise<unknown>; queryKey: string; workspaceId: string }) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const mutation = useMutation({ mutationFn: () => onCreate(name), onSuccess: async () => { setName(""); await queryClient.invalidateQueries({ queryKey: [queryKey, workspaceId] }); } });
  return <div className="panel"><div className="panel-heading stacked"><div><span className="eyebrow">People</span><h2>{title}</h2><p>{subtitle}</p></div><form className="entity-create-form compact" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><input placeholder={placeholder} value={name} onChange={(event) => setName(event.target.value)} required /><button className="small-primary dark" disabled={mutation.isPending}>Créer</button></form></div>{mutation.isError && <div className="error-box">Création impossible.</div>}{items.length ? <div className="entity-list">{items.map((item) => <div className="entity-row" key={item.id}><strong>{item.name}</strong><code>{item.id.slice(0, 8)}</code></div>)}</div> : <p className="muted">Aucun élément pour le moment.</p>}</div>;
}

const availableModules = [
  { key: "tasks", name: "Tasks", description: "Tâches, phases et jalons" },
  { key: "scheduling", name: "Scheduling", description: "Plannings, shifts et affectations" },
  { key: "event", name: "Event", description: "Événements, programmes et sessions" },
  { key: "forms", name: "Forms", description: "Formulaires et réponses" },
  { key: "flux", name: "Flux Lite", description: "Simulation de flux visiteurs" },
];

function ModulesSection({ workspace, modules }: { workspace: WorkspaceSummary; modules: WorkspaceModuleSummary[] }) {
  const queryClient = useQueryClient();
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async ({ moduleKey, enabled }: { moduleKey: string; enabled: boolean }) => {
      setPendingKey(moduleKey);
      return enabled ? disableModule(workspace.id, moduleKey) : enableModule(workspace.id, moduleKey, "1.0.0");
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["modules", workspace.id] }); },
    onSettled: () => setPendingKey(null),
  });

  return <div className="panel"><div className="panel-heading"><div><span className="eyebrow">Core</span><h2>Modules</h2><p>Activez uniquement les briques nécessaires. La désactivation ne supprime pas les données.</p></div></div><div className="module-list">{availableModules.map((definition) => { const installed = modules.find((module) => module.moduleKey === definition.key); const enabled = installed?.status === "enabled"; return <div className="module-row" key={definition.key}><div><strong>{definition.name}</strong><span>{definition.description}</span>{installed?.installedVersion && <small>Version {installed.installedVersion}</small>}</div><div className="module-actions"><span className={enabled ? "status-badge enabled" : "status-badge"}>{enabled ? "Actif" : "Inactif"}</span><button className={enabled ? "small-ghost danger" : "small-primary dark"} disabled={mutation.isPending && pendingKey === definition.key} onClick={() => mutation.mutate({ moduleKey: definition.key, enabled })}>{pendingKey === definition.key ? "…" : enabled ? "Désactiver" : "Activer"}</button></div></div>; })}</div>{mutation.isError && <div className="error-box">Modification du module impossible.</div>}</div>;
}

function StatCard({ label, value, detail }: { label: string; value: React.ReactNode; detail: string }) {
  return <div className="stat-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><div className="empty-icon">◇</div><h2>{title}</h2><p>{text}</p></div>;
}

function formatRole(role: WorkspaceSummary["role"]) {
  return ({ administrator: "Administrateur", manager: "Manager", member: "Membre", guest: "Invité" } as const)[role];
}
