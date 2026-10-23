import { randomUUID } from "node:crypto";

import {
  activities,
  contexts,
  createDatabase,
  objects,
  outboxEvents,
  persons,
  taskChecklistItems,
  taskPersonAssignments,
  taskTeamAssignments,
  tasks,
  teams,
  workspaces,
} from "@utilitaire/database";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import {
  addChecklistItem,
  archiveTask,
  assignPerson,
  assignTeam,
  createTask,
  InvalidParentTaskError,
  InvalidTaskAssignmentError,
  listChecklistItems,
  listTaskAssignments,
  moveTaskSubtree,
  TaskHierarchyCycleError,
  unassignPerson,
  updateChecklistItem,
  updateTask,
} from "./index.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://utilitaire:utilitaire@localhost:5432/utilitaire";
const { db, client } = createDatabase(databaseUrl);

async function createWorkspaceFixture(name: string) {
  const [workspace] = await db.insert(workspaces).values({ name }).returning({ id: workspaces.id });
  if (!workspace) throw new Error("Workspace fixture failed");
  const [rootContext] = await db
    .insert(contexts)
    .values({ workspaceId: workspace.id, type: "workspace", parentContextId: null })
    .returning({ id: contexts.id });
  if (!rootContext) throw new Error("Root Context fixture failed");
  const [projectContext] = await db
    .insert(contexts)
    .values({ workspaceId: workspace.id, type: "project", parentContextId: rootContext.id })
    .returning({ id: contexts.id });
  if (!projectContext) throw new Error("Project Context fixture failed");

  const [personObject] = await db
    .insert(objects)
    .values({ workspaceId: workspace.id, contextId: rootContext.id, moduleKey: "core", objectType: "person" })
    .returning({ id: objects.id });
  const [teamObject] = await db
    .insert(objects)
    .values({ workspaceId: workspace.id, contextId: rootContext.id, moduleKey: "core", objectType: "team" })
    .returning({ id: objects.id });
  if (!personObject || !teamObject) throw new Error("Registry fixture failed");

  const [person] = await db
    .insert(persons)
    .values({ workspaceId: workspace.id, objectId: personObject.id, displayName: `${name} Person` })
    .returning({ id: persons.id });
  const [team] = await db
    .insert(teams)
    .values({ workspaceId: workspace.id, objectId: teamObject.id, name: `${name} Team` })
    .returning({ id: teams.id });
  if (!person || !team) throw new Error("Directory fixture failed");

  return {
    workspaceId: workspace.id,
    rootContextId: rootContext.id,
    projectContextId: projectContext.id,
    personId: person.id,
    teamId: team.id,
  };
}

async function cleanupWorkspace(workspaceId: string) {
  await db.delete(taskChecklistItems).where(eq(taskChecklistItems.workspaceId, workspaceId));
  await db.delete(taskPersonAssignments).where(eq(taskPersonAssignments.workspaceId, workspaceId));
  await db.delete(taskTeamAssignments).where(eq(taskTeamAssignments.workspaceId, workspaceId));
  await db.delete(activities).where(eq(activities.workspaceId, workspaceId));
  await db.delete(outboxEvents).where(eq(outboxEvents.workspaceId, workspaceId));
  await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
  await db.delete(persons).where(eq(persons.workspaceId, workspaceId));
  await db.delete(teams).where(eq(teams.workspaceId, workspaceId));
  await db.delete(objects).where(eq(objects.workspaceId, workspaceId));
  await db.delete(contexts).where(eq(contexts.workspaceId, workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
}

afterAll(async () => {
  await client.end();
});

describe("Tasks domain", () => {
  it("keeps hierarchy, assignments, moves and mutations tenant-safe", async () => {
    const a = await createWorkspaceFixture(`Tasks A ${randomUUID()}`);
    const b = await createWorkspaceFixture(`Tasks B ${randomUUID()}`);

    try {
      const parent = await createTask(db, {
        workspaceId: a.workspaceId,
        contextId: a.rootContextId,
        title: "Parent",
        priority: "high",
      });
      const child = await createTask(db, {
        workspaceId: a.workspaceId,
        contextId: a.rootContextId,
        parentTaskId: parent.id,
        title: "Child",
      });

      await expect(
        createTask(db, {
          workspaceId: a.workspaceId,
          contextId: a.projectContextId,
          parentTaskId: parent.id,
          title: "Wrong Context child",
        }),
      ).rejects.toBeInstanceOf(InvalidParentTaskError);

      await expect(
        updateTask(db, a.workspaceId, parent.id, { parentTaskId: child.id }),
      ).rejects.toBeInstanceOf(TaskHierarchyCycleError);

      const personAssignment = await assignPerson(db, a.workspaceId, parent.id, a.personId);
      const teamAssignment = await assignTeam(db, a.workspaceId, parent.id, a.teamId);
      expect(personAssignment.personId).toBe(a.personId);
      expect(teamAssignment.teamId).toBe(a.teamId);

      await expect(assignPerson(db, a.workspaceId, parent.id, b.personId)).rejects.toBeInstanceOf(
        InvalidTaskAssignmentError,
      );
      await expect(assignTeam(db, a.workspaceId, parent.id, b.teamId)).rejects.toBeInstanceOf(
        InvalidTaskAssignmentError,
      );

      const beforeUnassign = await listTaskAssignments(db, a.workspaceId, parent.id);
      expect(beforeUnassign.people).toHaveLength(1);
      expect(beforeUnassign.teams).toHaveLength(1);
      await unassignPerson(db, a.workspaceId, parent.id, a.personId);
      const afterUnassign = await listTaskAssignments(db, a.workspaceId, parent.id);
      expect(afterUnassign.people).toHaveLength(0);

      const item = await addChecklistItem(db, a.workspaceId, parent.id, "First item");
      await updateChecklistItem(db, a.workspaceId, parent.id, item.id, { isDone: true });
      const checklist = await listChecklistItems(db, a.workspaceId, parent.id);
      expect(checklist).toHaveLength(1);
      expect(checklist[0]?.isDone).toBe(true);

      const moved = await moveTaskSubtree(db, a.workspaceId, parent.id, a.projectContextId);
      expect(moved?.movedTaskIds.sort()).toEqual([parent.id, child.id].sort());

      const movedRows = await db
        .select({ id: tasks.id, contextId: tasks.contextId, parentTaskId: tasks.parentTaskId, objectId: tasks.objectId })
        .from(tasks)
        .where(and(eq(tasks.workspaceId, a.workspaceId), eq(tasks.contextId, a.projectContextId)));
      expect(movedRows.map((row) => row.id).sort()).toEqual([parent.id, child.id].sort());
      expect(movedRows.find((row) => row.id === parent.id)?.parentTaskId).toBeNull();

      const movedObjectIds = movedRows.map((row) => row.objectId);
      const movedObjects = await db
        .select({ id: objects.id, contextId: objects.contextId })
        .from(objects)
        .where(eq(objects.workspaceId, a.workspaceId));
      expect(
        movedObjects.filter((row) => movedObjectIds.includes(row.id)).every((row) => row.contextId === a.projectContextId),
      ).toBe(true);

      const archived = await archiveTask(db, a.workspaceId, child.id);
      expect(archived?.archivedAt).toBeTruthy();
      const [archivedObject] = await db
        .select({ archivedAt: objects.archivedAt })
        .from(objects)
        .where(and(eq(objects.workspaceId, a.workspaceId), eq(objects.id, child.objectId)));
      expect(archivedObject?.archivedAt).toBeTruthy();

      const activityRows = await db.select().from(activities).where(eq(activities.workspaceId, a.workspaceId));
      const outboxRows = await db.select().from(outboxEvents).where(eq(outboxEvents.workspaceId, a.workspaceId));
      expect(activityRows.length).toBeGreaterThanOrEqual(8);
      expect(outboxRows.length).toBe(activityRows.length);

      const foreignTaskRows = await db.select().from(tasks).where(eq(tasks.workspaceId, b.workspaceId));
      expect(foreignTaskRows).toHaveLength(0);
    } finally {
      await cleanupWorkspace(a.workspaceId);
      await cleanupWorkspace(b.workspaceId);
    }
  });
});
