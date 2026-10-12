import { badRequest, conflict, forbidden, notFound } from "../../lib/errors.js";
import { fromDateString, toDateString } from "../../lib/nepali-date.js";
import { hashPassword } from "../../lib/password.js";
import { prisma, type Db } from "../../lib/prisma.js";
import { fileUrl } from "../../lib/storage/index.js";
import { paginate, type Paginated } from "../../http/schemas.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { SYSTEM_ROLE_KEYS } from "../permissions/default-roles.js";
import { isKnownPermission } from "../permissions/permission.catalog.js";
import { resolvePermissions } from "../permissions/permission.resolver.js";
import { getSchoolSettings } from "../settings/settings.service.js";
import type { Gender, Prisma } from "../../generated/prisma/client.js";

/** Parents and students are managed from the Students screens, not as staff. */
const NON_STAFF_ROLES: string[] = [SYSTEM_ROLE_KEYS.parent, SYSTEM_ROLE_KEYS.student];

export interface StaffProfileInput {
  employeeId?: string | null;
  designation?: string | null;
  gender?: Gender | null;
  dateOfBirth?: string | null;
  joinDate?: string | null;
  qualification?: string | null;
  address?: string | null;
}

export interface CreateUserInput {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  password?: string | null;
  roleIds: string[];
  staffProfile?: StaffProfileInput;
}

export interface UpdateUserInput {
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  isActive?: boolean;
  photoKey?: string | null;
  staffProfile?: StaffProfileInput;
}

export interface ListUsersQuery {
  search?: string;
  roleId?: string;
  status?: "active" | "inactive";
  kind: "staff" | "all";
  page: number;
  pageSize: number;
}

// ─── Queries ─────────────────────────────────────────────────

export async function listUsers(schoolId: string, query: ListUsersQuery): Promise<Paginated<ReturnType<typeof toListItem>>> {
  const where: Prisma.UserWhereInput = {
    schoolId,
    ...(query.status && { isActive: query.status === "active" }),
    ...(query.roleId && { roles: { some: { roleId: query.roleId } } }),
    AND: [
      query.kind === "staff"
        ? { OR: [{ staffProfile: { isNot: null } }, { roles: { some: { role: { key: { notIn: NON_STAFF_ROLES } } } } }] }
        : {},
      query.search
        ? {
            OR: [
              { fullName: { contains: query.search } },
              { email: { contains: query.search } },
              { phone: { contains: query.search } },
              { staffProfile: { employeeId: { contains: query.search } } },
            ],
          }
        : {},
    ],
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { roles: { include: { role: true } }, staffProfile: true },
      orderBy: { fullName: "asc" },
      ...paginate(query.page, query.pageSize),
    }),
    prisma.user.count({ where }),
  ]);

  return { items: users.map(toListItem), total, page: query.page, pageSize: query.pageSize };
}

export async function getUser(schoolId: string, userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, schoolId },
    include: {
      roles: { include: { role: { include: { permissions: true } } } },
      permissionOverrides: true,
      staffProfile: true,
      subjectAssignments: {
        where: { academicYear: { isCurrent: true } },
        include: { subject: true, section: { include: { class: true } } },
      },
      classTeacherOf: { where: { academicYear: { isCurrent: true } }, include: { section: { include: { class: true } } } },
    },
  });
  if (!user) throw notFound("User");

  const effective = resolvePermissions(
    user.roles.map((r) => r.role.permissions.map((p) => p.permission)),
    user.permissionOverrides,
  );

  return {
    ...toListItem(user),
    staffProfile: user.staffProfile && {
      employeeId: user.staffProfile.employeeId,
      designation: user.staffProfile.designation,
      gender: user.staffProfile.gender,
      dateOfBirth: toDateString(user.staffProfile.dateOfBirth),
      joinDate: toDateString(user.staffProfile.joinDate),
      qualification: user.staffProfile.qualification,
      address: user.staffProfile.address,
    },
    hasPassword: Boolean(user.passwordHash),
    permissionOverrides: user.permissionOverrides.map((o) => ({ permission: o.permission, effect: o.effect })),
    effectivePermissions: [...effective].sort(),
    teaching: user.subjectAssignments.map((a) => ({
      subject: a.subject.name,
      classSection: `${a.section.class.name} ${a.section.name}`,
    })),
    classTeacherOf: user.classTeacherOf.map((c) => `${c.section.class.name} ${c.section.name}`),
  };
}

// ─── Create / update ─────────────────────────────────────────

export async function createUser(actor: Actor, input: CreateUserInput) {
  if (!input.email && !input.phone) throw badRequest("Enter an email or a phone number so the user can log in");
  await assertContactsAvailable(actor.schoolId, input.email, input.phone);
  await assertRolesBelongToSchool(actor.schoolId, input.roleIds);
  if (input.password) await assertPasswordLength(actor.schoolId, input.password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        schoolId: actor.schoolId,
        fullName: input.fullName,
        email: input.email?.toLowerCase() || null,
        phone: input.phone || null,
        passwordHash: input.password ? await hashPassword(input.password) : null,
        roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
        staffProfile: { create: { schoolId: actor.schoolId, ...staffProfileData(input.staffProfile ?? {}) } },
      },
    });
    await recordAudit(
      actor,
      { action: "user.create", entityType: "User", entityId: created.id, newValue: { fullName: input.fullName, email: input.email, phone: input.phone, roleIds: input.roleIds } },
      tx,
    );
    return created;
  });

  return getUser(actor.schoolId, user.id);
}

export async function updateUser(actor: Actor, userId: string, input: UpdateUserInput) {
  const before = await findUser(actor.schoolId, userId);
  await assertContactsAvailable(actor.schoolId, input.email, input.phone, userId);

  if (input.isActive === false) {
    if (userId === actor.userId) throw forbidden("You can't deactivate your own account");
    await assertNotLastAdmin(actor.schoolId, userId);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        fullName: input.fullName,
        email: input.email === undefined ? undefined : input.email?.toLowerCase() || null,
        phone: input.phone === undefined ? undefined : input.phone || null,
        isActive: input.isActive,
        photoKey: input.photoKey,
      },
    });
    if (input.staffProfile) {
      const data = staffProfileData(input.staffProfile);
      await tx.staffProfile.upsert({
        where: { userId },
        create: { schoolId: actor.schoolId, userId, ...data },
        update: data,
      });
    }
    if (input.isActive === false) await revokeSessions(tx, userId);

    await recordAudit(
      actor,
      {
        action: input.isActive === false ? "user.deactivate" : input.isActive === true ? "user.activate" : "user.update",
        entityType: "User",
        entityId: userId,
        oldValue: { fullName: before.fullName, email: before.email, phone: before.phone, isActive: before.isActive },
        newValue: input,
      },
      tx,
    );
  });

  return getUser(actor.schoolId, userId);
}

/** Replace a user's roles. */
export async function setUserRoles(actor: Actor, userId: string, roleIds: string[]) {
  const user = await findUser(actor.schoolId, userId);
  await assertRolesBelongToSchool(actor.schoolId, roleIds);

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { schoolId_key: { schoolId: actor.schoolId, key: SYSTEM_ROLE_KEYS.schoolAdmin } },
  });
  const wasAdmin = user.roles.some((r) => r.roleId === adminRole.id);
  if (wasAdmin && !roleIds.includes(adminRole.id)) await assertNotLastAdmin(actor.schoolId, userId);

  await prisma.$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId } });
    await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId, roleId })) });
    await recordAudit(
      actor,
      { action: "user.roles.update", entityType: "User", entityId: userId, oldValue: user.roles.map((r) => r.roleId), newValue: roleIds },
      tx,
    );
  });

  return getUser(actor.schoolId, userId);
}

/** Replace a user's individual GRANT/DENY exceptions. */
export async function setPermissionOverrides(
  actor: Actor,
  userId: string,
  overrides: { permission: string; effect: "GRANT" | "DENY" }[],
) {
  const user = await findUser(actor.schoolId, userId);
  const unknown = overrides.filter((o) => !isKnownPermission(o.permission));
  if (unknown.length) throw badRequest(`Unknown permissions: ${unknown.map((o) => o.permission).join(", ")}`);
  if (userId === actor.userId && overrides.some((o) => o.effect === "DENY")) {
    throw forbidden("You can't remove permissions from yourself");
  }

  await prisma.$transaction(async (tx) => {
    await tx.userPermissionOverride.deleteMany({ where: { userId } });
    await tx.userPermissionOverride.createMany({ data: overrides.map((o) => ({ userId, ...o })) });
    await recordAudit(
      actor,
      { action: "user.permissions.update", entityType: "User", entityId: userId, oldValue: user.permissionOverrides, newValue: overrides },
      tx,
    );
  });

  return getUser(actor.schoolId, userId);
}

export async function resetPassword(actor: Actor, userId: string, password: string) {
  await findUser(actor.schoolId, userId);
  await assertPasswordLength(actor.schoolId, password);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password) } });
    await revokeSessions(tx, userId);
    await recordAudit(actor, { action: "user.password.reset", entityType: "User", entityId: userId }, tx);
  });
}

// ─── Helpers (also used by the students & guardians modules) ──

async function findUser(schoolId: string, userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, schoolId },
    include: { roles: true, permissionOverrides: { select: { permission: true, effect: true } } },
  });
  if (!user) throw notFound("User");
  return user;
}

export async function assertContactsAvailable(schoolId: string, email?: string | null, phone?: string | null, exceptUserId?: string) {
  if (email) {
    const taken = await prisma.user.findFirst({ where: { schoolId, email: email.toLowerCase(), NOT: { id: exceptUserId } } });
    if (taken) throw conflict(`${email} is already used by ${taken.fullName}`, { fieldErrors: { email: ["Already in use"] } });
  }
  if (phone) {
    const taken = await prisma.user.findFirst({ where: { schoolId, phone, NOT: { id: exceptUserId } } });
    if (taken) throw conflict(`${phone} is already used by ${taken.fullName}`, { fieldErrors: { phone: ["Already in use"] } });
  }
}

async function assertRolesBelongToSchool(schoolId: string, roleIds: string[]) {
  const count = await prisma.role.count({ where: { schoolId, id: { in: roleIds } } });
  if (count !== new Set(roleIds).size) throw badRequest("One or more roles were not found");
}

async function assertPasswordLength(schoolId: string, password: string) {
  const settings = await getSchoolSettings(schoolId);
  const min = settings["security.passwordMinLength"] as number;
  if (password.length < min) throw badRequest(`Password must be at least ${min} characters`, { fieldErrors: { password: [`At least ${min} characters`] } });
}

/** A school must always keep at least one active School Admin. */
async function assertNotLastAdmin(schoolId: string, userId: string) {
  const otherAdmins = await prisma.user.count({
    where: {
      schoolId,
      isActive: true,
      id: { not: userId },
      roles: { some: { role: { key: SYSTEM_ROLE_KEYS.schoolAdmin } } },
    },
  });
  const isAdmin = await prisma.userRole.count({ where: { userId, role: { key: SYSTEM_ROLE_KEYS.schoolAdmin } } });
  if (isAdmin && otherAdmins === 0) throw forbidden("This is the school's only School Admin. Make someone else an admin first.");
}

async function revokeSessions(db: Db, userId: string) {
  await db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

function staffProfileData(input: StaffProfileInput) {
  return {
    employeeId: input.employeeId || null,
    designation: input.designation,
    gender: input.gender,
    dateOfBirth: input.dateOfBirth ? fromDateString(input.dateOfBirth) : input.dateOfBirth === null ? null : undefined,
    joinDate: input.joinDate ? fromDateString(input.joinDate) : input.joinDate === null ? null : undefined,
    qualification: input.qualification,
    address: input.address,
  };
}

function toListItem(user: {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  photoKey: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  roles: { role: { id: string; key: string; name: string } }[];
  staffProfile: { designation: string | null; employeeId: string | null } | null;
}) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    photoUrl: fileUrl(user.photoKey),
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    designation: user.staffProfile?.designation ?? null,
    employeeId: user.staffProfile?.employeeId ?? null,
    isStaff: Boolean(user.staffProfile) || user.roles.some((r) => !NON_STAFF_ROLES.includes(r.role.key)),
    roles: user.roles.map((r) => ({ id: r.role.id, key: r.role.key, name: r.role.name })),
  };
}
