import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { WorkspaceSummary } from "./api";
import { listMilestones, updateMilestone, type MilestoneSummary } from "./planning-api";
import { updateTask, type TaskSummary } from "./task-api";
import "./calendar.css";

type CalendarMode = "month" | "week";
type SelectedItem = { kind: "task"; task: TaskSummary } | { kind: "milestone"; milestone: MilestoneSummary } | null;

export function CalendarSection({
  workspace,
  tasks,
  contextId,
  contexts,
  onSelectTask,
}: {
  workspace: WorkspaceSummary;
  tasks: TaskSummary[];
  contextId: string;
  contexts: Record<string, string>;
  onSelectTask: (taskId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = React.useState<CalendarMode>("month");
  const [anchor, setAnchor] = React.useState(() => startOfDay(new Date()));
  const [selected, setSelected] = React.useState<SelectedItem>(null);

  const milestonesQuery = useQuery({
    queryKey: ["task-milestones", workspace.id, contextId],
    queryFn: () => listMilestones(workspace.id, contextId || undefined),
  });

  const taskMutation = useMutation({
    mutationFn: ({ taskId, patch }: { taskId: string; patch: Parameters<typeof updateTask>[2] }) => updateTask(workspace.id, taskId, patch),
    onSuccess: async (updated) => {
      setSelected({ kind: "task", task: updated });
      await queryClient.invalidateQueries({ queryKey: ["tasks", workspace.id] });
    },
  });

  const milestoneMutation = useMutation({
    mutationFn: ({ milestoneId, dueAt }: { milestoneId: string; dueAt: string }) => updateMilestone(workspace.id, milestoneId, { dueAt }),
    onSuccess: async (updated) => {
      setSelected({ kind: "milestone", milestone: updated });
      await queryClient.invalidateQueries({ queryKey: ["task-milestones", workspace.id] });
    },
  });

  const milestones = milestonesQuery.data ?? [];
  const visibleDays = mode === "month" ? monthGrid(anchor) : weekGrid(anchor);
  const title = mode === "month"
    ? anchor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    : `${formatShortDate(visibleDays[0]!)} — ${formatShortDate(visibleDays[visibleDays.length - 1]!)}`;

  const move = (direction: -1 | 1) => {
    setAnchor((current) => mode === "month" ? addMonths(current, direction) : addDays(current, direction * 7));
  };

  return <div className="calendar-shell">
    <div className="calendar-toolbar">
      <div>
        <span className="eyebrow">Planning</span>
        <h3>{title}</h3>
      </div>
      <div className="calendar-controls">
        <div className="calendar-mode-switch" aria-label="Vue calendrier">
          <button className={mode === "month" ? "active" : ""} onClick={() => setMode("month")}>Mois</button>
          <button className={mode === "week" ? "active" : ""} onClick={() => setMode("week")}>Semaine</button>
        </div>
        <button onClick={() => move(-1)} aria-label="Période précédente">←</button>
        <button onClick={() => setAnchor(startOfDay(new Date()))}>Aujourd’hui</button>
        <button onClick={() => move(1)} aria-label="Période suivante">→</button>
      </div>
    </div>

    {milestonesQuery.isError && <div className="error-box">Impossible de charger les jalons.</div>}

    <div className={mode === "month" ? "calendar-grid month" : "calendar-grid week"}>
      {visibleDays.map((day) => {
        const taskItems = tasks.filter((task) => taskOccursOn(task, day));
        const milestoneItems = milestones.filter((milestone) => sameDay(new Date(milestone.dueAt), day));
        const outside = mode === "month" && day.getMonth() !== anchor.getMonth();
        const today = sameDay(day, new Date());
        return <section key={day.toISOString()} className={`calendar-day${outside ? " outside" : ""}${today ? " today" : ""}`}>
          <header><span>{day.toLocaleDateString("fr-FR", { weekday: mode === "week" ? "short" : undefined })}</span><strong>{day.getDate()}</strong></header>
          <div className="calendar-items">
            {milestoneItems.map((milestone) => <button key={`m-${milestone.id}`} className="calendar-item milestone" onClick={() => setSelected({ kind: "milestone", milestone })}>
              <span className="calendar-item-dot" />
              <span><strong>{milestone.name}</strong><small>{contexts[milestone.contextId] ?? "Contexte"}</small></span>
            </button>)}
            {taskItems.map((task) => <button key={`t-${task.id}`} className={`calendar-item task status-${task.status}`} onClick={() => setSelected({ kind: "task", task })}>
              <span><strong>{task.title}</strong><small>{taskLabel(task, day)} · {contexts[task.contextId] ?? "Contexte"}</small></span>
            </button>)}
            {!taskItems.length && !milestoneItems.length && <span className="calendar-empty-day">—</span>}
          </div>
        </section>;
      })}
    </div>

    {selected && <CalendarEditor
      selected={selected}
      busy={taskMutation.isPending || milestoneMutation.isPending}
      onClose={() => setSelected(null)}
      onOpenTask={(taskId) => { setSelected(null); onSelectTask(taskId); }}
      onSaveTask={(taskId, startAt, dueAt) => taskMutation.mutate({ taskId, patch: { startAt, dueAt } })}
      onSaveMilestone={(milestoneId, dueAt) => milestoneMutation.mutate({ milestoneId, dueAt })}
    />}
  </div>;
}

function CalendarEditor({
  selected,
  busy,
  onClose,
  onOpenTask,
  onSaveTask,
  onSaveMilestone,
}: {
  selected: Exclude<SelectedItem, null>;
  busy: boolean;
  onClose: () => void;
  onOpenTask: (taskId: string) => void;
  onSaveTask: (taskId: string, startAt: string | null, dueAt: string | null) => void;
  onSaveMilestone: (milestoneId: string, dueAt: string) => void;
}) {
  const isTask = selected.kind === "task";
  const [start, setStart] = React.useState(isTask ? dateValue(selected.task.startAt) : "");
  const [due, setDue] = React.useState(isTask ? dateValue(selected.task.dueAt) : dateValue(selected.milestone.dueAt));

  React.useEffect(() => {
    if (selected.kind === "task") {
      setStart(dateValue(selected.task.startAt));
      setDue(dateValue(selected.task.dueAt));
    } else {
      setStart("");
      setDue(dateValue(selected.milestone.dueAt));
    }
  }, [selected]);

  const save = () => {
    if (selected.kind === "task") {
      onSaveTask(selected.task.id, start ? atStartOfDay(start) : null, due ? atEndOfDay(due) : null);
      return;
    }
    if (due) onSaveMilestone(selected.milestone.id, atEndOfDay(due));
  };

  return <aside className="calendar-editor panel">
    <div className="calendar-editor-head">
      <div><span className="eyebrow">{selected.kind === "task" ? "Task" : "Milestone"}</span><h3>{selected.kind === "task" ? selected.task.title : selected.milestone.name}</h3></div>
      <button onClick={onClose} aria-label="Fermer">×</button>
    </div>
    {selected.kind === "task" && <label>Début<input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label>}
    <label>{selected.kind === "task" ? "Échéance" : "Date du jalon"}<input type="date" value={due} onChange={(event) => setDue(event.target.value)} required={selected.kind === "milestone"} /></label>
    <div className="calendar-editor-actions">
      <button className="small-primary dark" disabled={busy || (selected.kind === "milestone" && !due)} onClick={save}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
      {selected.kind === "task" && <button className="small-ghost" onClick={() => onOpenTask(selected.task.id)}>Ouvrir le détail</button>}
    </div>
  </aside>;
}

function taskOccursOn(task: TaskSummary, day: Date) {
  const start = task.startAt ? startOfDay(new Date(task.startAt)) : null;
  const due = task.dueAt ? startOfDay(new Date(task.dueAt)) : null;
  if (!start && !due) return false;
  if (start && due) return day.getTime() >= start.getTime() && day.getTime() <= due.getTime();
  return sameDay(start ?? due!, day);
}

function taskLabel(task: TaskSummary, day: Date) {
  if (task.startAt && task.dueAt) {
    const start = startOfDay(new Date(task.startAt));
    const due = startOfDay(new Date(task.dueAt));
    if (sameDay(start, due)) return "Journée";
    if (sameDay(start, day)) return "Début";
    if (sameDay(due, day)) return "Échéance";
    return "En cours";
  }
  return task.startAt ? "Début" : "Échéance";
}

function monthGrid(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function weekGrid(anchor: Date) {
  const offset = (anchor.getDay() + 6) % 7;
  const start = addDays(startOfDay(anchor), -offset);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function addDays(date: Date, days: number) { const next = new Date(date); next.setDate(next.getDate() + days); return startOfDay(next); }
function addMonths(date: Date, months: number) { return new Date(date.getFullYear(), date.getMonth() + months, 1); }
function startOfDay(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function dateValue(value: string | null) { return value ? new Date(value).toISOString().slice(0, 10) : ""; }
function atStartOfDay(value: string) { return new Date(`${value}T00:00:00`).toISOString(); }
function atEndOfDay(value: string) { return new Date(`${value}T23:59:59`).toISOString(); }
function formatShortDate(value: Date) { return value.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }); }
