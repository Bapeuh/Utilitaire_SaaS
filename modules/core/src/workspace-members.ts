import {
  contexts,
  createDatabase,
  objects,
  persons,
  users,
  workspaceUsers,
} from "@utilitaire/database";
import { and, asc, eq, isNull } from "drizzle-orm";

type Database = ReturnType<typeof createDatabase>["db"];

export type WorkspaceSystemRole = "administrator" | "manager" | "member" | "guest";

export class LastWorkspaceAdministratorError extends Error {
  constructor() {
    super("A workspace must keep at least one administrator");
    this.name = "LastWorkspaceAdministratorError";
  }
}

export class WorkspaceMemberUserNotFoundError extends Error {
  constructor() {
    super("No user account exists for this email");
    this.name = "WorkspaceMemberUserNotFoundError";
  }
}

export async function listWorkspaceMembers(db: Database, workspaceId: string) {
  return db
    .select({
      membershipId: workspaceUsers.id,
      userId: workspaceUsers.userId,
      role: workspaceUsers.role,
      name: users.name,
      email: users.email,
      personId: persons.id,
      personDisplayName: persons.displayName,
    })
    .from(workspaceUsers)
    .innerJoin(users, eq(users.id, workspaceUsers.userId))
    .leftJoin(
      persons,
      and(
        eq(persons.workspaceId, workspaceUsers.workspaceId),
        eq(persons.userId, workspaceUsers.userId),
        isNull(persons.archivedAt),
      ),
    )
    .where(and(eq(workspaceUsers.workspaceId, workspaceId), isNull(workspaceUsers.archivedAt)))
    .orderBy(asc(users.name), asc(users.email));
}

export async function addWorkspaceMemberByEmail(
  db: Database,
  workspaceId: string,
  email: string,
  role: WorkspaceSystemRole,
) {
  return db.transaction(async (tx) => {
    const normalizedEmail = email.trim().toLowerCase();
    const [user] = await tx
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!user) throw new WorkspaceMemberUserNotFoundError();

    const [existingMembership] = await tx
      .select()
      .from(workspaceUsers)
      .where(and(eq(workspaceUsers.workspaceId, workspaceId), eq(workspaceUsers.userId, user.id)))
      .limit(1);

    let membership = existingMembership;
    if (existingMembership) {
      if (existingMembership.archivedAt !== null) {
        const [reactivated] = await tx
          .update(workspaceUsers)
          .set({ role, archivedAt: null })
          .where(eq(workspaceUsers.id, existingMembership.id))
          .returning();
        if (!reactivated) throw new Error("Workspace membership reactivation failed");
        membership = reactivated;
      }
    } else {
      const [created] = await tx
        .insert(workspaceUsers)
        .values({ workspaceId, userId: user.id, role })
        .returning();
      if (!created) throw new Error("Workspace membership creation failed");
      membership = created;
    }

    const [existingPerson] = await tx
      .select()
      .from(persons)
      .where(and(eq(persons.workspaceId, workspaceId), eq(persons.userId, user.id)))
      .limit(1);

    let person = existingPerson;
    if (existingPerson) {
      if (existingPerson.archivedAt !== null) {
        const [reactivatedPerson] = await tx
          .update(persons)
          .set({ displayName: user.name, archivedAt: null })
          .where(eq(persons.id, existingPerson.id))
          .returning();
        if (!reactivatedPerson) throw new Error("Workspace Person reactivation failed");
        person = reactivatedPerson;
      }
    } else {
      const [rootContext] = await tx
        .select({ id: contexts.id })
        .from(contexts)
        .where(
          and(
            eq(contexts.workspaceId, workspaceId),
            eq(contexts.type, "workspace"),
            isNull(contexts.archivedAt),
          ),
        )
        .limit(1);
      if (!rootContext) throw new Error("Workspace root Context not found");

      const [personObject] = await tx
        .insert(objects)
        .values({ workspaceId, contextId: rootContext.id, moduleKey: "core", objectType: "person" })
        .returning({ id: objects.id });
      if (!personObject) throw new Error("Person registry Object creation failed");

      const [createdPerson] = await tx
        .insert(persons)
        .values({ workspaceId, objectId: personObject.id, userId: user.id, displayName: user.name })
        .returning();
      if (!createdPerson) throw new Error("Person creation failed");
      person = createdPerson;
    }

    if (!membership || !person) throw new Error("Workspace member creation failed");

    return {
      membershipId: membership.id,
      userId: user.id,
      role: membership.role,
      name: user.name,
      email: user.email,
      personId: person.id,
      personDisplayName: person.displayName,
    };
  });
}

export async function updateWorkspaceMemberRole(
  db: Database,
  workspaceId: string,
  userId: string,
  role: WorkspaceSystemRole,
) {
  return db.transaction(async (tx) => {
    const [membership] = await tx
      .select({ role: workspaceUsers.role })
      .from(workspaceUsers)
      .where(
        and(
          eq(workspaceUsers.workspaceId, workspaceId),
          eq(workspaceUsers.userId, userId),
          isNull(workspaceUsers.archivedAt),
        ),
      )
      .limit(1);

    if (!membership) return null;

    if (membership.role === "administrator" && role !== "administrator") {
      const administrators = await tx
        .select({ userId: workspaceUsers.userId })
        .from(workspaceUsers)
        .where(
          and(
            eq(workspaceUsers.workspaceId, workspaceId),
            eq(workspaceUsers.role, "administrator"),
            isNull(workspaceUsers.archivedAt),
          ),
        );

      if (administrators.length <= 1) throw new LastWorkspaceAdministratorError();
    }

    const [updated] = await tx
      .update(workspaceUsers)
      .set({ role })
      .where(
        and(
          eq(workspaceUsers.workspaceId, workspaceId),
          eq(workspaceUsers.userId, userId),
          isNull(workspaceUsers.archivedAt),
        ),
      )
      .returning();

    return updated ?? null;
  });
}
