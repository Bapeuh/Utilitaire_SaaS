import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { WorkspaceSummary } from "./api";
import { listMilestones, updateMilestone, type MilestoneSummary } from "./planning-api";
import { createTask, updateTask, type TaskSummary } from "./task-api";
import "./calendar.css";

type CalendarMode = "month" | "week" | "agenda";
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
  const [creatingDay, setCreatingDay] = React.useState<Date | null>(null);
  const [newTaskTitle, setNewTaskTitle] = React.useState("");

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

  const createMutation = useMutation({
    mutationFn: ({ day, title }: { day: Date; title: string }) => createTask(workspace.id, {
      contextId: contextId || workspace.rootContextId,
      title,
      dueAt: atEndOfDate(day),
    }),
    onSuccess: async (created) => {
      setCreatingDay(null);
      setNewTaskTitle("");
      await queryClient.invalidateQueries({ queryKey: ["tasks", workspace.id] });
      setSelected({ kind: "task", task: created });
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
  const weekDays = weekGrid(anchor);
  const weekTasks = tasks
    .filter((task) => taskOverlapsRange(task, weekDays[0]!, weekDays[6]!))
    .sort((a, b) => taskSortTime(a) - taskSortTime(b));
  const title = mode === "month"
    ? anchor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    : mode === "agenda"
      ? `Semaine n°${getISOWeek(anchor)} — ${weekMonthLabel(weekDays)}`
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

  const openCreate = (day: Date) => {
    setCreatingDay(startOfDay(day));
    setNewTaskTitle("");
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
          <button className={mode === "agenda" ? "active" : ""} onClick={() => setMode("agenda")}>Hebdo</button>
        </div>
        <button onClick={() => move(-1)} aria-label="Période précédente">←</button>
        <button onClick={() => setAnchor(startOfDay(new Date()))}>Aujourd’hui</button>
        <button onClick={() => move(1)} aria-label="Période suivante">→</button>
      </div>
    </div>

    <div className="calendar-legend">
      <span><i className="legend-task" /> Tâche / période</span>
      <span><i className="legend-milestone" /> Jalon</span>
      <small>Glissez le corps pour déplacer une tâche. Tirez une poignée pour créer ou modifier sa durée.</small>
    </div>

    {(milestonesQuery.isError || taskMutation.isError || milestoneMutation.isError || createMutation.isError) && <div className="error-box">Une opération du calendrier a échoué.</div>}

    {mode === "agenda" ? <WeeklyAgenda
      days={weekDays}
      tasks={weekTasks}
      contexts={contexts}
      onOpenTask={(task) => setSelected({ kind: "task", task })}
      onCreateTask={openCreate}
    /> : <div className={mode === "month" ? "calendar-grid month" : "calendar-grid week"}>
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
          <header>
            <span>{day.toLocaleDateString("fr-FR", { weekday: mode === "week" ? "short" : undefined })}</span>
            <div className="calendar-day-actions"><strong>{day.getDate()}</strong><button type="button" className="calendar-add-button" onClick={() => openCreate(day)} aria-label={`Ajouter une tâche le ${day.toLocaleDateString("fr-FR")}`}>＋</button></div>
          </header>
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
              const fixedDate = !period && Boolean(task.startAt || task.dueAt);
              const isStart = period ? sameDay(startOfDay(new Date(task.startAt!)), day) : fixedDate;
              const isEnd = period ? sameDay(startOfDay(new Date(task.dueAt!)), day) : fixedDate;
              return <div
                key={`t-${task.id}`}
                className={`calendar-item task status-${task.status}${period ? " period" : ""}${fixedDate ? " resizable" : ""}`}
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
                  title={fixedDate ? "Étendre la tâche vers le début" : "Modifier la date de début"}
                  aria-label={fixedDate ? "Étendre la tâche vers le début" : "Modifier la date de début"}
                  onClick={(event) => event.stopPropagation()}
                  onDragStart={(event) => { event.stopPropagation(); setDragData(event, { kind: "task", id: task.id, action: "resize-start" }); }}
                />}
                <span className="calendar-item-content"><strong>{task.title}</strong><small>{taskLabel(task, day)} · {durationLabel(task)} · {contexts[task.contextId] ?? "Contexte"}</small></span>
                {isEnd && <span
                  className="calendar-resize-handle end"
                  draggable
                  title={fixedDate ? "Étendre la tâche vers la fin" : "Modifier la date de fin"}
                  aria-label={fixedDate ? "Étendre la tâche vers la fin" : "Modifier la date de fin"}
                  onClick={(event) => event.stopPropagation()}
                  onDragStart={(event) => { event.stopPropagation(); setDragData(event, { kind: "task", id: task.id, action: "resize-end" }); }}
                />}
              </div>;
            })}
            {!taskItems.length && !milestoneItems.length && <span className="calendar-empty-day">—</span>}
          </div>
        </section>;
      })}
    </div>}

    {creatingDay && <form className="calendar-create-popover panel" onSubmit={(event) => {
      event.preventDefault();
      if (!newTaskTitle.trim()) return;
      createMutation.mutate({ day: creatingDay, title: newTaskTitle.trim() });
    }}>
      <div className="calendar-editor-head">
        <div><span className="eyebrow">Nouvelle Task</span><h3>{creatingDay.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</h3></div>
        <button type="button" onClick={() => setCreatingDay(null)} aria-label="Fermer">×</button>
      </div>
      <label>Titre<input autoFocus value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} placeholder="Nom de la tâche…" required /></label>
      <small className="muted">Contexte : {contexts[contextId || workspace.rootContextId] ?? workspace.name}</small>
      <div className="calendar-editor-actions">
        <button className="small-primary dark" disabled={createMutation.isPending}>{createMutation.isPending ? "Création…" : "Créer"}</button>
        <button type="button" className="small-ghost" onClick={() => setCreatingDay(null)}>Annuler</button>
      </div>
    </form>}

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

function WeeklyAgenda({
  days,
  tasks,
  contexts,
  onOpenTask,
  onCreateTask,
}: {
  days: Date[];
  tasks: TaskSummary[];
  contexts: Record<string, string>;
  onOpenTask: (task: TaskSummary) => void;
  onCreateTask: (day: Date) => void;
}) {
  return <div className="weekly-agenda">
    <div className="weekly-agenda-days">
      {days.map((day) => <button key={dateKey(day)} onClick={() => onCreateTask(day)} className={sameDay(day, new Date()) ? "today" : ""}>
        <span>{day.toLocaleDateString("fr-FR", { weekday: "short" })}</span>
        <strong>{day.getDate()}</strong>
        <small>＋ Task</small>
      </button>)}
    </div>
    <div className="weekly-task-list">
      <div className="weekly-task-head"><strong>{tasks.length} tâche{tasks.length > 1 ? "s" : ""} prévue{tasks.length > 1 ? "s" : ""}</strong><span>{formatShortDate(days[0]!)} → {formatShortDate(days[6]!)}</span></div>
      {tasks.length === 0 ? <div className="task-empty"><strong>Aucune tâche cette semaine</strong><span>Utilisez le + sur un jour pour en ajouter une.</span></div> : tasks.map((task) => <button key={task.id} className="weekly-task-row" onClick={() => onOpenTask(task)}>
        <div className="weekly-task-date"><strong>{taskWeekLabel(task, days[0]!, days[6]!)}</strong><small>{durationLabel(task)}</small></div>
        <div className="weekly-task-main"><strong>{task.title}</strong><small>{contexts[task.contextId] ?? "Contexte"}</small></div>
        <span className={`weekly-status status-${task.status}`}>{statusLabel(task.status)}</span>
      </button>)}
    </div>
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
  if (!start || !due) {
    const fixed = due ?? start;
    if (!fixed) return {};
    if (edge === "start") {
      const nextStart = targetDay.getTime() > fixed.getTime() ? fixed : targetDay;
      return { startAt: atStartOfDate(nextStart), dueAt: atEndOfDate(fixed) };
    }
    const nextDue = targetDay.getTime() < fixed.getTime() ? fixed : targetDay;
    return { startAt: atStartOfDate(fixed), dueAt: atEndOfDate(nextDue) };
  }
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

function taskOverlapsRange(task: TaskSummary, rangeStart: Date, rangeEnd: Date) {
  const start = task.startAt ? startOfDay(new Date(task.startAt)) : task.dueAt ? startOfDay(new Date(task.dueAt)) : null;
  const due = task.dueAt ? startOfDay(new Date(task.dueAt)) : task.startAt ? startOfDay(new Date(task.startAt)) : null;
  if (!start || !due) return false;
  return start.getTime() <= rangeEnd.getTime() && due.getTime() >= rangeStart.getTime();
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

function taskWeekLabel(task: TaskSummary, weekStart: Date, weekEnd: Date) {
  const start = task.startAt ? startOfDay(new Date(task.startAt)) : task.dueAt ? startOfDay(new Date(task.dueAt)) : weekStart;
  const due = task.dueAt ? startOfDay(new Date(task.dueAt)) : start;
  const visibleStart = start.getTime() < weekStart.getTime() ? weekStart : start;
  const visibleEnd = due.getTime() > weekEnd.getTime() ? weekEnd : due;
  if (sameDay(visibleStart, visibleEnd)) return visibleStart.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
  return `${visibleStart.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })} → ${visibleEnd.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}`;
}

function statusLabel(status: TaskSummary["status"]) {
  return ({ todo: "À faire", in_progress: "En cours", blocked: "Bloquée", done: "Terminée", cancelled: "Annulée" } as const)[status];
}

function taskSortTime(task: TaskSummary) {
  const value = task.startAt ?? task.dueAt;
  return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
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

function getISOWeek(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
}

function weekMonthLabel(days: Date[]) {
  const middle = days[3]!;
  return middle.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
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
