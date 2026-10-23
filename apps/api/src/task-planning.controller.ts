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
  addTaskDependency,
  archiveMilestone,
  archivePhase,
  createMilestone,
  createPhase,
  ensureTaskPermissionsForWorkspace,
  getMilestone,
  getPhase,
  getTask,
  InvalidMilestoneError,
  InvalidPhaseError,
  InvalidPlanningContextError,
  InvalidPlanningDatesError,
  InvalidPlanningPositionError,
  InvalidTaskDependencyError,
  linkTaskMilestone,
  listMilestones,
  listPhases,
  listTaskDependencies,
  listTaskMilestones,
  milestoneStatuses,
  removeTaskDependency,
  TaskDependencyCycleError,
  taskDependencyTypes,
  unlinkTaskMilestone,
  updateMilestone,
  updatePhase,
  type MilestoneStatus,
  type TaskDependencyType,
  type TaskPermissionKey,
} from "@utilitaire/tasks";
import type { Request } from "express";

import { apiDatabase } from "./database.js";

interface PhaseCreateBody {
  contextId?: unknown;
  name?: unknown;
  description?: unknown;
  position?: unknown;
  startAt?: unknown;
  dueAt?: unknown;
}

interface PhaseUpdateBody extends Omit<PhaseCreateBody, "contextId"> {}

interface MilestoneCreateBody {
  contextId?: unknown;
  name?: unknown;
  description?: unknown;
  dueAt?: unknown;
  status?: unknown;
  position?: unknown;
}

interface MilestoneUpdateBody extends Omit<MilestoneCreateBody, "contextId"> {}
interface MilestoneLinkBody { milestoneId?: unknown }
interface DependencyCreateBody { predecessorTaskId?: unknown; successorTaskId?: unknown; dependencyType?: unknown }

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

function parseDate(value: unknown, label: string) {
  if (typeof value !== "string") throw new BadRequestException(`${label} must be an ISO date string`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${label} is invalid`);
  return date;
}

function optionalDate(value: unknown, label: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return parseDate(value, label);
}

function optionalInteger(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) throw new BadRequestException(`${label} must be an integer`);
  return value;
}

function optionalMilestoneStatus(value: unknown): MilestoneStatus | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && (milestoneStatuses as readonly string[]).includes(value)) return value as MilestoneStatus;
  throw new BadRequestException(`status must be one of: ${milestoneStatuses.join(", ")}`);
}

function optionalDependencyType(value: unknown): TaskDependencyType | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && (taskDependencyTypes as readonly string[]).includes(value)) return value as TaskDependencyType;
  throw new BadRequestException(`dependencyType must be one of: ${taskDependencyTypes.join(", ")}`);
}

function mapPlanningError(error: unknown): never {
  if (
    error instanceof InvalidPlanningContextError ||
    error instanceof InvalidPhaseError ||
    error instanceof InvalidMilestoneError ||
    error instanceof InvalidPlanningDatesError ||
    error instanceof InvalidPlanningPositionError ||
    error instanceof InvalidTaskDependencyError ||
    error instanceof TaskDependencyCycleError
  ) {
    throw new BadRequestException(error.message);
  }
  throw error;
}

async function requireUser(request: Request) {
  const session = await getAuthSession(request.headers);
  if (!session) throw new UnauthorizedException();
  return session.user;
}

async function requireWorkspaceMembership(workspaceId: string, userId: string) {
  if (!(await isActiveWorkspaceMember(apiDatabase, workspaceId, userId))) throw new NotFoundException();
}

async function can(workspaceId: string, userId: string, contextId: string, permissionKey: TaskPermissionKey) {
  await ensureTaskPermissionsForWorkspace(apiDatabase, workspaceId);
  return hasPermission(apiDatabase, { workspaceId, userId, contextId, permissionKey });
}

async function requirePermission(workspaceId: string, userId: string, contextId: string, permissionKey: TaskPermissionKey) {
  await requireWorkspaceMembership(workspaceId, userId);
  if (!(await can(workspaceId, userId, contextId, permissionKey))) throw new ForbiddenException();
}

@Controller("api/workspaces/:workspaceId/task-phases")
export class TaskPhasesController {
  @Get()
  async list(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Query("contextId") contextId?: string) {
    const user = await requireUser(request);
    await requireWorkspaceMembership(workspaceId, user.id);
    const rows = await listPhases(apiDatabase, workspaceId, contextId);
    const readable = await Promise.all(rows.map(async (phase) => ({
      phase,
      allowed: await can(workspaceId, user.id, phase.contextId, "tasks.phase.read"),
    })));
    return readable.filter((row) => row.allowed).map((row) => row.phase);
  }

  @Post()
  async create(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Body() body: PhaseCreateBody) {
    const user = await requireUser(request);
    const contextId = requireString(body.contextId, "contextId");
    await requirePermission(workspaceId, user.id, contextId, "tasks.phase.create");
    try {
      return await createPhase(apiDatabase, {
        workspaceId,
        contextId,
        name: requireString(body.name, "name"),
        description: optionalString(body.description, "description"),
        position: optionalInteger(body.position, "position"),
        startAt: optionalDate(body.startAt, "startAt"),
        dueAt: optionalDate(body.dueAt, "dueAt"),
      }, { actorUserId: user.id });
    } catch (error) {
      mapPlanningError(error);
    }
  }

  @Get(":phaseId")
  async get(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("phaseId") phaseId: string) {
    const user = await requireUser(request);
    await requireWorkspaceMembership(workspaceId, user.id);
    const phase = await getPhase(apiDatabase, workspaceId, phaseId);
    if (!phase) throw new NotFoundException();
    await requirePermission(workspaceId, user.id, phase.contextId, "tasks.phase.read");
    return phase;
  }

  @Patch(":phaseId")
  async update(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("phaseId") phaseId: string, @Body() body: PhaseUpdateBody) {
    const user = await requireUser(request);
    await requireWorkspaceMembership(workspaceId, user.id);
    const current = await getPhase(apiDatabase, workspaceId, phaseId);
    if (!current) throw new NotFoundException();
    await requirePermission(workspaceId, user.id, current.contextId, "tasks.phase.update");
    try {
      const updated = await updatePhase(apiDatabase, workspaceId, phaseId, {
        name: body.name === undefined ? undefined : requireString(body.name, "name"),
        description: optionalString(body.description, "description"),
        position: optionalInteger(body.position, "position"),
        startAt: optionalDate(body.startAt, "startAt"),
        dueAt: optionalDate(body.dueAt, "dueAt"),
      }, { actorUserId: user.id });
      if (!updated) throw new NotFoundException();
      return updated;
    } catch (error) {
      mapPlanningError(error);
    }
  }

  @Post(":phaseId/archive")
  async archive(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("phaseId") phaseId: string) {
    const user = await requireUser(request);
    await requireWorkspaceMembership(workspaceId, user.id);
    const current = await getPhase(apiDatabase, workspaceId, phaseId);
    if (!current) throw new NotFoundException();
    await requirePermission(workspaceId, user.id, current.contextId, "tasks.phase.archive");
    const archived = await archivePhase(apiDatabase, workspaceId, phaseId, { actorUserId: user.id });
    if (!archived) throw new NotFoundException();
    return archived;
  }
}

@Controller("api/workspaces/:workspaceId/task-milestones")
export class TaskMilestonesController {
  @Get()
  async list(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Query("contextId") contextId?: string) {
    const user = await requireUser(request);
    await requireWorkspaceMembership(workspaceId, user.id);
    const rows = await listMilestones(apiDatabase, workspaceId, contextId);
    const readable = await Promise.all(rows.map(async (milestone) => ({
      milestone,
      allowed: await can(workspaceId, user.id, milestone.contextId, "tasks.milestone.read"),
    })));
    return readable.filter((row) => row.allowed).map((row) => row.milestone);
  }

  @Post()
  async create(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Body() body: MilestoneCreateBody) {
    const user = await requireUser(request);
    const contextId = requireString(body.contextId, "contextId");
    await requirePermission(workspaceId, user.id, contextId, "tasks.milestone.create");
    try {
      return await createMilestone(apiDatabase, {
        workspaceId,
        contextId,
        name: requireString(body.name, "name"),
        description: optionalString(body.description, "description"),
        dueAt: parseDate(body.dueAt, "dueAt"),
        status: optionalMilestoneStatus(body.status),
        position: optionalInteger(body.position, "position"),
      }, { actorUserId: user.id });
    } catch (error) {
      mapPlanningError(error);
    }
  }

  @Get(":milestoneId")
  async get(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("milestoneId") milestoneId: string) {
    const user = await requireUser(request);
    await requireWorkspaceMembership(workspaceId, user.id);
    const milestone = await getMilestone(apiDatabase, workspaceId, milestoneId);
    if (!milestone) throw new NotFoundException();
    await requirePermission(workspaceId, user.id, milestone.contextId, "tasks.milestone.read");
    return milestone;
  }

  @Patch(":milestoneId")
  async update(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("milestoneId") milestoneId: string, @Body() body: MilestoneUpdateBody) {
    const user = await requireUser(request);
    await requireWorkspaceMembership(workspaceId, user.id);
    const current = await getMilestone(apiDatabase, workspaceId, milestoneId);
    if (!current) throw new NotFoundException();
    await requirePermission(workspaceId, user.id, current.contextId, "tasks.milestone.update");
    try {
      const updated = await updateMilestone(apiDatabase, workspaceId, milestoneId, {
        name: body.name === undefined ? undefined : requireString(body.name, "name"),
        description: optionalString(body.description, "description"),
        dueAt: body.dueAt === undefined ? undefined : parseDate(body.dueAt, "dueAt"),
        status: optionalMilestoneStatus(body.status),
        position: optionalInteger(body.position, "position"),
      }, { actorUserId: user.id });
      if (!updated) throw new NotFoundException();
      return updated;
    } catch (error) {
      mapPlanningError(error);
    }
  }

  @Post(":milestoneId/archive")
  async archive(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("milestoneId") milestoneId: string) {
    const user = await requireUser(request);
    await requireWorkspaceMembership(workspaceId, user.id);
    const current = await getMilestone(apiDatabase, workspaceId, milestoneId);
    if (!current) throw new NotFoundException();
    await requirePermission(workspaceId, user.id, current.contextId, "tasks.milestone.archive");
    const archived = await archiveMilestone(apiDatabase, workspaceId, milestoneId, { actorUserId: user.id });
    if (!archived) throw new NotFoundException();
    return archived;
  }
}

@Controller("api/workspaces/:workspaceId/tasks")
export class TaskPlanningController {
  @Get(":taskId/milestones")
  async listMilestones(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string) {
    const user = await requireUser(request);
    await requireWorkspaceMembership(workspaceId, user.id);
    const task = await getTask(apiDatabase, workspaceId, taskId);
    if (!task) throw new NotFoundException();
    await requirePermission(workspaceId, user.id, task.contextId, "tasks.task.read");
    return listTaskMilestones(apiDatabase, workspaceId, taskId);
  }

  @Post(":taskId/milestones")
  async linkMilestone(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string, @Body() body: MilestoneLinkBody) {
    const user = await requireUser(request);
    await requireWorkspaceMembership(workspaceId, user.id);
    const task = await getTask(apiDatabase, workspaceId, taskId);
    if (!task) throw new NotFoundException();
    await requirePermission(workspaceId, user.id, task.contextId, "tasks.task.update");
    const milestoneId = requireString(body.milestoneId, "milestoneId");
    const milestone = await getMilestone(apiDatabase, workspaceId, milestoneId);
    if (!milestone) throw new BadRequestException("Milestone is invalid for this Workspace");
    await requirePermission(workspaceId, user.id, milestone.contextId, "tasks.milestone.read");
    try {
      return await linkTaskMilestone(apiDatabase, workspaceId, taskId, milestoneId, { actorUserId: user.id });
    } catch (error) {
      mapPlanningError(error);
    }
  }

  @Delete(":taskId/milestones/:milestoneId")
  async unlinkMilestone(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string, @Param("milestoneId") milestoneId: string) {
    const user = await requireUser(request);
    await requireWorkspaceMembership(workspaceId, user.id);
    const task = await getTask(apiDatabase, workspaceId, taskId);
    if (!task) throw new NotFoundException();
    await requirePermission(workspaceId, user.id, task.contextId, "tasks.task.update");
    const unlinked = await unlinkTaskMilestone(apiDatabase, workspaceId, taskId, milestoneId, { actorUserId: user.id });
    if (!unlinked) throw new NotFoundException();
    return unlinked;
  }

  @Get(":taskId/dependencies")
  async dependencies(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string) {
    const user = await requireUser(request);
    await requireWorkspaceMembership(workspaceId, user.id);
    const task = await getTask(apiDatabase, workspaceId, taskId);
    if (!task) throw new NotFoundException();
    await requirePermission(workspaceId, user.id, task.contextId, "tasks.task.read");
    const dependencies = await listTaskDependencies(apiDatabase, workspaceId, taskId);

    return Promise.all(dependencies.map(async (dependency) => {
      const predecessor = await getTask(apiDatabase, workspaceId, dependency.predecessorTaskId);
      const successor = await getTask(apiDatabase, workspaceId, dependency.successorTaskId);

      const visibleEndpoint = async (endpoint: typeof predecessor) => {
        if (!endpoint) return { hidden: true } as const;
        if (!(await can(workspaceId, user.id, endpoint.contextId, "tasks.task.read"))) return { hidden: true } as const;
        return { hidden: false as const, id: endpoint.id, contextId: endpoint.contextId, title: endpoint.title };
      };

      return {
        id: dependency.id,
        dependencyType: dependency.dependencyType,
        predecessor: await visibleEndpoint(predecessor),
        successor: await visibleEndpoint(successor),
      };
    }));
  }

  @Post(":taskId/dependencies")
  async addDependency(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string, @Body() body: DependencyCreateBody) {
    const user = await requireUser(request);
    await requireWorkspaceMembership(workspaceId, user.id);
    const current = await getTask(apiDatabase, workspaceId, taskId);
    if (!current) throw new NotFoundException();

    const predecessorTaskId = body.predecessorTaskId === undefined ? taskId : requireString(body.predecessorTaskId, "predecessorTaskId");
    const successorTaskId = body.successorTaskId === undefined ? taskId : requireString(body.successorTaskId, "successorTaskId");
    if (predecessorTaskId !== taskId && successorTaskId !== taskId) {
      throw new BadRequestException("The dependency must include the task from the route");
    }

    const predecessor = await getTask(apiDatabase, workspaceId, predecessorTaskId);
    const successor = await getTask(apiDatabase, workspaceId, successorTaskId);
    if (!predecessor || !successor) throw new BadRequestException("Both Tasks must be active in this Workspace");

    for (const endpoint of [predecessor, successor]) {
      await requirePermission(workspaceId, user.id, endpoint.contextId, "tasks.task.read");
      await requirePermission(workspaceId, user.id, endpoint.contextId, "tasks.task.dependency_manage");
    }

    try {
      return await addTaskDependency(apiDatabase, {
        workspaceId,
        predecessorTaskId,
        successorTaskId,
        dependencyType: optionalDependencyType(body.dependencyType),
      }, { actorUserId: user.id });
    } catch (error) {
      mapPlanningError(error);
    }
  }

  @Delete(":taskId/dependencies/:dependencyId")
  async removeDependency(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("taskId") taskId: string, @Param("dependencyId") dependencyId: string) {
    const user = await requireUser(request);
    await requireWorkspaceMembership(workspaceId, user.id);
    const task = await getTask(apiDatabase, workspaceId, taskId);
    if (!task) throw new NotFoundException();
    const dependencies = await listTaskDependencies(apiDatabase, workspaceId, taskId);
    const dependency = dependencies.find((row) => row.id === dependencyId);
    if (!dependency) throw new NotFoundException();

    const predecessor = await getTask(apiDatabase, workspaceId, dependency.predecessorTaskId);
    const successor = await getTask(apiDatabase, workspaceId, dependency.successorTaskId);
    if (!predecessor || !successor) throw new NotFoundException();
    for (const endpoint of [predecessor, successor]) {
      await requirePermission(workspaceId, user.id, endpoint.contextId, "tasks.task.dependency_manage");
    }

    const removed = await removeTaskDependency(apiDatabase, workspaceId, dependencyId, { actorUserId: user.id });
    if (!removed) throw new NotFoundException();
    return removed;
  }
}
