import {
  comments,
  createDatabase,
  fileLinks,
  files,
  notifications,
  objectRelations,
  objects,
  tagLinks,
  tags,
} from "@utilitaire/database";
import { enqueueOutboxEvent, writeActivity } from "@utilitaire/event-bus";
import { and, asc, eq, isNull, or } from "drizzle-orm";

type Database = ReturnType<typeof createDatabase>["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Pick<Database, "select" | "insert" | "update">;

export class InvalidTransverseObjectError extends Error {}
export class InvalidRelationError extends Error {}

async function requireObject(executor: Executor, workspaceId: string, objectId: string) {
  const [object] = await executor
    .select()
    .from(objects)
    .where(and(eq(objects.workspaceId, workspaceId), eq(objects.id, objectId), isNull(objects.archivedAt)))
    .limit(1);
  if (!object) throw new InvalidTransverseObjectError("Object not found in Workspace");
  return object;
}

async function auditObjectMutation(
  tx: Transaction,
  input: {
    workspaceId: string;
    objectId: string;
    contextId?: string | null | undefined;
    actorUserId?: string | null | undefined;
    action: string;
    eventName: string;
    payload?: Record<string, unknown> | undefined;
  },
) {
  await writeActivity(tx, {
    workspaceId: input.workspaceId,
    contextId: input.contextId ?? null,
    objectId: input.objectId,
    actorUserId: input.actorUserId ?? null,
    moduleKey: "core",
    action: input.action,
    metadata: input.payload ?? {},
  });
  await enqueueOutboxEvent(tx, {
    workspaceId: input.workspaceId,
    eventName: input.eventName,
    aggregateObjectId: input.objectId,
    payload: input.payload ?? {},
  });
}

export async function addComment(
  db: Database,
  input: { workspaceId: string; objectId: string; authorUserId: string; body: string },
) {
  const body = input.body.trim();
  if (!body) throw new Error("Comment body is required");
  return db.transaction(async (tx) => {
    const object = await requireObject(tx, input.workspaceId, input.objectId);
    const [comment] = await tx.insert(comments).values({ ...input, body }).returning();
    if (!comment) throw new Error("Comment creation failed");
    await auditObjectMutation(tx, {
      workspaceId: input.workspaceId,
      objectId: input.objectId,
      contextId: object.contextId,
      actorUserId: input.authorUserId,
      action: "comment.created",
      eventName: "core.comment.created.v1",
      payload: { commentId: comment.id },
    });
    return comment;
  });
}

export async function listComments(db: Database, workspaceId: string, objectId: string) {
  await requireObject(db, workspaceId, objectId);
  return db.select().from(comments).where(and(eq(comments.workspaceId, workspaceId), eq(comments.objectId, objectId), isNull(comments.archivedAt))).orderBy(asc(comments.createdAt));
}

export async function archiveComment(db: Database, workspaceId: string, objectId: string, commentId: string, actorUserId: string) {
  return db.transaction(async (tx) => {
    const object = await requireObject(tx, workspaceId, objectId);
    const [comment] = await tx.update(comments).set({ archivedAt: new Date(), updatedAt: new Date() }).where(and(eq(comments.workspaceId, workspaceId), eq(comments.objectId, objectId), eq(comments.id, commentId), isNull(comments.archivedAt))).returning();
    if (!comment) return null;
    await auditObjectMutation(tx, { workspaceId, objectId, contextId: object.contextId, actorUserId, action: "comment.archived", eventName: "core.comment.archived.v1", payload: { commentId } });
    return comment;
  });
}

export async function createFileLink(
  db: Database,
  input: { workspaceId: string; objectId: string; uploaderUserId: string; storageKey: string; name: string; mimeType?: string | null | undefined; sizeBytes?: number | null | undefined; label?: string | null | undefined },
) {
  if (!input.storageKey.trim() || !input.name.trim()) throw new Error("File storageKey and name are required");
  if (input.sizeBytes != null && (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 0)) throw new Error("sizeBytes must be a non-negative integer");
  return db.transaction(async (tx) => {
    const object = await requireObject(tx, input.workspaceId, input.objectId);
    const [file] = await tx.insert(files).values({ workspaceId: input.workspaceId, storageKey: input.storageKey.trim(), name: input.name.trim(), mimeType: input.mimeType ?? null, sizeBytes: input.sizeBytes ?? null, uploaderUserId: input.uploaderUserId }).returning();
    if (!file) throw new Error("File creation failed");
    const [link] = await tx.insert(fileLinks).values({ workspaceId: input.workspaceId, fileId: file.id, objectId: input.objectId, label: input.label ?? null }).returning();
    if (!link) throw new Error("File link creation failed");
    await auditObjectMutation(tx, { workspaceId: input.workspaceId, objectId: input.objectId, contextId: object.contextId, actorUserId: input.uploaderUserId, action: "file.linked", eventName: "core.file.linked.v1", payload: { fileId: file.id, fileLinkId: link.id } });
    return { file, link };
  });
}

export async function listFilesForObject(db: Database, workspaceId: string, objectId: string) {
  await requireObject(db, workspaceId, objectId);
  return db.select({ linkId: fileLinks.id, fileId: files.id, name: files.name, storageKey: files.storageKey, mimeType: files.mimeType, sizeBytes: files.sizeBytes, label: fileLinks.label, createdAt: files.createdAt }).from(fileLinks).innerJoin(files, and(eq(files.workspaceId, fileLinks.workspaceId), eq(files.id, fileLinks.fileId))).where(and(eq(fileLinks.workspaceId, workspaceId), eq(fileLinks.objectId, objectId), isNull(fileLinks.archivedAt), isNull(files.archivedAt))).orderBy(asc(files.createdAt));
}

export async function unlinkFile(db: Database, workspaceId: string, objectId: string, fileId: string, actorUserId: string) {
  return db.transaction(async (tx) => {
    const object = await requireObject(tx, workspaceId, objectId);
    const [link] = await tx.update(fileLinks).set({ archivedAt: new Date() }).where(and(eq(fileLinks.workspaceId, workspaceId), eq(fileLinks.objectId, objectId), eq(fileLinks.fileId, fileId), isNull(fileLinks.archivedAt))).returning();
    if (!link) return null;
    await auditObjectMutation(tx, { workspaceId, objectId, contextId: object.contextId, actorUserId, action: "file.unlinked", eventName: "core.file.unlinked.v1", payload: { fileId } });
    return link;
  });
}

function normalizeTagName(name: string) {
  return name.trim().toLocaleLowerCase("fr-FR");
}

export async function addTagToObject(db: Database, workspaceId: string, objectId: string, name: string, actorUserId: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Tag name is required");
  const normalizedName = normalizeTagName(cleanName);
  return db.transaction(async (tx) => {
    const object = await requireObject(tx, workspaceId, objectId);
    let [tag] = await tx.select().from(tags).where(and(eq(tags.workspaceId, workspaceId), eq(tags.normalizedName, normalizedName))).limit(1);
    if (!tag) {
      [tag] = await tx.insert(tags).values({ workspaceId, name: cleanName, normalizedName }).returning();
    } else if (tag.archivedAt) {
      [tag] = await tx.update(tags).set({ name: cleanName, archivedAt: null, updatedAt: new Date() }).where(eq(tags.id, tag.id)).returning();
    }
    if (!tag) throw new Error("Tag creation failed");
    const [existing] = await tx.select().from(tagLinks).where(and(eq(tagLinks.workspaceId, workspaceId), eq(tagLinks.tagId, tag.id), eq(tagLinks.objectId, objectId))).limit(1);
    const [link] = existing
      ? await tx.update(tagLinks).set({ archivedAt: null }).where(eq(tagLinks.id, existing.id)).returning()
      : await tx.insert(tagLinks).values({ workspaceId, tagId: tag.id, objectId }).returning();
    if (!link) throw new Error("Tag link failed");
    await auditObjectMutation(tx, { workspaceId, objectId, contextId: object.contextId, actorUserId, action: "tag.linked", eventName: "core.tag.linked.v1", payload: { tagId: tag.id, name: tag.name } });
    return { tag, link };
  });
}

export async function listTagsForObject(db: Database, workspaceId: string, objectId: string) {
  await requireObject(db, workspaceId, objectId);
  return db.select({ id: tags.id, name: tags.name }).from(tagLinks).innerJoin(tags, and(eq(tags.workspaceId, tagLinks.workspaceId), eq(tags.id, tagLinks.tagId))).where(and(eq(tagLinks.workspaceId, workspaceId), eq(tagLinks.objectId, objectId), isNull(tagLinks.archivedAt), isNull(tags.archivedAt))).orderBy(asc(tags.name));
}

export async function removeTagFromObject(db: Database, workspaceId: string, objectId: string, tagId: string, actorUserId: string) {
  return db.transaction(async (tx) => {
    const object = await requireObject(tx, workspaceId, objectId);
    const [link] = await tx.update(tagLinks).set({ archivedAt: new Date() }).where(and(eq(tagLinks.workspaceId, workspaceId), eq(tagLinks.objectId, objectId), eq(tagLinks.tagId, tagId), isNull(tagLinks.archivedAt))).returning();
    if (!link) return null;
    await auditObjectMutation(tx, { workspaceId, objectId, contextId: object.contextId, actorUserId, action: "tag.unlinked", eventName: "core.tag.unlinked.v1", payload: { tagId } });
    return link;
  });
}

export async function addObjectRelation(db: Database, input: { workspaceId: string; sourceObjectId: string; targetObjectId: string; relationType: string; actorUserId: string; metadata?: Record<string, unknown> | undefined }) {
  const relationType = input.relationType.trim();
  if (!relationType) throw new InvalidRelationError("relationType is required");
  if (input.sourceObjectId === input.targetObjectId) throw new InvalidRelationError("An Object cannot relate to itself");
  return db.transaction(async (tx) => {
    const source = await requireObject(tx, input.workspaceId, input.sourceObjectId);
    await requireObject(tx, input.workspaceId, input.targetObjectId);
    const [existing] = await tx.select().from(objectRelations).where(and(eq(objectRelations.workspaceId, input.workspaceId), eq(objectRelations.sourceObjectId, input.sourceObjectId), eq(objectRelations.targetObjectId, input.targetObjectId), eq(objectRelations.relationType, relationType))).limit(1);
    const [relation] = existing
      ? await tx.update(objectRelations).set({ archivedAt: null, metadata: input.metadata ?? {} }).where(eq(objectRelations.id, existing.id)).returning()
      : await tx.insert(objectRelations).values({ workspaceId: input.workspaceId, sourceObjectId: input.sourceObjectId, targetObjectId: input.targetObjectId, relationType, metadata: input.metadata ?? {} }).returning();
    if (!relation) throw new Error("Relation creation failed");
    await auditObjectMutation(tx, { workspaceId: input.workspaceId, objectId: input.sourceObjectId, contextId: source.contextId, actorUserId: input.actorUserId, action: "relation.created", eventName: "core.relation.created.v1", payload: { relationId: relation.id, targetObjectId: input.targetObjectId, relationType } });
    return relation;
  });
}

export async function listObjectRelations(db: Database, workspaceId: string, objectId: string) {
  await requireObject(db, workspaceId, objectId);
  return db.select().from(objectRelations).where(and(eq(objectRelations.workspaceId, workspaceId), or(eq(objectRelations.sourceObjectId, objectId), eq(objectRelations.targetObjectId, objectId)), isNull(objectRelations.archivedAt))).orderBy(asc(objectRelations.createdAt));
}

export async function archiveObjectRelation(db: Database, workspaceId: string, objectId: string, relationId: string, actorUserId: string) {
  return db.transaction(async (tx) => {
    const object = await requireObject(tx, workspaceId, objectId);
    const [relation] = await tx.update(objectRelations).set({ archivedAt: new Date() }).where(and(eq(objectRelations.workspaceId, workspaceId), eq(objectRelations.id, relationId), or(eq(objectRelations.sourceObjectId, objectId), eq(objectRelations.targetObjectId, objectId)), isNull(objectRelations.archivedAt))).returning();
    if (!relation) return null;
    await auditObjectMutation(tx, { workspaceId, objectId, contextId: object.contextId, actorUserId, action: "relation.archived", eventName: "core.relation.archived.v1", payload: { relationId } });
    return relation;
  });
}

export async function createNotification(db: Database, input: { workspaceId: string; userId: string; sourceObjectId?: string | null | undefined; type: string; title: string; body?: string | null | undefined; data?: Record<string, unknown> | undefined }) {
  const [row] = await db.insert(notifications).values({ workspaceId: input.workspaceId, userId: input.userId, sourceObjectId: input.sourceObjectId ?? null, type: input.type, title: input.title, body: input.body ?? null, data: input.data ?? {} }).returning();
  if (!row) throw new Error("Notification creation failed");
  return row;
}

export async function listNotifications(db: Database, workspaceId: string, userId: string, unreadOnly = false) {
  const conditions = [eq(notifications.workspaceId, workspaceId), eq(notifications.userId, userId), isNull(notifications.archivedAt)];
  if (unreadOnly) conditions.push(isNull(notifications.readAt));
  return db.select().from(notifications).where(and(...conditions)).orderBy(asc(notifications.createdAt));
}

export async function markNotificationRead(db: Database, workspaceId: string, userId: string, notificationId: string) {
  const [row] = await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.workspaceId, workspaceId), eq(notifications.userId, userId), eq(notifications.id, notificationId), isNull(notifications.archivedAt))).returning();
  return row ?? null;
}
