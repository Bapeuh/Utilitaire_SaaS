import {
  and,
  contexts,
  createDatabase,
  eq,
  isNull,
  objects,
  projects,
  scopes,
} from "@utilitaire/database";

type Database = ReturnType<typeof createDatabase>["db"];

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

async function requireParentContext(
  db: Database,
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
    await requireParentContext(tx as Database, input.workspaceId, input.parentContextId);

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
    await requireParentContext(tx as Database, input.workspaceId, input.parentContextId);

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
