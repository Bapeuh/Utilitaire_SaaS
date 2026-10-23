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
  addChecklistItem,
  archiveChecklistItem,
  archiveTask,
  assignPerson,
  assignTeam,
  createTask,
  ensureTaskPermissionsForWorkspace,
  getTask,
  InvalidParentTaskError,
  InvalidTaskAssignmentError,
  InvalidTaskContextError,
  InvalidTaskDatesError,
  InvalidTaskEstimateError,
  listChecklistItems,
  listTaskAssignments,
  listTasks,
  moveTaskSubtree,
  taskPriorities,
  taskStatuses,
  TaskHierarchyCycleError,
  unassignPerson,
  unassignTeam,
  updateChecklistItem,
  updateTask,
  type TaskPermissionKey,
  type TaskPriority,
  type TaskStatus,
} from "@utilitaire/tasks";
import type { Request } from "express";

import { apiDatabase } from "./database.js";

interface CreateTaskBody {
  contextId?: unknown;
  parentTaskId?: unknown;
  title?: unknown;
  description?: unknown;
  status?: unknown;
  priority?: unknown;
  startAt?: unknown;
  dueAt?: unknown;
  estimatedMinutes?: unknown;
  position?: unknown;
}

interface UpdateTaskBody extends Omit<CreateTaskBody, "contextId"> {}
interface MoveTaskBody { contextId?: unknown }
interface AssignmentBody { personId?: unknown; teamId?: unknown }
interface ChecklistCreateBody { label?: unknown; position?: unknown }
interface ChecklistUpdateBody { label?: unknown; isDone?: unknown; position?: unknown }

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

function optionalId(value: unknown, label: string): string | null | undefined {
  const parsed = optionalString(value, label);
  if (parsed === undefined || parsed === null) return parsed;
  const trimmed = parsed.trim();
  if (!trimmed) throw new BadRequestException(`${label} must not be empty`);
  return trimmed;
}

function optionalDate(value: unknown, label: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new BadRequestException(`${label} must be an ISO date string or null`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${label} is invalid`);
  return date;
}

function optionalInteger(value: unknown, label: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) throw new BadRequestException(`${label} must be an integer or null`);
  return value;
}

function optionalStatus(value: unknown): TaskStatus | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && (taskStatuses as readonly string[]).includes(value)) return value as TaskStatus;
  throw new BadRequestException(`status must be one of: ${taskStatuses.join(", ")}`);
}

function optionalPriority(value: unknown): TaskPriority | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string" && (taskPriorities as readonly string[]).includes(value)) return value as TaskPriority;
  throw new BadRequestException(`priority must be one of: ${taskPriorities.join(", ")} or null`);
}

function mapTaskError(error: unknown): never {
  if (
    error instanceof InvalidTaskContextError ||
    error instanceof InvalidParentTaskError ||
    error instanceof TaskHierarchyCycleError ||
    error instanceof InvalidTaskDatesError ||
    error instanceof InvalidTaskEstimateError ||
    error instanceof InvalidTaskAssignmentError
  ) {
    throw new BadRequestException(error.message);
  }
  throw error;
}

@Controller("api/workspaces/:workspaceId/tasks")
export class TasksController {
  private async requireUser(request: Request) {
    const session = await getAuthSession(request.headers);
    if (!session) throw new UnauthorizedException();
    return session.user;
  }

  private async requireWorkspaceMembership(workspaceId: string, userId: string) {
    if (!(await isActiveWorkspaceMember(apiDatabase, workspaceId, userId))) throw new NotFoundException();
  }

  private async requirePermission(workspaceId: string, userId: string, contextId: string, permissionKey: TaskPermissionKey) {
    await this.requireWorkspaceMembership(workspaceId, userId);
    await ensureTaskPermissionsForWorkspace(apiDatabase, workspaceId);
    const allowed = await hasPermission(apiDatabase, { workspaceId, userId, contextId, permissionKey });
    if (!allowed) throw new ForbiddenException();
  }

  @Get()
  async list(
    @Req() request: Request,
    @Param("workspaceId") workspaceId: string,
    @Query("contextId") contextId?: string,
    @Query("status") status?: string,
    @Query("priority") priority?: string,
  ) {
    const user = await this.requireUser(request);
    await this.requireWorkspaceMembership(workspaceId, user.id);
    await ensureTaskPermissionsForWorkspace(apiDatabase, workspaceId);
    const parsedStatus = status ? optionalStatus(status) : undefined;
    const parsedPriority = priority ? optionalPriority(priority) ?? undefined : undefined;
    const rows = await listTasks(apiDatabase, workspaceId, { contextId, status: parsedStatus, priority: parsedPriority });
    const readable = await Promise.all(
      rows.map(async (task) => ({
        task,
        allowed: await hasPermission(apiDatabase, {
          workspaceId,
          userId: user.id,
          contextId: task.contextId,
          permissionKey: "tasks.task.read",
        }),
      })),
    );
    return readable.filter((row) => row.allowed).map((row) => row.task);
  }

  @Post()
  async create(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Body() body: CreateTaskBody) {
    const user = await this.requireUser(request);
    const contextId = requireString(body.contextId, "contextId");
    await this.requirePermission(workspaceId, user.id, contextId, "tasks.task.create");
    try {
      return await createTask(
        apiDatabase,
        {
          workspaceId,
          contextId,
          parentTaskId: optionalId(body.parentTaskId, "parentTaskId"),
          title: requireString(body.title, "title"),
          description: optionalString(body.description, "description"),
          status: optionalStatus(body.status),
          priority: optionalPriority(body.priority),
          startAt: optionalDate(body.startAt, "startAt"),
          dueAt: optionalDate(body.dueAt, "dueAt"),
          estimatedMinutes: optionalInteger(body.estimatedMinutes, "estimatedMinutes"),
          position: optionalInteger(body.position, "position") ?? undefined,
        },
        { actorUserId: user.id },
      );
    } catch (error) {
      mapTaskError(error);
    }
  }

  @Get(":taskId")
  async get(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string) {
    const user = await this.requireUser(request);
    await this.requireWorkspaceMembership(workspaceId, user.id);
    const task = await getTask(apiDatabase, workspaceId, taskId);
    if (!task) throw new NotFoundException();
    await this.requirePermission(workspaceId, user.id, task.contextId, "tasks.task.read");
    return task;
  }

  @Patch(":taskId")
  async update(
    @Req() request: Request,
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @Body() body: UpdateTaskBody,
  ) {
    const user = await this.requireUser(request);
    await this.requireWorkspaceMembership(workspaceId, user.id);
    const current = await getTask(apiDatabase, workspaceId, taskId);
    if (!current) throw new NotFoundException();
    await this.requirePermission(workspaceId, user.id, current.contextId, "tasks.task.update");
    try {
      const updated = await updateTask(
        apiDatabase,
        workspaceId,
        taskId,
        {
          title: body.title === undefined ? undefined : requireString(body.title, "title"),
          description: optionalString(body.description, "description"),
          status: optionalStatus(body.status),
          priority: optionalPriority(body.priority),
          startAt: optionalDate(body.startAt, "startAt"),
          dueAt: optionalDate(body.dueAt, "dueAt"),
          estimatedMinutes: optionalInteger(body.estimatedMinutes, "estimatedMinutes"),
          parentTaskId: optionalId(body.parentTaskId, "parentTaskId"),
          position: optionalInteger(body.position, "position") ?? undefined,
        },
        { actorUserId: user.id },
      );
      if (!updated) throw new NotFoundException();
      return updated;
    } catch (error) {
      mapTaskError(error);
    }
  }

  @Post(":taskId/archive")
  async archive(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string) {
    const user = await this.requireUser(request);
    await this.requireWorkspaceMembership(workspaceId, user.id);
    const current = await getTask(apiDatabase, workspaceId, taskId);
    if (!current) throw new NotFoundException();
    await this.requirePermission(workspaceId, user.id, current.contextId, "tasks.task.archive");
    const archived = await archiveTask(apiDatabase, workspaceId, taskId, { actorUserId: user.id });
    if (!archived) throw new NotFoundException();
    return archived;
  }

  @Post(":taskId/move")
  async move(
    @Req() request: Request,
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @Body() body: MoveTaskBody,
  ) {
    const user = await this.requireUser(request);
    await this.requireWorkspaceMembership(workspaceId, user.id);
    const current = await getTask(apiDatabase, workspaceId, taskId);
    if (!current) throw new NotFoundException();
    const targetContextId = requireString(body.contextId, "contextId");
    await this.requirePermission(workspaceId, user.id, current.contextId, "tasks.task.update");
    await this.requirePermission(workspaceId, user.id, targetContextId, "tasks.task.update");
    try {
      const moved = await moveTaskSubtree(apiDatabase, workspaceId, taskId, targetContextId, { actorUserId: user.id });
      if (!moved) throw new NotFoundException();
      return moved;
    } catch (error) {
      mapTaskError(error);
    }
  }

  @Get(":taskId/assignments")
  async assignments(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string) {
    const user = await this.requireUser(request);
    const task = await getTask(apiDatabase, workspaceId, taskId);
    if (!task) throw new NotFoundException();
    await this.requirePermission(workspaceId, user.id, task.contextId, "tasks.task.read");
    return listTaskAssignments(apiDatabase, workspaceId, taskId);
  }

  @Post(":taskId/assignments/persons")
  async assignPerson(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string, @Body() body: AssignmentBody) {
    const user = await this.requireUser(request);
    const task = await getTask(apiDatabase, workspaceId, taskId);
    if (!task) throw new NotFoundException();
    await this.requirePermission(workspaceId, user.id, task.contextId, "tasks.task.assign");
    try {
      return await assignPerson(apiDatabase, workspaceId, taskId, requireString(body.personId, "personId"), { actorUserId: user.id });
    } catch (error) {
      mapTaskError(error);
    }
  }

  @Delete(":taskId/assignments/persons/:personId")
  async unassignPerson(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string, @Param("personId") personId: string) {
    const user = await this.requireUser(request);
    const task = await getTask(apiDatabase, workspaceId, taskId);
    if (!task) throw new NotFoundException();
    await this.requirePermission(workspaceId, user.id, task.contextId, "tasks.task.assign");
    const assignment = await unassignPerson(apiDatabase, workspaceId, taskId, personId, { actorUserId: user.id });
    if (!assignment) throw new NotFoundException();
    return assignment;
  }

  @Post(":taskId/assignments/teams")
  async assignTeam(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string, @Body() body: AssignmentBody) {
    const user = await this.requireUser(request);
    const task = await getTask(apiDatabase, workspaceId, taskId);
    if (!task) throw new NotFoundException();
    await this.requirePermission(workspaceId, user.id, task.contextId, "tasks.task.assign");
    try {
      return await assignTeam(apiDatabase, workspaceId, taskId, requireString(body.teamId, "teamId"), { actorUserId: user.id });
    } catch (error) {
      mapTaskError(error);
    }
  }

  @Delete(":taskId/assignments/teams/:teamId")
  async unassignTeam(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string, @Param("teamId") teamId: string) {
    const user = await this.requireUser(request);
    const task = await getTask(apiDatabase, workspaceId, taskId);
    if (!task) throw new NotFoundException();
    await this.requirePermission(workspaceId, user.id, task.contextId, "tasks.task.assign");
    const assignment = await unassignTeam(apiDatabase, workspaceId, taskId, teamId, { actorUserId: user.id });
    if (!assignment) throw new NotFoundException();
    return assignment;
  }

  @Get(":taskId/checklist")
  async checklist(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string) {
    const user = await this.requireUser(request);
    const task = await getTask(apiDatabase, workspaceId, taskId);
    if (!task) throw new NotFoundException();
    await this.requirePermission(workspaceId, user.id, task.contextId, "tasks.task.read");
    return listChecklistItems(apiDatabase, workspaceId, taskId);
  }

  @Post(":taskId/checklist")
  async addChecklist(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string, @Body() body: ChecklistCreateBody) {
    const user = await this.requireUser(request);
    const task = await getTask(apiDatabase, workspaceId, taskId);
    if (!task) throw new NotFoundException();
    await this.requirePermission(workspaceId, user.id, task.contextId, "tasks.task.update");
    return addChecklistItem(
      apiDatabase,
      workspaceId,
      taskId,
      requireString(body.label, "label"),
      optionalInteger(body.position, "position") ?? 0,
      { actorUserId: user.id },
    );
  }

  @Patch(":taskId/checklist/:itemId")
  async updateChecklist(
    @Req() request: Request,
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @Param("itemId") itemId: string,
    @Body() body: ChecklistUpdateBody,
  ) {
    const user = await this.requireUser(request);
    const task = await getTask(apiDatabase, workspaceId, taskId);
    if (!task) throw new NotFoundException();
    await this.requirePermission(workspaceId, user.id, task.contextId, "tasks.task.update");
    const item = await updateChecklistItem(
      apiDatabase,
      workspaceId,
      taskId,
      itemId,
      {
        label: body.label === undefined ? undefined : requireString(body.label, "label"),
        isDone: body.isDone === undefined ? undefined : typeof body.isDone === "boolean" ? body.isDone : (() => { throw new BadRequestException("isDone must be boolean"); })(),
        position: optionalInteger(body.position, "position") ?? undefined,
      },
      { actorUserId: user.id },
    );
    if (!item) throw new NotFoundException();
    return item;
  }

  @Delete(":taskId/checklist/:itemId")
  async archiveChecklist(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string, @Param("itemId") itemId: string) {
    const user = await this.requireUser(request);
    const task = await getTask(apiDatabase, workspaceId, taskId);
    if (!task) throw new NotFoundException();
    await this.requirePermission(workspaceId, user.id, task.contextId, "tasks.task.update");
    const item = await archiveChecklistItem(apiDatabase, workspaceId, taskId, itemId, { actorUserId: user.id });
    if (!item) throw new NotFoundException();
    return item;
  }
}
