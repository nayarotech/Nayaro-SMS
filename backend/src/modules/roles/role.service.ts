import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { DEFAULT_ROLES, LOCKED_ROLE_KEYS } from "../permissions/default-roles.js";
import { ALL_PERMISSIONS_WILDCARD, isKnownPermission } from "../permissions/permission.catalog.js";

export interface RoleInput {
  name: string;
  description?: string | null;
  permissions: string[];
}

const roleInclude = {
  permissions: { select: { permission: true } },
  _count: { select: { users: true } },
} as const;

type RoleWithRelations = Awaited<ReturnType<typeof findRole>>;

export async function listRoles(schoolId: string) {
  const roles = await prisma.role.findMany({
    where: { schoolId },
    include: roleInclude,
    orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
  });
  // Built-in roles in their natural order, then custom roles
  const order = DEFAULT_ROLES.map((r) => r.key);
  roles.sort((a, b) => rank(a.key) - rank(b.key));
  function rank(key: string) {
    const index = order.indexOf(key as (typeof order)[number]);
    return index === -1 ? order.length : index;
  }
  return roles.map(toRoleDto);
}

export async function getRole(schoolId: string, roleId: string) {
  return toRoleDto(await findRole(schoolId, roleId));
}

export async function createRole(actor: Actor, input: RoleInput) {
  const permissions = validatePermissions(input.permissions);
  const key = await uniqueKey(actor.schoolId, input.name);

  const role = await prisma.$transaction(async (tx) => {
    const created = await tx.role.create({
      data: {
        schoolId: actor.schoolId,
        key,
        name: input.name,
        description: input.description,
        permissions: { create: permissions.map((permission) => ({ permission })) },
      },
      include: roleInclude,
    });
    await recordAudit(actor, { action: "role.create", entityType: "Role", entityId: created.id, newValue: { name: input.name, permissions } }, tx);
    return created;
  });

  return toRoleDto(role);
}

export async function updateRole(actor: Actor, roleId: string, input: Partial<RoleInput>) {
  const existing = await findRole(actor.schoolId, roleId);
  const before = toRoleDto(existing);

  if (input.permissions && before.locked) {
    throw forbidden(`The permissions of "${existing.name}" can't be changed`);
  }
  const permissions = input.permissions ? validatePermissions(input.permissions) : undefined;

  const role = await prisma.$transaction(async (tx) => {
    if (permissions) {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId, permission })) });
    }
    const updated = await tx.role.update({
      where: { id: roleId },
      data: { name: input.name, description: input.description },
      include: roleInclude,
    });
    await recordAudit(
      actor,
      {
        action: "role.update",
        entityType: "Role",
        entityId: roleId,
        oldValue: { name: before.name, description: before.description, permissions: before.permissions },
        newValue: { name: input.name, description: input.description, permissions },
      },
      tx,
    );
    return updated;
  });

  return toRoleDto(role);
}

export async function deleteRole(actor: Actor, roleId: string) {
  const role = await findRole(actor.schoolId, roleId);
  if (role.isSystem) throw forbidden("Built-in roles can't be deleted");
  if (role._count.users > 0) {
    throw conflict(`Remove this role from its ${role._count.users} user(s) before deleting it`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.role.delete({ where: { id: roleId } });
    await recordAudit(
      actor,
      { action: "role.delete", entityType: "Role", entityId: roleId, oldValue: { name: role.name, permissions: role.permissions.map((p) => p.permission) } },
      tx,
    );
  });
}

async function findRole(schoolId: string, roleId: string) {
  const role = await prisma.role.findFirst({ where: { id: roleId, schoolId }, include: roleInclude });
  if (!role) throw notFound("Role");
  return role;
}

function validatePermissions(permissions: string[]): string[] {
  const unique = [...new Set(permissions)];
  const unknown = unique.filter((p) => p !== ALL_PERMISSIONS_WILDCARD && !isKnownPermission(p));
  if (unknown.length) throw badRequest(`Unknown permissions: ${unknown.join(", ")}`);
  if (unique.includes(ALL_PERMISSIONS_WILDCARD)) throw badRequest("Custom roles can't be given every permission");
  return unique;
}

/** "Exam Coordinator" → "exam_coordinator" (with a number suffix if taken). */
async function uniqueKey(schoolId: string, name: string): Promise<string> {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "role";
  for (let i = 0; ; i++) {
    const key = i === 0 ? base : `${base}_${i + 1}`;
    if (!(await prisma.role.findUnique({ where: { schoolId_key: { schoolId, key } } }))) return key;
  }
}

function toRoleDto(role: NonNullable<RoleWithRelations>) {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    locked: LOCKED_ROLE_KEYS.includes(role.key) && role.isSystem,
    permissions: role.permissions.map((p) => p.permission).sort(),
    userCount: role._count.users,
  };
}
