import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { getAuthSession } from "@utilitaire/auth";
import { hasPermission } from "@utilitaire/permissions";
import type { Request } from "express";

import { apiDatabase } from "./database.js";

@Controller("api")
export class PrivateController {
  @Get("me")
  async getMe(@Req() request: Request) {
    const session = await getAuthSession(request.headers);

    if (!session) {
      throw new UnauthorizedException();
    }

    return { user: session.user, session: session.session };
  }

  @Get("workspaces/:workspaceId/contexts/:contextId/permissions/:permissionKey")
  async requirePermission(
    @Req() request: Request,
    @Param("workspaceId") workspaceId: string,
    @Param("contextId") contextId: string,
    @Param("permissionKey") permissionKey: string,
  ) {
    const session = await getAuthSession(request.headers);

    if (!session) {
      throw new UnauthorizedException();
    }

    const allowed = await hasPermission(apiDatabase, {
      workspaceId,
      userId: session.user.id,
      contextId,
      permissionKey,
    });

    if (!allowed) {
      throw new ForbiddenException();
    }

    return { authorized: true };
  }
}
