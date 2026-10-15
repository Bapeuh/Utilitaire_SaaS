import {
  contexts,
  createDatabase,
  jobRoles,
  objects,
  organizations,
  persons,
  teamMembers,
  teams,
} from "@utilitaire/database";
import { and, asc, eq, isNull } from "drizzle-orm";

type Database = ReturnType<typeof createDatabase>["db"];
type QueryExecutor = Pick<Database, "select">;

async function requireWorkspaceRootContextId(db: QueryExecutor, workspaceId: string) {
  const [root] = await db
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

  if (!root) throw new Error("Workspace root Context not found");
  return root.id;
}

export async function getWorkspaceRootContextId(db: Database, workspaceId: string) {
  return requireWorkspaceRootContextId(db, workspaceId);
}

export async function listPersons(db: Database, workspaceId: string) {
  return db
    .select({
      id: persons.id,
      workspaceId: persons.workspaceId,
      objectId: persons.objectId,
      userId: persons.userId,
      displayName: persons.displayName,
      createdAt: persons.createdAt,
    })
    .from(persons)
    .where(and(eq(persons.workspaceId, workspaceId), isNull(persons.archivedAt)))
    .orderBy(asc(persons.displayName));
}

export async function createOrganization(db: Database, workspaceId: string, name: string) {
  return db.transaction(async (tx) => {
    const rootContextId = await requireWorkspaceRootContextId(tx, workspaceId);
    const [object] = await tx
      .insert(objects)
      .values({ workspaceId, contextId: rootContextId, moduleKey: "core", objectType: "organization" })
      .returning({ id: objects.id });
    if (!object) throw new Error("Organization Object creation failed");

    const [organization] = await tx
      .insert(organizations)
      .values({ workspaceId, objectId: object.id, name })
      .returning();
    if (!organization) throw new Error("Organization creation failed");
    return organization;
  });
}

export async function listOrganizations(db: Database, workspaceId: string) {
  return db
    .select()
    .from(organizations)
    .where(and(eq(organizations.workspaceId, workspaceId), isNull(organizations.archivedAt)))
    .orderBy(asc(organizations.name));
}

export async function createTeam(db: Database, workspaceId: string, name: string) {
  return db.transaction(async (tx) => {
    const rootContextId = await requireWorkspaceRootContextId(tx, workspaceId);
    const [object] = await tx
      .insert(objects)
      .values({ workspaceId, contextId: rootContextId, moduleKey: "core", objectType: "team" })
      .returning({ id: objects.id });
    if (!object) throw new Error("Team Object creation failed");

    const [team] = await tx.insert(teams).values({ workspaceId, objectId: object.id, name }).returning();
    if (!team) throw new Error("Team creation failed");
    return team;
  });
}

export async function listTeams(db: Database, workspaceId: string) {
  return db
    .select()
    .from(teams)
    .where(and(eq(teams.workspaceId, workspaceId), isNull(teams.archivedAt)))
    .orderBy(asc(teams.name));
}

export async function addTeamMember(db: Database, workspaceId: string, teamId: string, personId: string) {
  const [existing] = await db
    .select()
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.workspaceId, workspaceId),
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.personId, personId),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.archivedAt === null) return existing;

    const [reactivated] = await db
      .update(teamMembers)
      .set({ archivedAt: null })
      .where(eq(teamMembers.id, existing.id))
      .returning();

    if (!reactivated) throw new Error("Team member reactivation failed");
    return reactivated;
  }

  const [membership] = await db
    .insert(teamMembers)
    .values({ workspaceId, teamId, personId })
    .returning();

  if (!membership) throw new Error("Team member creation failed");
  return membership;
}

export async function removeTeamMember(db: Database, workspaceId: string, teamId: string, personId: string) {
  const [membership] = await db
    .update(teamMembers)
    .set({ archivedAt: new Date() })
    .where(
      and(
        eq(teamMembers.workspaceId, workspaceId),
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.personId, personId),
        isNull(teamMembers.archivedAt),
      ),
    )
    .returning();

  return membership ?? null;
}

export async function listTeamMembers(db: Database, workspaceId: string, teamId: string) {
  return db
    .select({
      membershipId: teamMembers.id,
      personId: persons.id,
      displayName: persons.displayName,
      userId: persons.userId,
    })
    .from(teamMembers)
    .innerJoin(persons, and(eq(persons.workspaceId, teamMembers.workspaceId), eq(persons.id, teamMembers.personId)))
    .where(
      and(
        eq(teamMembers.workspaceId, workspaceId),
        eq(teamMembers.teamId, teamId),
        isNull(teamMembers.archivedAt),
        isNull(persons.archivedAt),
      ),
    )
    .orderBy(asc(persons.displayName));
}

export async function createJobRole(db: Database, workspaceId: string, name: string) {
  const [role] = await db.insert(jobRoles).values({ workspaceId, name }).returning();
  if (!role) throw new Error("Job role creation failed");
  return role;
}

export async function listJobRoles(db: Database, workspaceId: string) {
  return db
    .select()
    .from(jobRoles)
    .where(and(eq(jobRoles.workspaceId, workspaceId), isNull(jobRoles.archivedAt)))
    .orderBy(asc(jobRoles.name));
}
