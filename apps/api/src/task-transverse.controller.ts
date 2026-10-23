import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { getAuthSession } from "@utilitaire/auth";
import { isActiveWorkspaceMember } from "@utilitaire/core";
import { hasPermission } from "@utilitaire/permissions";
import {
  ensureTaskPermissionsForWorkspace,
  getTask,
  getTaskByObjectId,
  type TaskPermissionKey,
} from "@utilitaire/tasks";
import {
  addComment,
  addObjectRelation,
  addTagToObject,
  archiveComment,
  archiveObjectRelation,
  createFileLink,
  InvalidRelationError,
  InvalidTransverseObjectError,
  listComments,
  listFilesForObject,
  listNotifications,
  listObjectRelations,
  listTagsForObject,
  markNotificationRead,
  removeTagFromObject,
  unlinkFile,
} from "@utilitaire/transverse";
import type { Request } from "express";

import { apiDatabase } from "./database.js";

interface CommentBody { body?: unknown }
interface TagBody { name?: unknown }
interface FileBody {
  storageKey?: unknown;
  name?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
  label?: unknown;
}
interface RelationBody {
  targetObjectId?: unknown;
  relationType?: unknown;
  metadata?: unknown;
}

function requireString(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim().length === 0) throw new BadRequestException(`${label} is required`);
  return value.trim();
}

function optionalString(value: unknown, label: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new BadRequestException(`${label} must be a string or null`);
  return value;
}

function optionalInteger(value: unknown, label: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) throw new BadRequestException(`${label} must be an integer or null`);
  return value;
}

function optionalMetadata(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("metadata must be an object");
  return value as Record<string, unknown>;
}

function mapTransverseError(error: unknown): never {
  if (error instanceof InvalidTransverseObjectError || error instanceof InvalidRelationError) {
    throw new BadRequestException(error.message);
  }
  throw error;
}

@Controller("api/workspaces/:workspaceId/tasks/:taskId")
export class TaskTransverseController {
  private async requireUser(request: Request) {
    const session = await getAuthSession(request.headers);
    if (!session) throw new UnauthorizedException();
    return session.user;
  }

  private async requireTaskPermission(workspaceId: string, userId: string, taskId: string, permissionKey: TaskPermissionKey) {
    if (!(await isActiveWorkspaceMember(apiDatabase, workspaceId, userId))) throw new NotFoundException();
    const task = await getTask(apiDatabase, workspaceId, taskId);
    if (!task) throw new NotFoundException();
    await ensureTaskPermissionsForWorkspace(apiDatabase, workspaceId);
    const allowed = await hasPermission(apiDatabase, { workspaceId, userId, contextId: task.contextId, permissionKey });
    if (!allowed) throw new ForbiddenException();
    return task;
  }

  private async requireReadableTaskObject(workspaceId: string, userId: string, objectId: string) {
    const targetTask = await getTaskByObjectId(apiDatabase, workspaceId, objectId);
    if (!targetTask) throw new BadRequestException("Relation target must be an active Task in this Workspace");
    const allowed = await hasPermission(apiDatabase, {
      workspaceId,
      userId,
      contextId: targetTask.contextId,
      permissionKey: "tasks.task.read",
    });
    if (!allowed) throw new ForbiddenException();
    return targetTask;
  }

  @Get("comments")
  async comments(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string) {
    const user = await this.requireUser(request);
    const task = await this.requireTaskPermission(workspaceId, user.id, taskId, "tasks.task.read");
    return listComments(apiDatabase, workspaceId, task.objectId);
  }

  @Post("comments")
  async addComment(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string, @Body() body: CommentBody) {
    const user = await this.requireUser(request);
    const task = await this.requireTaskPermission(workspaceId, user.id, taskId, "tasks.task.comment");
    return addComment(apiDatabase, { workspaceId, objectId: task.objectId, authorUserId: user.id, body: requireString(body.body, "body") });
  }

  @Delete("comments/:commentId")
  async archiveComment(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string, @Param("commentId") commentId: string) {
    const user = await this.requireUser(request);
    const task = await this.requireTaskPermission(workspaceId, user.id, taskId, "tasks.task.comment");
    const row = await archiveComment(apiDatabase, workspaceId, task.objectId, commentId, user.id);
    if (!row) throw new NotFoundException();
    return row;
  }

  @Get("tags")
  async tags(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string) {
    const user = await this.requireUser(request);
    const task = await this.requireTaskPermission(workspaceId, user.id, taskId, "tasks.task.read");
    return listTagsForObject(apiDatabase, workspaceId, task.objectId);
  }

  @Post("tags")
  async addTag(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string, @Body() body: TagBody) {
    const user = await this.requireUser(request);
    const task = await this.requireTaskPermission(workspaceId, user.id, taskId, "tasks.task.update");
    return addTagToObject(apiDatabase, workspaceId, task.objectId, requireString(body.name, "name"), user.id);
  }

  @Delete("tags/:tagId")
  async removeTag(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string, @Param("tagId") tagId: string) {
    const user = await this.requireUser(request);
    const task = await this.requireTaskPermission(workspaceId, user.id, taskId, "tasks.task.update");
    const row = await removeTagFromObject(apiDatabase, workspaceId, task.objectId, tagId, user.id);
    if (!row) throw new NotFoundException();
    return row;
  }

  @Get("files")
  async files(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string) {
    const user = await this.requireUser(request);
    const task = await this.requireTaskPermission(workspaceId, user.id, taskId, "tasks.task.read");
    return listFilesForObject(apiDatabase, workspaceId, task.objectId);
  }

  @Post("files")
  async addFile(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string, @Body() body: FileBody) {
    const user = await this.requireUser(request);
    const task = await this.requireTaskPermission(workspaceId, user.id, taskId, "tasks.task.update");
    return createFileLink(apiDatabase, {
      workspaceId,
      objectId: task.objectId,
      uploaderUserId: user.id,
      storageKey: requireString(body.storageKey, "storageKey"),
      name: requireString(body.name, "name"),
      mimeType: optionalString(body.mimeType, "mimeType"),
      sizeBytes: optionalInteger(body.sizeBytes, "sizeBytes"),
      label: optionalString(body.label, "label"),
    });
  }

  @Delete("files/:fileId")
  async unlinkFile(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string, @Param("fileId") fileId: string) {
    const user = await this.requireUser(request);
    const task = await this.requireTaskPermission(workspaceId, user.id, taskId, "tasks.task.update");
    const row = await unlinkFile(apiDatabase, workspaceId, task.objectId, fileId, user.id);
    if (!row) throw new NotFoundException();
    return row;
  }

  @Get("relations")
  async relations(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string) {
    const user = await this.requireUser(request);
    const task = await this.requireTaskPermission(workspaceId, user.id, taskId, "tasks.task.read");
    const rows = await listObjectRelations(apiDatabase, workspaceId, task.objectId);
    const visible = await Promise.all(rows.map(async (row) => {
      const otherObjectId = row.sourceObjectId === task.objectId ? row.targetObjectId : row.sourceObjectId;
      const targetTask = await getTaskByObjectId(apiDatabase, workspaceId, otherObjectId);
      if (!targetTask) return false;
      return hasPermission(apiDatabase, {
        workspaceId,
        userId: user.id,
        contextId: targetTask.contextId,
        permissionKey: "tasks.task.read",
      });
    }));
    return rows.filter((_, index) => visible[index]);
  }

  @Post("relations")
  async addRelation(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string, @Body() body: RelationBody) {
    const user = await this.requireUser(request);
    const task = await this.requireTaskPermission(workspaceId, user.id, taskId, "tasks.task.update");
    const targetObjectId = requireString(body.targetObjectId, "targetObjectId");
    await this.requireReadableTaskObject(workspaceId, user.id, targetObjectId);
    try {
      return await addObjectRelation(apiDatabase, {
        workspaceId,
        sourceObjectId: task.objectId,
        targetObjectId,
        relationType: requireString(body.relationType, "relationType"),
        actorUserId: user.id,
        metadata: optionalMetadata(body.metadata),
      });
    } catch (error) {
      mapTransverseError(error);
    }
  }

  @Delete("relations/:relationId")
  async archiveRelation(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string, @Param("relationId") relationId: string) {
    const user = await this.requireUser(request);
    const task = await this.requireTaskPermission(workspaceId, user.id, taskId, "tasks.task.update");
    const row = await archiveObjectRelation(apiDatabase, workspaceId, task.objectId, relationId, user.id);
    if (!row) throw new NotFoundException();
    return row;
  }
}

@Controller("api/workspaces/:workspaceId/notifications")
export class NotificationsController {
  private async requireUser(request: Request, workspaceId: string) {
    const session = await getAuthSession(request.headers);
    if (!session) throw new UnauthorizedException();
    if (!(await isActiveWorkspaceMember(apiDatabase, workspaceId, session.user.id))) throw new NotFoundException();
    return session.user;
  }

  @Get()
  async list(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Query("unreadOnly") unreadOnly?: string) {
    const user = await this.requireUser(request, workspaceId);
    return listNotifications(apiDatabase, workspaceId, user.id, unreadOnly === "true");
  }

  @Patch(":notificationId/read")
  async read(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("notificationId") notificationId: string) {
    const user = await this.requireUser(request, workspaceId);
    const row = await markNotificationRead(apiDatabase, workspaceId, user.id, notificationId);
    if (!row) throw new NotFoundException();
    return row;
  }
}
