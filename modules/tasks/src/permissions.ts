import {
  accessRolePermissions,
  accessRoles,
  createDatabase,
  permissions,
} from "@utilitaire/database";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { taskPermissionKeys } from "./contracts.js";

type Database = ReturnType<typeof createDatabase>["db"];

const taskPermissionRows = taskPermissionKeys.map((key) => ({
  key,
  moduleKey: "tasks",
  objectType: "task",
  action: key.split(".").at(-1)!,
}));

const rolePermissionKeys = {
  administrator: [...taskPermissionKeys],
  manager: [...taskPermissionKeys],
  member: [
    "tasks.task.create",
    "tasks.task.read",
    "tasks.task.update",
    "tasks.task.assign",
    "tasks.task.comment",
  ],
  guest: [],
} as const;

export async function ensureTaskPermissionsForWorkspace(db: Database, workspaceId: string) {
  await db.insert(permissions).values(taskPermissionRows).onConflictDoNothing();

  const permissionRows = await db
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions)
    .where(inArray(permissions.key, [...taskPermissionKeys]));

  const roleRows = await db
    .select({ id: accessRoles.id, systemKey: accessRoles.systemKey })
    .from(accessRoles)
    .where(and(eq(accessRoles.workspaceId, workspaceId), isNull(accessRoles.archivedAt)));

  const permissionIdByKey = new Map(permissionRows.map((row) => [row.key, row.id]));
  const values = roleRows.flatMap((role) => {
    if (!role.systemKey) return [];
    return rolePermissionKeys[role.systemKey].flatMap((key) => {
      const permissionId = permissionIdByKey.get(key);
      return permissionId ? [{ workspaceId, accessRoleId: role.id, permissionId }] : [];
    });
  });

  if (values.length) await db.insert(accessRolePermissions).values(values).onConflictDoNothing();
}
