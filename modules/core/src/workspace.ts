import {
  contexts,
  createDatabase,
  objects,
  persons,
  workspaceUsers,
  workspaces,
} from "@utilitaire/database";

export interface CreateWorkspaceInput {
  userId: string;
  workspaceName: string;
  personDisplayName: string;
}

export interface CreatedWorkspace {
  workspaceId: string;
  rootContextId: string;
  membershipId: string;
  personObjectId: string;
  personId: string;
}

type Database = ReturnType<typeof createDatabase>["db"];

export async function createWorkspaceForUser(
  db: Database,
  input: CreateWorkspaceInput,
): Promise<CreatedWorkspace> {
  return db.transaction(async (tx) => {
    const [workspace] = await tx
      .insert(workspaces)
      .values({ name: input.workspaceName })
      .returning({ id: workspaces.id });

    if (!workspace) {
      throw new Error("Workspace creation failed");
    }

    const [rootContext] = await tx
      .insert(contexts)
      .values({
        workspaceId: workspace.id,
        type: "workspace",
        parentContextId: null,
      })
      .returning({ id: contexts.id });

    if (!rootContext) {
      throw new Error("Workspace root Context creation failed");
    }

    const [membership] = await tx
      .insert(workspaceUsers)
      .values({
        workspaceId: workspace.id,
        userId: input.userId,
        role: "administrator",
      })
      .returning({ id: workspaceUsers.id });

    if (!membership) {
      throw new Error("Workspace membership creation failed");
    }

    const [personObject] = await tx
      .insert(objects)
      .values({
        workspaceId: workspace.id,
        contextId: rootContext.id,
        moduleKey: "core",
        objectType: "person",
      })
      .returning({ id: objects.id });

    if (!personObject) {
      throw new Error("Person registry Object creation failed");
    }

    const [person] = await tx
      .insert(persons)
      .values({
        workspaceId: workspace.id,
        objectId: personObject.id,
        userId: input.userId,
        displayName: input.personDisplayName,
      })
      .returning({ id: persons.id });

    if (!person) {
      throw new Error("Person creation failed");
    }

    return {
      workspaceId: workspace.id,
      rootContextId: rootContext.id,
      membershipId: membership.id,
      personObjectId: personObject.id,
      personId: person.id,
    };
  });
}
