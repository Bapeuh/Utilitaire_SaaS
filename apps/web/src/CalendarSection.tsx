import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { WorkspaceSummary } from "./api";
import { listMilestones, updateMilestone, type MilestoneSummary } from "./planning-api";
import { updateTask, type TaskSummary } from "./task-api";
import "./calendar.css";

type CalendarMode = "month" | "week";
type SelectedItem = { kind: "task"; task: TaskSummary } | { kind: "milestone"; milestone: MilestoneSummary } | null;
type DragAction = "move" | "resize-start" | "resize-end";
type DragPayload = { kind: "task" | "milestone"; id: string; action?: DragAction };

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
  const [dragOverDay, setDragOverDay] = React.useState<string | null>(null);

  const milestonesQuery = useQuery({
    queryKey: ["task-milestones", workspace.id, contextId],
    queryFn: () => listMilestones(workspace.id, contextId || undefined),
  });

  const taskMutation = useMutation({
    mutationFn: ({ taskId, patch }: { taskId: string; patch: Parameters<typeof updateTask>[2] }) => updateTask(workspace.id, taskId, patch),
    onSuccess: async (updated) => {
      setSelected((current) => current?.kind === "task" && current.task.id === updated.id ? { kind: "task", task: updated } : current);
      await queryClient.invalidateQueries({ queryKey: ["tasks", workspace.id] });
    },
  });

  const milestoneMutation = useMutation({
    mutationFn: ({ milestoneId, dueAt }: { milestoneId: string; dueAt: string }) => updateMilestone(workspace.id, milestoneId, { dueAt }),
    onSuccess: async (updated) => {
      setSelected((current) => current?.kind === "milestone" && current.milestone.id === updated.id ? { kind: "milestone", milestone: updated } : current);
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

  const handleDrop = (event: React.DragEvent, day: Date) => {
    event.preventDefault();
    setDragOverDay(null);
    const raw = event.dataTransfer.getData("application/x-utilitaire-calendar");
    if (!raw) return;
    let payload: DragPayload;
    try {
      payload = JSON.parse(raw) as DragPayload;
    } catch {
      return;
    }

    if (payload.kind === "milestone") {
      const milestone = milestones.find((item) => item.id === payload.id);
      if (!milestone) return;
      milestoneMutation.mutate({ milestoneId: milestone.id, dueAt: atEndOfDate(day) });
      return;
    }

    const task = tasks.find((item) => item.id === payload.id);
    if (!task) return;
    const action = payload.action ?? "move";
    const patch = action === "resize-start"
      ? resizedTaskDates(task, day, "start")
      : action === "resize-end"
        ? resizedTaskDates(task, day, "end")
        : shiftedTaskDates(task, day);
    taskMutation.mutate({ taskId: task.id, patch });
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

    <div className="calendar-legend">
      <span><i className="legend-task" /> Tâche / période</span>
      <span><i className="legend-milestone" /> Jalon</span>
      <small>Glissez le corps pour déplacer une période. Tirez ses poignées gauche/droite pour modifier le début ou la fin.</small>
    </div>

    {(milestonesQuery.isError || taskMutation.isError || milestoneMutation.isError) && <div className="error-box">Une opération du calendrier a échoué.</div>}

    <div className={mode === "month" ? "calendar-grid month" : "calendar-grid week"}>
      {visibleDays.map((day) => {
        const key = dateKey(day);
        const taskItems = tasks.filter((task) => taskOccursOn(task, day));
        const milestoneItems = milestones.filter((milestone) => sameDay(new Date(milestone.dueAt), day));
        const outside = mode === "month" && day.getMonth() !== anchor.getMonth();
        const today = sameDay(day, new Date());
        const dragOver = dragOverDay === key;
        return <section
          key={day.toISOString()}
          className={`calendar-day${outside ? " outside" : ""}${today ? " today" : ""}${dragOver ? " drag-over" : ""}`}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverDay(key); }}
          onDragLeave={() => setDragOverDay((current) => current === key ? null : current)}
          onDrop={(event) => handleDrop(event, day)}
        >
          <header><span>{day.toLocaleDateString("fr-FR", { weekday: mode === "week" ? "short" : undefined })}</span><strong>{day.getDate()}</strong></header>
          <div className="calendar-items">
            {milestoneItems.map((milestone) => <button
              key={`m-${milestone.id}`}
              className="calendar-item milestone"
              draggable
              onDragStart={(event) => setDragData(event, { kind: "milestone", id: milestone.id, action: "move" })}
              onClick={() => setSelected({ kind: "milestone", milestone })}
            >
              <span className="calendar-item-dot" />
              <span><strong>{milestone.name}</strong><small>Jalon · {contexts[milestone.contextId] ?? "Contexte"}</small></span>
            </button>)}
            {taskItems.map((task) => {
              const period = Boolean(task.startAt && task.dueAt);
              const isStart = period && sameDay(startOfDay(new Date(task.startAt!)), day);
              const isEnd = period && sameDay(startOfDay(new Date(task.dueAt!)), day);
              return <div
                key={`t-${task.id}`}
                className={`calendar-item task status-${task.status}${period ? " period" : ""}`}
                draggable
                role="button"
                tabIndex={0}
                onDragStart={(event) => setDragData(event, { kind: "task", id: task.id, action: "move" })}
                onClick={() => setSelected({ kind: "task", task })}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelected({ kind: "task", task }); }}
              >
                {isStart && <span
                  className="calendar-resize-handle start"
                  draggable
                  title="Modifier la date de début"
                  aria-label="Modifier la date de début"
                  onClick={(event) => event.stopPropagation()}
                  onDragStart={(event) => { event.stopPropagation(); setDragData(event, { kind: "task", id: task.id, action: "resize-start" }); }}
                />}
                <span className="calendar-item-content"><strong>{task.title}</strong><small>{taskLabel(task, day)} · {durationLabel(task)} · {contexts[task.contextId] ?? "Contexte"}</small></span>
                {isEnd && <span
                  className="calendar-resize-handle end"
                  draggable
                  title="Modifier la date de fin"
                  aria-label="Modifier la date de fin"
                  onClick={(event) => event.stopPropagation()}
                  onDragStart={(event) => { event.stopPropagation(); setDragData(event, { kind: "task", id: task.id, action: "resize-end" }); }}
                />}
              </div>;
            })}
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
  const initialTaskMode = isTask && selected.task.startAt ? "period" : "deadline";
  const [taskMode, setTaskMode] = React.useState<"deadline" | "period">(initialTaskMode);
  const [start, setStart] = React.useState(isTask ? dateValue(selected.task.startAt) : "");
  const [due, setDue] = React.useState(isTask ? dateValue(selected.task.dueAt) : dateValue(selected.milestone.dueAt));

  React.useEffect(() => {
    if (selected.kind === "task") {
      setTaskMode(selected.task.startAt ? "period" : "deadline");
      setStart(dateValue(selected.task.startAt));
      setDue(dateValue(selected.task.dueAt));
    } else {
      setStart("");
      setDue(dateValue(selected.milestone.dueAt));
    }
  }, [selected]);

  const durationDays = start && due ? Math.max(1, differenceInCalendarDays(parseDateInput(due), parseDateInput(start)) + 1) : 1;

  const setDuration = (days: number) => {
    if (!start || !Number.isInteger(days) || days < 1) return;
    setDue(dateKey(addDays(parseDateInput(start), days - 1)));
  };

  const save = () => {
    if (selected.kind === "task") {
      if (taskMode === "deadline") {
        onSaveTask(selected.task.id, null, due ? atEndOfDay(due) : null);
      } else {
        onSaveTask(selected.task.id, start ? atStartOfDay(start) : null, due ? atEndOfDay(due) : null);
      }
      return;
    }
    if (due) onSaveMilestone(selected.milestone.id, atEndOfDay(due));
  };

  return <aside className="calendar-editor panel" role="dialog" aria-modal="false">
    <div className="calendar-editor-head">
      <div><span className="eyebrow">{selected.kind === "task" ? "Task" : "Milestone"}</span><h3>{selected.kind === "task" ? selected.task.title : selected.milestone.name}</h3></div>
      <button onClick={onClose} aria-label="Fermer">×</button>
    </div>

    {selected.kind === "task" && <>
      <label>Planification
        <select value={taskMode} onChange={(event) => {
          const next = event.target.value as "deadline" | "period";
          setTaskMode(next);
          if (next === "period" && !start) {
            const base = due || dateKey(new Date());
            setStart(base);
            if (!due) setDue(base);
          }
        }}>
          <option value="deadline">Date fixe / échéance</option>
          <option value="period">Période / durée</option>
        </select>
      </label>
      {taskMode === "period" && <label>Début<input type="date" value={start} onChange={(event) => {
        const next = event.target.value;
        const oldDuration = durationDays;
        setStart(next);
        if (next) setDue(dateKey(addDays(parseDateInput(next), oldDuration - 1)));
      }} /></label>}
      {taskMode === "period" && <label>Durée (jours)<input type="number" min={1} step={1} value={durationDays} onChange={(event) => setDuration(Number(event.target.value))} /></label>}
    </>}

    <label>{selected.kind === "task" ? (taskMode === "period" ? "Fin / échéance" : "Date / échéance") : "Date du jalon"}<input type="date" value={due} onChange={(event) => setDue(event.target.value)} required={selected.kind === "milestone"} /></label>

    <div className="calendar-editor-actions">
      <button className="small-primary dark" disabled={busy || (selected.kind === "milestone" && !due) || (selected.kind === "task" && taskMode === "period" && (!start || !due))} onClick={save}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
      {selected.kind === "task" && <button className="small-ghost" onClick={() => onOpenTask(selected.task.id)}>Ouvrir le détail</button>}
    </div>
  </aside>;
}

function setDragData(event: React.DragEvent, payload: DragPayload) {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/x-utilitaire-calendar", JSON.stringify(payload));
}

function shiftedTaskDates(task: TaskSummary, targetDay: Date): Parameters<typeof updateTask>[2] {
  const start = task.startAt ? startOfDay(new Date(task.startAt)) : null;
  const due = task.dueAt ? startOfDay(new Date(task.dueAt)) : null;

  if (start && due) {
    const duration = differenceInCalendarDays(due, start);
    return { startAt: atStartOfDate(targetDay), dueAt: atEndOfDate(addDays(targetDay, duration)) };
  }
  if (start) return { startAt: atStartOfDate(targetDay) };
  return { dueAt: atEndOfDate(targetDay) };
}

function resizedTaskDates(task: TaskSummary, targetDay: Date, edge: "start" | "end"): Parameters<typeof updateTask>[2] {
  const start = task.startAt ? startOfDay(new Date(task.startAt)) : null;
  const due = task.dueAt ? startOfDay(new Date(task.dueAt)) : null;
  if (!start || !due) return shiftedTaskDates(task, targetDay);

  if (edge === "start") {
    const nextStart = targetDay.getTime() > due.getTime() ? due : targetDay;
    return { startAt: atStartOfDate(nextStart) };
  }

  const nextDue = targetDay.getTime() < start.getTime() ? start : targetDay;
  return { dueAt: atEndOfDate(nextDue) };
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
    if (sameDay(due, day)) return "Fin";
    return "En cours";
  }
  return task.startAt ? "Début" : "Échéance";
}

function durationLabel(task: TaskSummary) {
  if (!task.startAt || !task.dueAt) return "date fixe";
  const days = differenceInCalendarDays(startOfDay(new Date(task.dueAt)), startOfDay(new Date(task.startAt))) + 1;
  return days <= 1 ? "1 jour" : `${days} jours`;
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
function differenceInCalendarDays(a: Date, b: Date) { return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000); }
function dateKey(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function parseDateInput(value: string) { const [year, month, day] = value.split("-").map(Number); return new Date(year!, month! - 1, day!); }
function dateValue(value: string | null) { return value ? dateKey(new Date(value)) : ""; }
function atStartOfDay(value: string) { return atStartOfDate(parseDateInput(value)); }
function atEndOfDay(value: string) { return atEndOfDate(parseDateInput(value)); }
function atStartOfDate(value: Date) { const day = startOfDay(value); day.setHours(0, 0, 0, 0); return day.toISOString(); }
function atEndOfDate(value: Date) { const day = startOfDay(value); day.setHours(23, 59, 59, 999); return day.toISOString(); }
function formatShortDate(value: Date) { return value.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }); }
