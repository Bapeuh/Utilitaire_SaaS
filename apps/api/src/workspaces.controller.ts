import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
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
  InvalidParentContextError,
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
}
