import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { getAuthSession } from "@utilitaire/auth";
import {
  createProject,
  createScope,
  createWorkspaceForUser,
  getProject,
  getScope,
  InvalidParentContextError,
  listProjects,
  listScopes,
} from "@utilitaire/core";
import { hasPermission } from "@utilitaire/permissions";
import type { Request } from "express";

import { apiDatabase } from "./database.js";

interface CreateWorkspaceBody {
  name?: unknown;
  personDisplayName?: unknown;
}

interface CreateContextEntityBody {
  name?: unknown;
  parentContextId?: unknown;
}

function requireName(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${label} name is required`);
  }

  return value.trim();
}

function requireParentContextId(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException("parentContextId is required");
  }

  return value.trim();
}

@Controller("api/workspaces")
export class WorkspacesController {
  @Post()
  async createWorkspace(@Req() request: Request, @Body() body: CreateWorkspaceBody) {
    const session = await getAuthSession(request.headers);

    if (!session) {
      throw new UnauthorizedException();
    }

    const workspaceName = requireName(body.name, "Workspace");
    const personDisplayName =
      typeof body.personDisplayName === "string" && body.personDisplayName.trim().length > 0
        ? body.personDisplayName.trim()
        : session.user.name;

    return createWorkspaceForUser(apiDatabase, {
      userId: session.user.id,
      workspaceName,
      personDisplayName,
    });
  }

  @Post(":workspaceId/scopes")
  async createScope(
    @Req() request: Request,
    @Param("workspaceId") workspaceId: string,
    @Body() body: CreateContextEntityBody,
  ) {
    const session = await getAuthSession(request.headers);

    if (!session) {
      throw new UnauthorizedException();
    }

    const name = requireName(body.name, "Scope");
    const parentContextId = requireParentContextId(body.parentContextId);

    const allowed = await hasPermission(apiDatabase, {
      workspaceId,
      userId: session.user.id,
      contextId: parentContextId,
      permissionKey: "core.scope.create",
    });

    if (!allowed) {
      throw new ForbiddenException();
    }

    try {
      return await createScope(apiDatabase, { workspaceId, parentContextId, name });
    } catch (error) {
      if (error instanceof InvalidParentContextError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get(":workspaceId/scopes")
  async listScopes(@Req() request: Request, @Param("workspaceId") workspaceId: string) {
    const session = await getAuthSession(request.headers);

    if (!session) {
      throw new UnauthorizedException();
    }

    const scopeRows = await listScopes(apiDatabase, workspaceId);
    const readable = await Promise.all(
      scopeRows.map(async (scope) => ({
        scope,
        allowed: await hasPermission(apiDatabase, {
          workspaceId,
          userId: session.user.id,
          contextId: scope.contextId,
          permissionKey: "core.scope.read",
        }),
      })),
    );

    return readable.filter((entry) => entry.allowed).map((entry) => entry.scope);
  }

  @Get(":workspaceId/scopes/:scopeId")
  async getScope(
    @Req() request: Request,
    @Param("workspaceId") workspaceId: string,
    @Param("scopeId") scopeId: string,
  ) {
    const session = await getAuthSession(request.headers);

    if (!session) {
      throw new UnauthorizedException();
    }

    const scope = await getScope(apiDatabase, workspaceId, scopeId);

    if (!scope) {
      throw new NotFoundException();
    }

    const allowed = await hasPermission(apiDatabase, {
      workspaceId,
      userId: session.user.id,
      contextId: scope.contextId,
      permissionKey: "core.scope.read",
    });

    if (!allowed) {
      throw new ForbiddenException();
    }

    return scope;
  }

  @Post(":workspaceId/projects")
  async createProject(
    @Req() request: Request,
    @Param("workspaceId") workspaceId: string,
    @Body() body: CreateContextEntityBody,
  ) {
    const session = await getAuthSession(request.headers);

    if (!session) {
      throw new UnauthorizedException();
    }

    const name = requireName(body.name, "Project");
    const parentContextId = requireParentContextId(body.parentContextId);

    const allowed = await hasPermission(apiDatabase, {
      workspaceId,
      userId: session.user.id,
      contextId: parentContextId,
      permissionKey: "core.project.create",
    });

    if (!allowed) {
      throw new ForbiddenException();
    }

    try {
      return await createProject(apiDatabase, { workspaceId, parentContextId, name });
    } catch (error) {
      if (error instanceof InvalidParentContextError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get(":workspaceId/projects")
  async listProjects(@Req() request: Request, @Param("workspaceId") workspaceId: string) {
    const session = await getAuthSession(request.headers);

    if (!session) {
      throw new UnauthorizedException();
    }

    const projectRows = await listProjects(apiDatabase, workspaceId);
    const readable = await Promise.all(
      projectRows.map(async (project) => ({
        project,
        allowed: await hasPermission(apiDatabase, {
          workspaceId,
          userId: session.user.id,
          contextId: project.contextId,
          permissionKey: "core.project.read",
        }),
      })),
    );

    return readable.filter((entry) => entry.allowed).map((entry) => entry.project);
  }

  @Get(":workspaceId/projects/:projectId")
  async getProject(
    @Req() request: Request,
    @Param("workspaceId") workspaceId: string,
    @Param("projectId") projectId: string,
  ) {
    const session = await getAuthSession(request.headers);

    if (!session) {
      throw new UnauthorizedException();
    }

    const project = await getProject(apiDatabase, workspaceId, projectId);

    if (!project) {
      throw new NotFoundException();
    }

    const allowed = await hasPermission(apiDatabase, {
      workspaceId,
      userId: session.user.id,
      contextId: project.contextId,
      permissionKey: "core.project.read",
    });

    if (!allowed) {
      throw new ForbiddenException();
    }

    return project;
  }
}
