import { createDatabase, workspaceModules } from "@utilitaire/database";
import { and, asc, eq, isNull } from "drizzle-orm";

type Database = ReturnType<typeof createDatabase>["db"];

export async function enableWorkspaceModule(
  db: Database,
  workspaceId: string,
  moduleKey: string,
  installedVersion?: string,
) {
  const [existing] = await db
    .select({ id: workspaceModules.id })
    .from(workspaceModules)
    .where(and(eq(workspaceModules.workspaceId, workspaceId), eq(workspaceModules.moduleKey, moduleKey)))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(workspaceModules)
      .set({
        status: "enabled",
        archivedAt: null,
        ...(installedVersion === undefined ? {} : { installedVersion }),
      })
      .where(eq(workspaceModules.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(workspaceModules)
    .values({
      workspaceId,
      moduleKey,
      status: "enabled",
      ...(installedVersion === undefined ? {} : { installedVersion }),
    })
    .returning();

  if (!created) throw new Error("Workspace module enable failed");
  return created;
}

export async function disableWorkspaceModule(db: Database, workspaceId: string, moduleKey: string) {
  const [updated] = await db
    .update(workspaceModules)
    .set({ status: "disabled" })
    .where(
      and(
        eq(workspaceModules.workspaceId, workspaceId),
        eq(workspaceModules.moduleKey, moduleKey),
        isNull(workspaceModules.archivedAt),
      ),
    )
    .returning();
  return updated ?? null;
}

export async function listWorkspaceModules(db: Database, workspaceId: string) {
  return db
    .select()
    .from(workspaceModules)
    .where(and(eq(workspaceModules.workspaceId, workspaceId), isNull(workspaceModules.archivedAt)))
    .orderBy(asc(workspaceModules.moduleKey));
}

export async function isWorkspaceModuleEnabled(db: Database, workspaceId: string, moduleKey: string) {
  const [module] = await db
    .select({ id: workspaceModules.id })
    .from(workspaceModules)
    .where(
      and(
        eq(workspaceModules.workspaceId, workspaceId),
        eq(workspaceModules.moduleKey, moduleKey),
        eq(workspaceModules.status, "enabled"),
        isNull(workspaceModules.archivedAt),
      ),
    )
    .limit(1);
  return Boolean(module);
}
