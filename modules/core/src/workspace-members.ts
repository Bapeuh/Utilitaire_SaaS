import {
  createDatabase,
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
