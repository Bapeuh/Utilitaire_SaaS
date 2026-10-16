import React from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";

import { getSession, listProjects, listScopes, listWorkspaces } from "./api";
import { TasksSection } from "./TasksSection";

function getWorkspaceSelectValue() {
  const select = document.querySelector<HTMLSelectElement>(".workspace-switcher select");
  return select?.value || null;
}

export function TasksIntegration() {
  const [open, setOpen] = React.useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = React.useState<string | null>(null);
  const [navTarget, setNavTarget] = React.useState<Element | null>(null);

  const sessionQuery = useQuery({ queryKey: ["session"], queryFn: getSession, retry: false });
  const workspacesQuery = useQuery({ queryKey: ["workspaces"], queryFn: listWorkspaces, enabled: Boolean(sessionQuery.data) });

  React.useEffect(() => {
    const sync = () => {
      setNavTarget(document.querySelector(".nav-list"));
      const current = getWorkspaceSelectValue();
      if (current) setSelectedWorkspaceId(current);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    const onChange = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLSelectElement && target.closest(".workspace-switcher")) sync();
    };
    document.addEventListener("change", onChange);
    return () => {
      observer.disconnect();
      document.removeEventListener("change", onChange);
    };
  }, []);

  const workspace = workspacesQuery.data?.find((item) => item.id === selectedWorkspaceId) ?? null;
  const enabled = Boolean(workspace && workspace.role !== "guest");
  const scopesQuery = useQuery({ queryKey: ["scopes", workspace?.id], queryFn: () => listScopes(workspace!.id), enabled: Boolean(open && workspace) });
  const projectsQuery = useQuery({ queryKey: ["projects", workspace?.id], queryFn: () => listProjects(workspace!.id), enabled: Boolean(open && workspace) });

  const nav = navTarget && enabled ? createPortal(
    <button className={open ? "nav-button active" : "nav-button"} onClick={() => { const current = getWorkspaceSelectValue(); if (current) setSelectedWorkspaceId(current); setOpen(true); }}>
      Tasks
    </button>,
    navTarget,
  ) : null;

  const overlay = open && workspace ? createPortal(
    <div className="tasks-overlay" role="dialog" aria-modal="true" aria-label="Tasks">
      <header className="tasks-overlay-header">
        <div>
          <span className="eyebrow">Workspace · {workspace.name}</span>
          <h1>Tasks</h1>
        </div>
        <button className="ghost-button" onClick={() => setOpen(false)}>← Retour au workspace</button>
      </header>
      <main className="tasks-overlay-content">
        {(scopesQuery.isLoading || projectsQuery.isLoading) ? <div className="center-content"><div className="spinner" />Chargement…</div> : <TasksSection workspace={workspace} scopes={scopesQuery.data ?? []} projects={projectsQuery.data ?? []} />}
      </main>
    </div>,
    document.body,
  ) : null;

  return <>{nav}{overlay}</>;
}
