import type { Db } from "../../lib/prisma.js";
import { DEFAULT_ROLES } from "../permissions/default-roles.js";

/** Creates the built-in roles for a new school. Safe to run again (skips existing roles). */
export async function provisionDefaultRoles(db: Db, schoolId: string): Promise<void> {
  for (const role of DEFAULT_ROLES) {
    const existing = await db.role.findUnique({ where: { schoolId_key: { schoolId, key: role.key } } });
    if (existing) continue;

    await db.role.create({
      data: {
        schoolId,
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: true,
        permissions: { create: role.permissions.map((permission) => ({ permission })) },
      },
    });
  }
}

export async function findRoleByKey(db: Db, schoolId: string, key: string) {
  return db.role.findUniqueOrThrow({ where: { schoolId_key: { schoolId, key } } });
}
