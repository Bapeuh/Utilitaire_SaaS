import {
  contexts,
  createDatabase,
  objects,
  projects,
  scopes,
} from "@utilitaire/database";
import { and, asc, eq, isNull } from "drizzle-orm";

type Database = ReturnType<typeof createDatabase>["db"];
type QueryExecutor = Pick<Database, "select">;

type ParentContextType = "workspace" | "scope";

export class InvalidParentContextError extends Error {
  constructor(message = "Invalid parent Context") {
    super(message);
    this.name = "InvalidParentContextError";
  }
}

interface CreateContextEntityInput {
  workspaceId: string;
  parentContextId: string;
  name: string;
}

export interface CreatedScope {
  scopeId: string;
  contextId: string;
  objectId: string;
}

export interface CreatedProject {
  projectId: string;
  contextId: string;
  objectId: string;
}

export interface ScopeSummary {
  scopeId: string;
  contextId: string;
  objectId: string;
  parentContextId: string | null;
  name: string;
  createdAt: Date;
}

export interface ProjectSummary {
  projectId: string;
  contextId: string;
  objectId: string;
  parentContextId: string | null;
  name: string;
  createdAt: Date;
}

async function requireParentContext(
  db: QueryExecutor,
  workspaceId: string,
  parentContextId: string,
): Promise<{ id: string; type: ParentContextType }> {
  const [parent] = await db
    .select({ id: contexts.id, type: contexts.type })
    .from(contexts)
    .where(
      and(
        eq(contexts.workspaceId, workspaceId),
        eq(contexts.id, parentContextId),
        isNull(contexts.archivedAt),
      ),
    )
    .limit(1);

  if (!parent || (parent.type !== "workspace" && parent.type !== "scope")) {
    throw new InvalidParentContextError();
  }

  return { id: parent.id, type: parent.type };
}

export async function createScope(
  db: Database,
  input: CreateContextEntityInput,
): Promise<CreatedScope> {
  return db.transaction(async (tx) => {
    await requireParentContext(tx, input.workspaceId, input.parentContextId);

    const [context] = await tx
      .insert(contexts)
      .values({
        workspaceId: input.workspaceId,
        type: "scope",
        parentContextId: input.parentContextId,
      })
      .returning({ id: contexts.id });

    if (!context) {
      throw new Error("Scope Context creation failed");
    }

    const [object] = await tx
      .insert(objects)
      .values({
        workspaceId: input.workspaceId,
        contextId: context.id,
        moduleKey: "core",
        objectType: "scope",
      })
      .returning({ id: objects.id });

    if (!object) {
      throw new Error("Scope Object creation failed");
    }

    const [scope] = await tx
      .insert(scopes)
      .values({
        workspaceId: input.workspaceId,
        contextId: context.id,
        objectId: object.id,
        name: input.name,
      })
      .returning({ id: scopes.id });

    if (!scope) {
      throw new Error("Scope creation failed");
    }

    return { scopeId: scope.id, contextId: context.id, objectId: object.id };
  });
}

export async function createProject(
  db: Database,
  input: CreateContextEntityInput,
): Promise<CreatedProject> {
  return db.transaction(async (tx) => {
    await requireParentContext(tx, input.workspaceId, input.parentContextId);

    const [context] = await tx
      .insert(contexts)
      .values({
        workspaceId: input.workspaceId,
        type: "project",
        parentContextId: input.parentContextId,
      })
      .returning({ id: contexts.id });

    if (!context) {
      throw new Error("Project Context creation failed");
    }

    const [object] = await tx
      .insert(objects)
      .values({
        workspaceId: input.workspaceId,
        contextId: context.id,
        moduleKey: "core",
        objectType: "project",
      })
      .returning({ id: objects.id });

    if (!object) {
      throw new Error("Project Object creation failed");
    }

    const [project] = await tx
      .insert(projects)
      .values({
        workspaceId: input.workspaceId,
        contextId: context.id,
        objectId: object.id,
        name: input.name,
      })
      .returning({ id: projects.id });

    if (!project) {
      throw new Error("Project creation failed");
    }

    return { projectId: project.id, contextId: context.id, objectId: object.id };
  });
}

export async function listScopes(db: Database, workspaceId: string): Promise<ScopeSummary[]> {
  return db
    .select({
      scopeId: scopes.id,
      contextId: scopes.contextId,
      objectId: scopes.objectId,
      parentContextId: contexts.parentContextId,
      name: scopes.name,
      createdAt: scopes.createdAt,
    })
    .from(scopes)
    .innerJoin(
      contexts,
      and(eq(contexts.workspaceId, scopes.workspaceId), eq(contexts.id, scopes.contextId)),
    )
    .where(
      and(
        eq(scopes.workspaceId, workspaceId),
        isNull(scopes.archivedAt),
        isNull(contexts.archivedAt),
      ),
    )
    .orderBy(asc(scopes.createdAt), asc(scopes.id));
}

export async function getScope(
  db: Database,
  workspaceId: string,
  scopeId: string,
): Promise<ScopeSummary | null> {
  const [scope] = await db
    .select({
      scopeId: scopes.id,
      contextId: scopes.contextId,
      objectId: scopes.objectId,
      parentContextId: contexts.parentContextId,
      name: scopes.name,
      createdAt: scopes.createdAt,
    })
    .from(scopes)
    .innerJoin(
      contexts,
      and(eq(contexts.workspaceId, scopes.workspaceId), eq(contexts.id, scopes.contextId)),
    )
    .where(
      and(
        eq(scopes.workspaceId, workspaceId),
        eq(scopes.id, scopeId),
        isNull(scopes.archivedAt),
        isNull(contexts.archivedAt),
      ),
    )
    .limit(1);

  return scope ?? null;
}

export async function listProjects(db: Database, workspaceId: string): Promise<ProjectSummary[]> {
  return db
    .select({
      projectId: projects.id,
      contextId: projects.contextId,
      objectId: projects.objectId,
      parentContextId: contexts.parentContextId,
      name: projects.name,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .innerJoin(
      contexts,
      and(eq(contexts.workspaceId, projects.workspaceId), eq(contexts.id, projects.contextId)),
    )
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        isNull(projects.archivedAt),
        isNull(contexts.archivedAt),
      ),
    )
    .orderBy(asc(projects.createdAt), asc(projects.id));
}

export async function getProject(
  db: Database,
  workspaceId: string,
  projectId: string,
): Promise<ProjectSummary | null> {
  const [project] = await db
    .select({
      projectId: projects.id,
      contextId: projects.contextId,
      objectId: projects.objectId,
      parentContextId: contexts.parentContextId,
      name: projects.name,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .innerJoin(
      contexts,
      and(eq(contexts.workspaceId, projects.workspaceId), eq(contexts.id, projects.contextId)),
    )
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.id, projectId),
        isNull(projects.archivedAt),
        isNull(contexts.archivedAt),
      ),
    )
    .limit(1);

  return project ?? null;
}
