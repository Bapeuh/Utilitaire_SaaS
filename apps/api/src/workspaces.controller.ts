import { BadRequestException, Body, Controller, Post, Req, UnauthorizedException } from "@nestjs/common";
import { getAuthSession } from "@utilitaire/auth";
import { createWorkspaceForUser } from "@utilitaire/core";
import type { Request } from "express";

import { apiDatabase } from "./database.js";

interface CreateWorkspaceBody {
  name?: unknown;
  personDisplayName?: unknown;
}

@Controller("api/workspaces")
export class WorkspacesController {
  @Post()
  async createWorkspace(@Req() request: Request, @Body() body: CreateWorkspaceBody) {
    const session = await getAuthSession(request.headers);

    if (!session) {
      throw new UnauthorizedException();
    }

    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      throw new BadRequestException("Workspace name is required");
    }

    const personDisplayName =
      typeof body.personDisplayName === "string" && body.personDisplayName.trim().length > 0
        ? body.personDisplayName.trim()
        : session.user.name;

    return createWorkspaceForUser(apiDatabase, {
      userId: session.user.id,
      workspaceName: body.name.trim(),
      personDisplayName,
    });
  }
}
