import { randomUUID } from "node:crypto";

import {
  activities,
  comments,
  contexts,
  createDatabase,
  fileLinks,
  files,
  notifications,
  objectRelations,
  objects,
  outboxEvents,
  tagLinks,
  tags,
  users,
  workspaceUsers,
  workspaces,
} from "@utilitaire/database";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import {
  addComment,
  addObjectRelation,
  addTagToObject,
  createFileLink,
  InvalidTransverseObjectError,
  listComments,
  listFilesForObject,
  listObjectRelations,
  listTagsForObject,
} from "./index.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://utilitaire:utilitaire@localhost:5432/utilitaire";
const { db, client } = createDatabase(databaseUrl);

async function fixture(label: string) {
  const [user] = await db.insert(users).values({ name: label, email: `${randomUUID()}@transverse.test` }).returning({ id: users.id });
  const [workspace] = await db.insert(workspaces).values({ name: label }).returning({ id: workspaces.id });
  if (!user || !workspace) throw new Error("fixture failed");
  await db.insert(workspaceUsers).values({ workspaceId: workspace.id, userId: user.id, role: "administrator" });
  const [context] = await db.insert(contexts).values({ workspaceId: workspace.id, type: "workspace", parentContextId: null }).returning({ id: contexts.id });
  if (!context) throw new Error("context fixture failed");
  const [first] = await db.insert(objects).values({ workspaceId: workspace.id, contextId: context.id, moduleKey: "test", objectType: "thing" }).returning({ id: objects.id });
  const [second] = await db.insert(objects).values({ workspaceId: workspace.id, contextId: context.id, moduleKey: "test", objectType: "thing" }).returning({ id: objects.id });
  if (!first || !second) throw new Error("object fixture failed");
  return { workspaceId: workspace.id, userId: user.id, objectId: first.id, secondObjectId: second.id };
}

async function cleanup(workspaceId: string, userId: string) {
  await db.delete(notifications).where(eq(notifications.workspaceId, workspaceId));
  await db.delete(objectRelations).where(eq(objectRelations.workspaceId, workspaceId));
  await db.delete(tagLinks).where(eq(tagLinks.workspaceId, workspaceId));
  await db.delete(tags).where(eq(tags.workspaceId, workspaceId));
  await db.delete(fileLinks).where(eq(fileLinks.workspaceId, workspaceId));
  await db.delete(files).where(eq(files.workspaceId, workspaceId));
  await db.delete(comments).where(eq(comments.workspaceId, workspaceId));
  await db.delete(activities).where(eq(activities.workspaceId, workspaceId));
  await db.delete(outboxEvents).where(eq(outboxEvents.workspaceId, workspaceId));
  await db.delete(objects).where(eq(objects.workspaceId, workspaceId));
  await db.delete(contexts).where(eq(contexts.workspaceId, workspaceId));
  await db.delete(workspaceUsers).where(eq(workspaceUsers.workspaceId, workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, userId));
}

afterAll(async () => {
  await client.end();
});

describe("transverse object services", () => {
  it("attaches comments, files, tags and relations through Object Registry without cross-workspace access", async () => {
    const a = await fixture(`Transverse A ${randomUUID()}`);
    const b = await fixture(`Transverse B ${randomUUID()}`);
    try {
      await addComment(db, { workspaceId: a.workspaceId, objectId: a.objectId, authorUserId: a.userId, body: "Hello" });
      await addTagToObject(db, a.workspaceId, a.objectId, "Important", a.userId);
      await createFileLink(db, { workspaceId: a.workspaceId, objectId: a.objectId, uploaderUserId: a.userId, storageKey: `test/${randomUUID()}`, name: "brief.pdf", mimeType: "application/pdf", sizeBytes: 42 });
      await addObjectRelation(db, { workspaceId: a.workspaceId, sourceObjectId: a.objectId, targetObjectId: a.secondObjectId, relationType: "related", actorUserId: a.userId });

      expect(await listComments(db, a.workspaceId, a.objectId)).toHaveLength(1);
      expect(await listTagsForObject(db, a.workspaceId, a.objectId)).toHaveLength(1);
      expect(await listFilesForObject(db, a.workspaceId, a.objectId)).toHaveLength(1);
      expect(await listObjectRelations(db, a.workspaceId, a.objectId)).toHaveLength(1);

      await expect(listComments(db, b.workspaceId, a.objectId)).rejects.toBeInstanceOf(InvalidTransverseObjectError);
      await expect(addObjectRelation(db, { workspaceId: a.workspaceId, sourceObjectId: a.objectId, targetObjectId: b.objectId, relationType: "forbidden", actorUserId: a.userId })).rejects.toBeInstanceOf(InvalidTransverseObjectError);
    } finally {
      await cleanup(a.workspaceId, a.userId);
      await cleanup(b.workspaceId, b.userId);
    }
  });
});
