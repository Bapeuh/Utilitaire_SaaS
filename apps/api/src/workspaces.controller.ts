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
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { getAuthSession } from "@utilitaire/auth";
import {
  addTeamMember,
  addWorkspaceMemberByEmail,
  createJobRole,
  createOrganization,
  createProject,
  createScope,
  createTeam,
  createWorkspaceForUser,
  disableWorkspaceModule,
  enableWorkspaceModule,
  ensureCorePermissionsForWorkspace,
  getProject,
  getScope,
  getWorkspaceRootContextId,
  InvalidParentContextError,
  LastWorkspaceAdministratorError,
  listJobRoles,
  listOrganizations,
  listPersons,
  listProjects,
  listScopes,
  listTeamMembers,
  listTeams,
  listWorkspaceMembers,
  listWorkspaceModules,
  listWorkspacesForUser,
  removeTeamMember,
  updateWorkspaceMemberRole,
  WorkspaceMemberUserNotFoundError,
  type WorkspaceSystemRole,
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

interface NamedEntityBody {
  name?: unknown;
}

interface TeamMemberBody {
  personId?: unknown;
}

interface EnableModuleBody {
  installedVersion?: unknown;
}

interface WorkspaceMemberRoleBody {
  role?: unknown;
}

interface AddWorkspaceMemberBody {
  email?: unknown;
  role?: unknown;
}

const capabilityKeys = [
  "core.scope.create",
  "core.project.create",
  "core.organization.create",
  "core.team.create",
  "core.team.manage",
  "core.job_role.create",
  "core.module.manage",
  "core.workspace_member.read",
  "core.workspace_member.manage",
] as const;

function requireName(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${label} name is required`);
  }
  return value.trim();
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${label} is required`);
  }
  return value.trim();
}

function requireParentContextId(value: unknown): string {
  return requireString(value, "parentContextId");
}

function requireWorkspaceRole(value: unknown): WorkspaceSystemRole {
  if (value === "administrator" || value === "manager" || value === "member" || value === "guest") return value;
  throw new BadRequestException("role must be administrator, manager, member or guest");
}

@Controller("api/workspaces")
export class WorkspacesController {
  private async requireUser(request: Request) {
    const session = await getAuthSession(request.headers);
    if (!session) throw new UnauthorizedException();
    return session.user;
  }

  private async requireRootPermission(workspaceId: string, userId: string, permissionKey: string) {
    let rootContextId: string;
    try {
      rootContextId = await getWorkspaceRootContextId(apiDatabase, workspaceId);
    } catch {
      throw new NotFoundException();
    }

    await ensureCorePermissionsForWorkspace(apiDatabase, workspaceId);
    const allowed = await hasPermission(apiDatabase, {
      workspaceId,
      userId,
      contextId: rootContextId,
      permissionKey,
    });
    if (!allowed) throw new ForbiddenException();
    return rootContextId;
  }

  @Get()
  async listWorkspaces(@Req() request: Request) {
    const user = await this.requireUser(request);
    return listWorkspacesForUser(apiDatabase, user.id);
  }

  @Post()
  async createWorkspace(@Req() request: Request, @Body() body: CreateWorkspaceBody) {
    const user = await this.requireUser(request);
    const workspaceName = requireName(body.name, "Workspace");
    const personDisplayName =
      typeof body.personDisplayName === "string" && body.personDisplayName.trim().length > 0
        ? body.personDisplayName.trim()
        : user.name;

    return createWorkspaceForUser(apiDatabase, {
      userId: user.id,
      workspaceName,
      personDisplayName,
    });
  }

  @Get(":workspaceId/capabilities")
  async capabilities(@Req() request: Request, @Param("workspaceId") workspaceId: string) {
    const user = await this.requireUser(request);
    const rootContextId = await getWorkspaceRootContextId(apiDatabase, workspaceId).catch(() => null);
    if (!rootContextId) throw new NotFoundException();
    await ensureCorePermissionsForWorkspace(apiDatabase, workspaceId);

    const entries = await Promise.all(
      capabilityKeys.map(async (permissionKey) => [
        permissionKey,
        await hasPermission(apiDatabase, { workspaceId, userId: user.id, contextId: rootContextId, permissionKey }),
      ] as const),
    );
    return Object.fromEntries(entries);
  }

  @Post(":workspaceId/scopes")
  async createScope(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Body() body: CreateContextEntityBody) {
    const user = await this.requireUser(request);
    const name = requireName(body.name, "Scope");
    const parentContextId = requireParentContextId(body.parentContextId);
    await ensureCorePermissionsForWorkspace(apiDatabase, workspaceId);
    const allowed = await hasPermission(apiDatabase, {
      workspaceId,
      userId: user.id,
      contextId: parentContextId,
      permissionKey: "core.scope.create",
    });
    if (!allowed) throw new ForbiddenException();

    try {
      return await createScope(apiDatabase, { workspaceId, parentContextId, name });
    } catch (error) {
      if (error instanceof InvalidParentContextError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Get(":workspaceId/scopes")
  async listScopes(@Req() request: Request, @Param("workspaceId") workspaceId: string) {
    const user = await this.requireUser(request);
    await ensureCorePermissionsForWorkspace(apiDatabase, workspaceId);
    const scopeRows = await listScopes(apiDatabase, workspaceId);
    const readable = await Promise.all(
      scopeRows.map(async (scope) => ({
        scope,
        allowed: await hasPermission(apiDatabase, {
          workspaceId,
          userId: user.id,
          contextId: scope.contextId,
          permissionKey: "core.scope.read",
        }),
      })),
    );
    return readable.filter((entry) => entry.allowed).map((entry) => entry.scope);
  }

  @Get(":workspaceId/scopes/:scopeId")
  async getScope(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("scopeId") scopeId: string) {
    const user = await this.requireUser(request);
    await ensureCorePermissionsForWorkspace(apiDatabase, workspaceId);
    const scope = await getScope(apiDatabase, workspaceId, scopeId);
    if (!scope) throw new NotFoundException();
    const allowed = await hasPermission(apiDatabase, {
      workspaceId,
      userId: user.id,
      contextId: scope.contextId,
      permissionKey: "core.scope.read",
    });
    if (!allowed) throw new ForbiddenException();
    return scope;
  }

  @Post(":workspaceId/projects")
  async createProject(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Body() body: CreateContextEntityBody) {
    const user = await this.requireUser(request);
    const name = requireName(body.name, "Project");
    const parentContextId = requireParentContextId(body.parentContextId);
    await ensureCorePermissionsForWorkspace(apiDatabase, workspaceId);
    const allowed = await hasPermission(apiDatabase, {
      workspaceId,
      userId: user.id,
      contextId: parentContextId,
      permissionKey: "core.project.create",
    });
    if (!allowed) throw new ForbiddenException();

    try {
      return await createProject(apiDatabase, { workspaceId, parentContextId, name });
    } catch (error) {
      if (error instanceof InvalidParentContextError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Get(":workspaceId/projects")
  async listProjects(@Req() request: Request, @Param("workspaceId") workspaceId: string) {
    const user = await this.requireUser(request);
    await ensureCorePermissionsForWorkspace(apiDatabase, workspaceId);
    const projectRows = await listProjects(apiDatabase, workspaceId);
    const readable = await Promise.all(
      projectRows.map(async (project) => ({
        project,
        allowed: await hasPermission(apiDatabase, {
          workspaceId,
          userId: user.id,
          contextId: project.contextId,
          permissionKey: "core.project.read",
        }),
      })),
    );
    return readable.filter((entry) => entry.allowed).map((entry) => entry.project);
  }

  @Get(":workspaceId/projects/:projectId")
  async getProject(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("projectId") projectId: string) {
    const user = await this.requireUser(request);
    await ensureCorePermissionsForWorkspace(apiDatabase, workspaceId);
    const project = await getProject(apiDatabase, workspaceId, projectId);
    if (!project) throw new NotFoundException();
    const allowed = await hasPermission(apiDatabase, {
      workspaceId,
      userId: user.id,
      contextId: project.contextId,
      permissionKey: "core.project.read",
    });
    if (!allowed) throw new ForbiddenException();
    return project;
  }

  @Get(":workspaceId/persons")
  async listPersons(@Req() request: Request, @Param("workspaceId") workspaceId: string) {
    const user = await this.requireUser(request);
    await this.requireRootPermission(workspaceId, user.id, "core.team.read");
    return listPersons(apiDatabase, workspaceId);
  }

  @Get(":workspaceId/members")
  async listMembers(@Req() request: Request, @Param("workspaceId") workspaceId: string) {
    const user = await this.requireUser(request);
    await this.requireRootPermission(workspaceId, user.id, "core.workspace_member.read");
    return listWorkspaceMembers(apiDatabase, workspaceId);
  }

  @Post(":workspaceId/members")
  async addMember(
    @Req() request: Request,
    @Param("workspaceId") workspaceId: string,
    @Body() body: AddWorkspaceMemberBody,
  ) {
    const user = await this.requireUser(request);
    await this.requireRootPermission(workspaceId, user.id, "core.workspace_member.manage");
    try {
      return await addWorkspaceMemberByEmail(
        apiDatabase,
        workspaceId,
        requireString(body.email, "email").toLowerCase(),
        requireWorkspaceRole(body.role),
      );
    } catch (error) {
      if (error instanceof WorkspaceMemberUserNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch(":workspaceId/members/:userId/role")
  async updateMemberRole(
    @Req() request: Request,
    @Param("workspaceId") workspaceId: string,
    @Param("userId") targetUserId: string,
    @Body() body: WorkspaceMemberRoleBody,
  ) {
    const user = await this.requireUser(request);
    await this.requireRootPermission(workspaceId, user.id, "core.workspace_member.manage");
    try {
      const updated = await updateWorkspaceMemberRole(apiDatabase, workspaceId, targetUserId, requireWorkspaceRole(body.role));
      if (!updated) throw new NotFoundException();
      return updated;
    } catch (error) {
      if (error instanceof LastWorkspaceAdministratorError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Post(":workspaceId/organizations")
  async createOrganization(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Body() body: NamedEntityBody) {
    const user = await this.requireUser(request);
    await this.requireRootPermission(workspaceId, user.id, "core.organization.create");
    return createOrganization(apiDatabase, workspaceId, requireName(body.name, "Organization"));
  }

  @Get(":workspaceId/organizations")
  async listOrganizations(@Req() request: Request, @Param("workspaceId") workspaceId: string) {
    const user = await this.requireUser(request);
    await this.requireRootPermission(workspaceId, user.id, "core.organization.read");
    return listOrganizations(apiDatabase, workspaceId);
  }

  @Post(":workspaceId/teams")
  async createTeam(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Body() body: NamedEntityBody) {
    const user = await this.requireUser(request);
    await this.requireRootPermission(workspaceId, user.id, "core.team.create");
    return createTeam(apiDatabase, workspaceId, requireName(body.name, "Team"));
  }

  @Get(":workspaceId/teams")
  async listTeams(@Req() request: Request, @Param("workspaceId") workspaceId: string) {
    const user = await this.requireUser(request);
    await this.requireRootPermission(workspaceId, user.id, "core.team.read");
    return listTeams(apiDatabase, workspaceId);
  }

  @Post(":workspaceId/teams/:teamId/members")
  async addTeamMember(
    @Req() request: Request,
    @Param("workspaceId") workspaceId: string,
    @Param("teamId") teamId: string,
    @Body() body: TeamMemberBody,
  ) {
    const user = await this.requireUser(request);
    await this.requireRootPermission(workspaceId, user.id, "core.team.manage");
    return addTeamMember(apiDatabase, workspaceId, teamId, requireString(body.personId, "personId"));
  }

  @Get(":workspaceId/teams/:teamId/members")
  async listTeamMembers(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("teamId") teamId: string) {
    const user = await this.requireUser(request);
    await this.requireRootPermission(workspaceId, user.id, "core.team.read");
    return listTeamMembers(apiDatabase, workspaceId, teamId);
  }

  @Delete(":workspaceId/teams/:teamId/members/:personId")
  async removeTeamMember(
    @Req() request: Request,
    @Param("workspaceId") workspaceId: string,
    @Param("teamId") teamId: string,
    @Param("personId") personId: string,
  ) {
    const user = await this.requireUser(request);
    await this.requireRootPermission(workspaceId, user.id, "core.team.manage");
    const removed = await removeTeamMember(apiDatabase, workspaceId, teamId, personId);
    if (!removed) throw new NotFoundException();
    return removed;
  }

  @Post(":workspaceId/job-roles")
  async createJobRole(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Body() body: NamedEntityBody) {
    const user = await this.requireUser(request);
    await this.requireRootPermission(workspaceId, user.id, "core.job_role.create");
    return createJobRole(apiDatabase, workspaceId, requireName(body.name, "Job role"));
  }

  @Get(":workspaceId/job-roles")
  async listJobRoles(@Req() request: Request, @Param("workspaceId") workspaceId: string) {
    const user = await this.requireUser(request);
    await this.requireRootPermission(workspaceId, user.id, "core.job_role.read");
    return listJobRoles(apiDatabase, workspaceId);
  }

  @Get(":workspaceId/modules")
  async listModules(@Req() request: Request, @Param("workspaceId") workspaceId: string) {
    const user = await this.requireUser(request);
    await this.requireRootPermission(workspaceId, user.id, "core.module.read");
    return listWorkspaceModules(apiDatabase, workspaceId);
  }

  @Post(":workspaceId/modules/:moduleKey/enable")
  async enableModule(
    @Req() request: Request,
    @Param("workspaceId") workspaceId: string,
    @Param("moduleKey") moduleKey: string,
    @Body() body: EnableModuleBody,
  ) {
    const user = await this.requireUser(request);
    await this.requireRootPermission(workspaceId, user.id, "core.module.manage");
    const installedVersion = typeof body.installedVersion === "string" ? body.installedVersion.trim() || undefined : undefined;
    return enableWorkspaceModule(apiDatabase, workspaceId, requireString(moduleKey, "moduleKey"), installedVersion);
  }

  @Post(":workspaceId/modules/:moduleKey/disable")
  async disableModule(@Req() request: Request, @Param("workspaceId") workspaceId: string, @Param("moduleKey") moduleKey: string) {
    const user = await this.requireUser(request);
    await this.requireRootPermission(workspaceId, user.id, "core.module.manage");
    const updated = await disableWorkspaceModule(apiDatabase, workspaceId, requireString(moduleKey, "moduleKey"));
    if (!updated) throw new NotFoundException();
    return updated;
  }
}
