import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { listPersons, listTeams, type ContextEntitySummary, type PersonSummary, type TeamSummary, type WorkspaceSummary } from "./api";
import {
  addTaskChecklistItem,
  addTaskComment,
  addTaskFileMetadata,
  addTaskTag,
  archiveTask,
  assignTaskPerson,
  assignTaskTeam,
  createTask,
  listTaskAssignments,
  listTaskChecklist,
  listTaskComments,
  listTaskFiles,
  listTaskTags,
  listTasks,
  removeTaskChecklistItem,
  removeTaskFile,
  removeTaskTag,
  unassignTaskPerson,
  unassignTaskTeam,
  updateTask,
  updateTaskChecklistItem,
  type TaskPriority,
  type TaskStatus,
  type TaskSummary,
} from "./task-api";

const statusLabels: Record<TaskStatus, string> = {
  todo: "À faire",
  in_progress: "En cours",
  blocked: "Bloquée",
  done: "Terminée",
  cancelled: "Annulée",
};

const priorityLabels: Record<TaskPriority, string> = {
  low: "Basse",
  normal: "Normale",
  high: "Haute",
  urgent: "Urgente",
};

const statuses: TaskStatus[] = ["todo", "in_progress", "blocked", "done", "cancelled"];
const priorities: TaskPriority[] = ["low", "normal", "high", "urgent"];

type ViewMode = "list" | "kanban";

export function TasksSection({ workspace, scopes, projects }: { workspace: WorkspaceSummary; scopes: ContextEntitySummary[]; projects: ContextEntitySummary[] }) {
  const queryClient = useQueryClient();
  const [view, setView] = React.useState<ViewMode>("list");
  const [contextId, setContextId] = React.useState("");
  const [status, setStatus] = React.useState<TaskStatus | "">("");
  const [priority, setPriority] = React.useState<TaskPriority | "">("");
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);
  const [newTitle, setNewTitle] = React.useState("");
  const [newContextId, setNewContextId] = React.useState(workspace.rootContextId);

  React.useEffect(() => {
    setNewContextId(workspace.rootContextId);
    setSelectedTaskId(null);
  }, [workspace.id, workspace.rootContextId]);

  const tasksQuery = useQuery({
    queryKey: ["tasks", workspace.id, contextId, status, priority],
    queryFn: () => listTasks(workspace.id, {
      ...(contextId ? { contextId } : {}),
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
    }),
  });

  const personsQuery = useQuery({ queryKey: ["persons", workspace.id], queryFn: () => listPersons(workspace.id), enabled: workspace.role !== "guest" });
  const teamsQuery = useQuery({ queryKey: ["teams", workspace.id], queryFn: () => listTeams(workspace.id), enabled: workspace.role !== "guest" });

  const createMutation = useMutation({
    mutationFn: () => createTask(workspace.id, { contextId: newContextId, title: newTitle }),
    onSuccess: async (task) => {
      setNewTitle("");
      setSelectedTaskId(task.id);
      await queryClient.invalidateQueries({ queryKey: ["tasks", workspace.id] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ taskId, patch }: { taskId: string; patch: Parameters<typeof updateTask>[2] }) => updateTask(workspace.id, taskId, patch),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["tasks", workspace.id] }),
  });

  const tasks = tasksQuery.data ?? [];
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const canCreate = workspace.role !== "guest";
  const canArchive = workspace.role === "administrator" || workspace.role === "manager";

  return <div className="tasks-shell">
    <section className="tasks-main panel">
      <div className="tasks-toolbar">
        <div>
          <span className="eyebrow">Tasks</span>
          <h2>Tâches</h2>
          <p>Suivez le travail par contexte, priorité et statut.</p>
        </div>
        <div className="tasks-view-switch">
          <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>Liste</button>
          <button className={view === "kanban" ? "active" : ""} onClick={() => setView("kanban")}>Kanban</button>
        </div>
      </div>

      <div className="tasks-filters">
        <select value={contextId} onChange={(event) => setContextId(event.target.value)}>
          <option value="">Tous les contextes</option>
          <option value={workspace.rootContextId}>{workspace.name} — workspace</option>
          {scopes.map((item) => <option key={item.id} value={item.contextId}>{item.name} — scope</option>)}
          {projects.map((item) => <option key={item.id} value={item.contextId}>{item.name} — projet</option>)}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus | "")}>
          <option value="">Tous les statuts</option>
          {statuses.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}
        </select>
        <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority | "")}>
          <option value="">Toutes les priorités</option>
          {priorities.map((item) => <option key={item} value={item}>{priorityLabels[item]}</option>)}
        </select>
      </div>

      {canCreate && <form className="task-quick-create" onSubmit={(event) => { event.preventDefault(); createMutation.mutate(); }}>
        <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Nouvelle tâche…" required />
        <select value={newContextId} onChange={(event) => setNewContextId(event.target.value)}>
          <option value={workspace.rootContextId}>{workspace.name}</option>
          {scopes.map((item) => <option key={item.id} value={item.contextId}>{item.name}</option>)}
          {projects.map((item) => <option key={item.id} value={item.contextId}>{item.name}</option>)}
        </select>
        <button className="small-primary dark" disabled={createMutation.isPending}>Créer</button>
      </form>}

      {tasksQuery.isLoading ? <p className="muted">Chargement des tâches…</p> : tasksQuery.isError ? <div className="error-box">Impossible de charger les tâches.</div> : view === "list" ? <TaskList tasks={tasks} selectedTaskId={selectedTaskId} onSelect={setSelectedTaskId} onStatus={(task, nextStatus) => updateMutation.mutate({ taskId: task.id, patch: { status: nextStatus } })} /> : <TaskKanban tasks={tasks} selectedTaskId={selectedTaskId} onSelect={setSelectedTaskId} onStatus={(task, nextStatus) => updateMutation.mutate({ taskId: task.id, patch: { status: nextStatus } })} />}
    </section>

    <aside className={selectedTask ? "task-detail panel open" : "task-detail panel"}>
      {selectedTask ? <TaskDetail task={selectedTask} workspace={workspace} tasks={tasks} persons={personsQuery.data ?? []} teams={teamsQuery.data ?? []} canArchive={canArchive} onClose={() => setSelectedTaskId(null)} /> : <div className="task-detail-empty"><strong>Sélectionnez une tâche</strong><span>Le détail, les assignations et la checklist apparaîtront ici.</span></div>}
    </aside>
  </div>;
}

function TaskList({ tasks, selectedTaskId, onSelect, onStatus }: { tasks: TaskSummary[]; selectedTaskId: string | null; onSelect: (id: string) => void; onStatus: (task: TaskSummary, status: TaskStatus) => void }) {
  if (!tasks.length) return <div className="task-empty"><strong>Aucune tâche</strong><span>Créez la première tâche ou modifiez les filtres.</span></div>;
  return <div className="task-table">
    <div className="task-table-head"><span>Tâche</span><span>Statut</span><span>Priorité</span><span>Échéance</span></div>
    {tasks.map((task) => <button key={task.id} className={selectedTaskId === task.id ? "task-row selected" : "task-row"} onClick={() => onSelect(task.id)}>
      <span className="task-title-cell"><strong>{task.title}</strong>{task.parentTaskId && <small>Sous-tâche</small>}</span>
      <select value={task.status} onClick={(event) => event.stopPropagation()} onChange={(event) => onStatus(task, event.target.value as TaskStatus)}>{statuses.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}</select>
      <span>{task.priority ? priorityLabels[task.priority] : "—"}</span>
      <span>{formatDate(task.dueAt)}</span>
    </button>)}
  </div>;
}

function TaskKanban({ tasks, selectedTaskId, onSelect, onStatus }: { tasks: TaskSummary[]; selectedTaskId: string | null; onSelect: (id: string) => void; onStatus: (task: TaskSummary, status: TaskStatus) => void }) {
  return <div className="task-kanban">{statuses.filter((status) => status !== "cancelled").map((status) => {
    const rows = tasks.filter((task) => task.status === status);
    return <section key={status} className="kanban-column"><header><strong>{statusLabels[status]}</strong><span>{rows.length}</span></header><div>{rows.map((task) => <article key={task.id} className={selectedTaskId === task.id ? "kanban-card selected" : "kanban-card"} onClick={() => onSelect(task.id)}><strong>{task.title}</strong><div><span>{task.priority ? priorityLabels[task.priority] : "Sans priorité"}</span><span>{formatDate(task.dueAt)}</span></div><select value={task.status} onClick={(event) => event.stopPropagation()} onChange={(event) => onStatus(task, event.target.value as TaskStatus)}>{statuses.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}</select></article>)}</div></section>;
  })}</div>;
}

function TaskDetail({ task, workspace, tasks, persons, teams, canArchive, onClose }: { task: TaskSummary; workspace: WorkspaceSummary; tasks: TaskSummary[]; persons: PersonSummary[]; teams: TeamSummary[]; canArchive: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState(task.title);
  const [description, setDescription] = React.useState(task.description ?? "");
  const [comment, setComment] = React.useState("");
  const [checkLabel, setCheckLabel] = React.useState("");
  const [tagName, setTagName] = React.useState("");
  const [storageKey, setStorageKey] = React.useState("");
  const [fileName, setFileName] = React.useState("");

  React.useEffect(() => { setTitle(task.title); setDescription(task.description ?? ""); }, [task.id, task.title, task.description]);

  const assignmentsQuery = useQuery({ queryKey: ["task-assignments", workspace.id, task.id], queryFn: () => listTaskAssignments(workspace.id, task.id) });
  const checklistQuery = useQuery({ queryKey: ["task-checklist", workspace.id, task.id], queryFn: () => listTaskChecklist(workspace.id, task.id) });
  const commentsQuery = useQuery({ queryKey: ["task-comments", workspace.id, task.id], queryFn: () => listTaskComments(workspace.id, task.id) });
  const tagsQuery = useQuery({ queryKey: ["task-tags", workspace.id, task.id], queryFn: () => listTaskTags(workspace.id, task.id) });
  const filesQuery = useQuery({ queryKey: ["task-files", workspace.id, task.id], queryFn: () => listTaskFiles(workspace.id, task.id) });

  const invalidateTask = async () => queryClient.invalidateQueries({ queryKey: ["tasks", workspace.id] });
  const updateMutation = useMutation({ mutationFn: (patch: Parameters<typeof updateTask>[2]) => updateTask(workspace.id, task.id, patch), onSuccess: invalidateTask });
  const archiveMutation = useMutation({ mutationFn: () => archiveTask(workspace.id, task.id), onSuccess: async () => { await invalidateTask(); onClose(); } });
  const assignmentMutation = useMutation({ mutationFn: async (input: { kind: "person" | "team"; id: string; remove?: boolean }) => input.kind === "person" ? input.remove ? unassignTaskPerson(workspace.id, task.id, input.id) : assignTaskPerson(workspace.id, task.id, input.id) : input.remove ? unassignTaskTeam(workspace.id, task.id, input.id) : assignTaskTeam(workspace.id, task.id, input.id), onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["task-assignments", workspace.id, task.id] }) });
  const checklistMutation = useMutation({ mutationFn: async (input: { action: "add" | "toggle" | "remove"; id?: string; value?: boolean }) => input.action === "add" ? addTaskChecklistItem(workspace.id, task.id, checkLabel) : input.action === "toggle" ? updateTaskChecklistItem(workspace.id, task.id, input.id!, { isDone: input.value }) : removeTaskChecklistItem(workspace.id, task.id, input.id!), onSuccess: async () => { setCheckLabel(""); await queryClient.invalidateQueries({ queryKey: ["task-checklist", workspace.id, task.id] }); } });
  const commentMutation = useMutation({ mutationFn: () => addTaskComment(workspace.id, task.id, comment), onSuccess: async () => { setComment(""); await queryClient.invalidateQueries({ queryKey: ["task-comments", workspace.id, task.id] }); } });
  const tagMutation = useMutation({ mutationFn: (input: { action: "add" | "remove"; id?: string }) => input.action === "add" ? addTaskTag(workspace.id, task.id, tagName) : removeTaskTag(workspace.id, task.id, input.id!), onSuccess: async () => { setTagName(""); await queryClient.invalidateQueries({ queryKey: ["task-tags", workspace.id, task.id] }); } });
  const fileMutation = useMutation({ mutationFn: (input: { action: "add" | "remove"; id?: string }) => input.action === "add" ? addTaskFileMetadata(workspace.id, task.id, { storageKey, name: fileName }) : removeTaskFile(workspace.id, task.id, input.id!), onSuccess: async () => { setStorageKey(""); setFileName(""); await queryClient.invalidateQueries({ queryKey: ["task-files", workspace.id, task.id] }); } });

  const assignments = assignmentsQuery.data ?? { people: [], teams: [] };
  const assignedPersonIds = new Set(assignments.people.map((row) => row.personId));
  const assignedTeamIds = new Set(assignments.teams.map((row) => row.teamId));

  return <div className="task-detail-content">
    <div className="task-detail-top"><span className="eyebrow">Détail</span><button className="task-close" onClick={onClose}>×</button></div>
    <input className="task-title-input" value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => title.trim() && title !== task.title && updateMutation.mutate({ title })} />
    <textarea className="task-description-input" value={description} onChange={(event) => setDescription(event.target.value)} onBlur={() => description !== (task.description ?? "") && updateMutation.mutate({ description: description || null })} placeholder="Description…" />

    <div className="task-properties">
      <label>Statut<select value={task.status} onChange={(event) => updateMutation.mutate({ status: event.target.value as TaskStatus })}>{statuses.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}</select></label>
      <label>Priorité<select value={task.priority ?? ""} onChange={(event) => updateMutation.mutate({ priority: event.target.value ? event.target.value as TaskPriority : null })}><option value="">Aucune</option>{priorities.map((item) => <option key={item} value={item}>{priorityLabels[item]}</option>)}</select></label>
      <label>Échéance<input type="date" value={dateInput(task.dueAt)} onChange={(event) => updateMutation.mutate({ dueAt: event.target.value ? new Date(`${event.target.value}T23:59:59`).toISOString() : null })} /></label>
      <label>Parent<select value={task.parentTaskId ?? ""} onChange={(event) => updateMutation.mutate({ parentTaskId: event.target.value || null })}><option value="">Aucun</option>{tasks.filter((candidate) => candidate.id !== task.id && candidate.contextId === task.contextId).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select></label>
    </div>

    <DetailBlock title="Assignations">
      <div className="assignment-grid">
        <div><strong>Personnes</strong>{persons.map((person) => <label className="assignment-option" key={person.id}><input type="checkbox" checked={assignedPersonIds.has(person.id)} onChange={(event) => assignmentMutation.mutate({ kind: "person", id: person.id, remove: !event.target.checked })} />{person.displayName}</label>)}</div>
        <div><strong>Équipes</strong>{teams.map((team) => <label className="assignment-option" key={team.id}><input type="checkbox" checked={assignedTeamIds.has(team.id)} onChange={(event) => assignmentMutation.mutate({ kind: "team", id: team.id, remove: !event.target.checked })} />{team.name}</label>)}</div>
      </div>
    </DetailBlock>

    <DetailBlock title="Checklist">
      <form className="detail-inline-form" onSubmit={(event) => { event.preventDefault(); checklistMutation.mutate({ action: "add" }); }}><input value={checkLabel} onChange={(event) => setCheckLabel(event.target.value)} placeholder="Ajouter un élément" required /><button>＋</button></form>
      <div className="checklist-list">{(checklistQuery.data ?? []).map((item) => <div key={item.id}><label><input type="checkbox" checked={item.isDone} onChange={(event) => checklistMutation.mutate({ action: "toggle", id: item.id, value: event.target.checked })} /><span className={item.isDone ? "done" : ""}>{item.label}</span></label><button onClick={() => checklistMutation.mutate({ action: "remove", id: item.id })}>×</button></div>)}</div>
    </DetailBlock>

    <DetailBlock title="Commentaires">
      <form className="detail-inline-form" onSubmit={(event) => { event.preventDefault(); commentMutation.mutate(); }}><input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Ajouter un commentaire" required /><button>Envoyer</button></form>
      <div className="comment-list">{(commentsQuery.data ?? []).map((item) => <article key={item.id}><p>{item.body}</p><small>{new Date(item.createdAt).toLocaleString("fr-FR")}</small></article>)}</div>
    </DetailBlock>

    <DetailBlock title="Tags">
      <form className="detail-inline-form" onSubmit={(event) => { event.preventDefault(); tagMutation.mutate({ action: "add" }); }}><input value={tagName} onChange={(event) => setTagName(event.target.value)} placeholder="Nouveau tag" required /><button>＋</button></form>
      <div className="tag-list">{(tagsQuery.data ?? []).map((item) => <button key={item.tagId} onClick={() => tagMutation.mutate({ action: "remove", id: item.tagId })}>{item.name ?? item.normalizedName ?? item.tagId.slice(0, 8)} ×</button>)}</div>
    </DetailBlock>

    <DetailBlock title="Fichiers">
      <p className="task-hint">V1 : enregistrement des métadonnées et du storageKey. L’upload binaire S3 sera branché ensuite.</p>
      <form className="file-meta-form" onSubmit={(event) => { event.preventDefault(); fileMutation.mutate({ action: "add" }); }}><input value={fileName} onChange={(event) => setFileName(event.target.value)} placeholder="Nom du fichier" required /><input value={storageKey} onChange={(event) => setStorageKey(event.target.value)} placeholder="storageKey" required /><button>Ajouter</button></form>
      <div className="file-list">{(filesQuery.data ?? []).map((item) => { const file = item.file ?? item; const fileId = item.fileId ?? item.file?.id ?? item.id; return <div key={fileId}><span>{file.name ?? "Fichier"}</span>{fileId && <button onClick={() => fileMutation.mutate({ action: "remove", id: fileId })}>Retirer</button>}</div>; })}</div>
    </DetailBlock>

    {canArchive && <button className="task-archive-button" onClick={() => archiveMutation.mutate()} disabled={archiveMutation.isPending}>Archiver la tâche</button>}
    {(updateMutation.isError || assignmentMutation.isError || checklistMutation.isError || commentMutation.isError || tagMutation.isError || fileMutation.isError) && <div className="error-box">Une modification de la tâche a échoué.</div>}
  </div>;
}

function DetailBlock({ title, children }: React.PropsWithChildren<{ title: string }>) { return <section className="task-detail-block"><h3>{title}</h3>{children}</section>; }
function formatDate(value: string | null) { return value ? new Date(value).toLocaleDateString("fr-FR") : "—"; }
function dateInput(value: string | null) { return value ? new Date(value).toISOString().slice(0, 10) : ""; }
