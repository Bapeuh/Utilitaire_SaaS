import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createProject,
  createScope,
  createWorkspace,
  getSession,
  listProjects,
  listScopes,
  listWorkspaces,
  signIn,
  signOut,
  signUp,
  type ContextEntitySummary,
  type WorkspaceSummary,
} from "./api";

type Section = "overview" | "scopes" | "projects" | "people" | "modules";

export function App() {
  const queryClient = useQueryClient();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = React.useState<string | null>(null);
  const [section, setSection] = React.useState<Section>("overview");

  const sessionQuery = useQuery({ queryKey: ["session"], queryFn: getSession, retry: false });
  const user = sessionQuery.data ?? null;

  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: listWorkspaces,
    enabled: Boolean(user),
  });

  React.useEffect(() => {
    if (!selectedWorkspaceId && workspacesQuery.data?.length) {
      setSelectedWorkspaceId(workspacesQuery.data[0]!.id);
    }
  }, [selectedWorkspaceId, workspacesQuery.data]);

  const selectedWorkspace = workspacesQuery.data?.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;

  const scopesQuery = useQuery({
    queryKey: ["scopes", selectedWorkspaceId],
    queryFn: () => listScopes(selectedWorkspaceId!),
    enabled: Boolean(user && selectedWorkspaceId),
  });

  const projectsQuery = useQuery({
    queryKey: ["projects", selectedWorkspaceId],
    queryFn: () => listProjects(selectedWorkspaceId!),
    enabled: Boolean(user && selectedWorkspaceId),
  });

  const logoutMutation = useMutation({
    mutationFn: signOut,
    onSuccess: async () => {
      setSelectedWorkspaceId(null);
      queryClient.clear();
      await queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  });

  if (sessionQuery.isLoading) {
    return <div className="center-screen"><div className="spinner" />Chargement…</div>;
  }

  if (!user) {
    return <AuthScreen onSuccess={() => queryClient.invalidateQueries({ queryKey: ["session"] })} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">U</div>
          <div><strong>Utilitaire</strong><span>SaaS modulaire</span></div>
        </div>

        <WorkspaceSwitcher
          workspaces={workspacesQuery.data ?? []}
          selectedId={selectedWorkspaceId}
          onSelect={(workspaceId) => {
            setSelectedWorkspaceId(workspaceId);
            setSection("overview");
          }}
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
          <div className="user-card">
            <div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div>
            <div className="user-meta"><strong>{user.name}</strong><span>{user.email}</span></div>
          </div>
          <button className="ghost-button" onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
            Se déconnecter
          </button>
        </div>
      </aside>

      <main className="content-area">
        <header className="page-header">
          <div>
            <span className="eyebrow">Workspace</span>
            <h1>{selectedWorkspace?.name ?? "Aucun workspace"}</h1>
          </div>
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
            loading={scopesQuery.isLoading || projectsQuery.isLoading}
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
        <div>
          <span className="eyebrow light">Lot 1 — Foundation</span>
          <h1>Un seul espace pour structurer vos opérations.</h1>
          <p>Workspaces, scopes, projets, équipes et modules indépendants dans une architecture conçue pour évoluer.</p>
        </div>
      </section>
      <section className="auth-panel auth-form-panel">
        <form className="auth-card" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
          <div>
            <span className="eyebrow">{mode === "signin" ? "Connexion" : "Inscription"}</span>
            <h2>{mode === "signin" ? "Bienvenue" : "Créer un compte"}</h2>
            <p>{mode === "signin" ? "Connectez-vous à votre espace Utilitaire." : "Créez votre compte pour démarrer votre premier workspace."}</p>
          </div>
          {mode === "signup" && <label>Nom<input type="text" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required /></label>}
          <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Mot de passe<input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>
          {mutation.isError && <div className="error-box">{mode === "signin" ? "Connexion impossible. Vérifiez vos identifiants." : "Création du compte impossible. Vérifiez l’email et le mot de passe."}</div>}
          <button className="primary-button" disabled={mutation.isPending}>{mutation.isPending ? mode === "signin" ? "Connexion…" : "Création…" : mode === "signin" ? "Se connecter" : "Créer mon compte"}</button>
          <div className="auth-switch">
            <span>{mode === "signin" ? "Pas encore de compte ?" : "Déjà un compte ?"}</span>
            <button type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); signInMutation.reset(); signUpMutation.reset(); }}>
              {mode === "signin" ? "Créer un compte" : "Se connecter"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function WorkspaceSwitcher({ workspaces, selectedId, onSelect, onCreated }: {
  workspaces: WorkspaceSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const mutation = useMutation({
    mutationFn: () => createWorkspace(name),
    onSuccess: async (created) => {
      setName("");
      setCreating(false);
      await onCreated(created.workspaceId);
    },
  });

  return (
    <div className="workspace-switcher">
      <select value={selectedId ?? ""} onChange={(event) => onSelect(event.target.value)}>
        {workspaces.length === 0 && <option value="">Aucun workspace</option>}
        {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
      </select>
      {creating ? (
        <form className="inline-create" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
          <input autoFocus placeholder="Nom du workspace" value={name} onChange={(e) => setName(e.target.value)} required />
          <div><button className="small-primary">Créer</button><button type="button" className="small-ghost" onClick={() => setCreating(false)}>Annuler</button></div>
        </form>
      ) : (
        <button className="new-workspace" onClick={() => setCreating(true)}>＋ Nouveau workspace</button>
      )}
    </div>
  );
}

function NavButton({ active, onClick, children }: React.PropsWithChildren<{ active: boolean; onClick: () => void }>) {
  return <button className={active ? "nav-button active" : "nav-button"} onClick={onClick}>{children}</button>;
}

function SectionContent({ section, workspace, scopes, projects, loading }: {
  section: Section;
  workspace: WorkspaceSummary;
  scopes: ContextEntitySummary[];
  projects: ContextEntitySummary[];
  loading: boolean;
}) {
  if (loading) return <div className="center-content"><div className="spinner" />Chargement…</div>;

  if (section === "overview") {
    return (
      <div className="dashboard-grid">
        <StatCard label="Scopes" value={scopes.length} detail="Périmètres durables" />
        <StatCard label="Projets" value={projects.length} detail="Initiatives bornées" />
        <StatCard label="Rôle" value={formatRole(workspace.role)} detail="Dans ce workspace" />
        <div className="panel wide">
          <div className="panel-heading"><div><span className="eyebrow">Structure</span><h2>Organisation du workspace</h2></div></div>
          <div className="structure-list">
            <div className="structure-root"><strong>{workspace.name}</strong><span>Workspace racine</span></div>
            {scopes.map((scope) => <div className="structure-item" key={scope.id}><strong>{scope.name}</strong><span>Scope</span></div>)}
            {projects.map((project) => <div className="structure-item project" key={project.id}><strong>{project.name}</strong><span>Projet</span></div>)}
          </div>
        </div>
      </div>
    );
  }

  if (section === "scopes") {
    return <ContextEntitySection kind="scope" workspace={workspace} scopes={scopes} items={scopes} />;
  }

  if (section === "projects") {
    return <ContextEntitySection kind="project" workspace={workspace} scopes={scopes} items={projects} />;
  }

  if (section === "people") return <EmptyState title="Équipe" text="Les Organizations, Teams, membres et Job Roles sont disponibles côté API. Leur interface arrive dans l’étape suivante du Lot 1F." />;
  return <EmptyState title="Modules" text="Le registre de modules est opérationnel côté API. L’écran d’activation et de désactivation arrive dans l’étape suivante." />;
}

function ContextEntitySection({ kind, workspace, scopes, items }: {
  kind: "scope" | "project";
  workspace: WorkspaceSummary;
  scopes: ContextEntitySummary[];
  items: ContextEntitySummary[];
}) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const [parentContextId, setParentContextId] = React.useState(workspace.rootContextId);

  React.useEffect(() => setParentContextId(workspace.rootContextId), [workspace.id, workspace.rootContextId]);

  const mutation = useMutation({
    mutationFn: () => kind === "scope"
      ? createScope(workspace.id, name, parentContextId)
      : createProject(workspace.id, name, parentContextId),
    onSuccess: async () => {
      setName("");
      setParentContextId(workspace.rootContextId);
      await queryClient.invalidateQueries({ queryKey: [kind === "scope" ? "scopes" : "projects", workspace.id] });
    },
  });

  const title = kind === "scope" ? "Scopes" : "Projets";
  const subtitle = kind === "scope" ? "Périmètres durables de votre workspace" : "Initiatives et exploitations limitées dans le temps";

  return (
    <div className="panel">
      <div className="panel-heading entity-heading">
        <div><span className="eyebrow">Core</span><h2>{title}</h2><p>{subtitle}</p></div>
        <form className="entity-create-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
          <input placeholder={kind === "scope" ? "Nouveau scope" : "Nouveau projet"} value={name} onChange={(event) => setName(event.target.value)} required />
          <select value={parentContextId} onChange={(event) => setParentContextId(event.target.value)}>
            <option value={workspace.rootContextId}>{workspace.name} — racine</option>
            {scopes.map((scope) => <option key={scope.id} value={scope.contextId}>{scope.name} — scope</option>)}
          </select>
          <button className="small-primary dark" disabled={mutation.isPending}>{mutation.isPending ? "Création…" : "Créer"}</button>
        </form>
      </div>
      {mutation.isError && <div className="error-box">Création impossible. Vérifiez le parent sélectionné et vos permissions.</div>}
      {items.length ? (
        <div className="entity-list">
          {items.map((item) => <div className="entity-row" key={item.id}><strong>{item.name}</strong><code>{item.id.slice(0, 8)}</code></div>)}
        </div>
      ) : <p className="muted">Aucun {kind === "scope" ? "scope" : "projet"} pour le moment.</p>}
    </div>
  );
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
