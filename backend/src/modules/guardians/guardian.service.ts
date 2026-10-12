import { badRequest, notFound } from "../../lib/errors.js";
import { prisma, type Db } from "../../lib/prisma.js";
import { fileUrl } from "../../lib/storage/index.js";
import { hashPassword } from "../../lib/password.js";
import { getSchoolSettings } from "../settings/settings.service.js";
import { paginate, type Paginated } from "../../http/schemas.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { SYSTEM_ROLE_KEYS } from "../permissions/default-roles.js";
import { findRoleByKey } from "../roles/role.provisioning.js";
import { assertContactsAvailable } from "../users/user.service.js";
import type { GuardianRelation, Prisma } from "../../generated/prisma/client.js";

/**
 * Guardians (parents). Each guardian is a User with the Parent role, so they
 * can log in with phone + OTP, plus a Guardian row with parent-specific details.
 */

export interface NewGuardianInput {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  occupation?: string | null;
  address?: string | null;
  alternatePhone?: string | null;
  whatsappOptIn?: boolean;
  /** App password. Without one, the parent can only sign in with an SMS code. */
  password?: string | null;
}

export interface GuardianLinkInput {
  /** Link an existing guardian (e.g. a sibling's parent) … */
  guardianId?: string;
  /** … or create/find one by phone. */
  guardian?: NewGuardianInput;
  relation: GuardianRelation;
  isPrimary?: boolean;
}

/**
 * Returns the guardian for this input:
 * - guardianId given → that guardian
 * - phone matches an existing guardian → reuse it (siblings share parents)
 * - phone matches another user (e.g. a teacher who is also a parent) → add the Parent role to them
 * - otherwise → create a new user + guardian
 */
export async function findOrCreateGuardian(tx: Db, schoolId: string, input: GuardianLinkInput): Promise<string> {
  if (input.guardianId) {
    const existing = await tx.guardian.findFirst({ where: { id: input.guardianId, schoolId } });
    if (!existing) throw notFound("Guardian");
    return existing.id;
  }
  const data = input.guardian;
  if (!data) throw badRequest("Each guardian needs either guardianId or guardian details");

  const parentRole = await findRoleByKey(tx, schoolId, SYSTEM_ROLE_KEYS.parent);
  const existingUser = data.phone
    ? await tx.user.findFirst({ where: { schoolId, phone: data.phone }, include: { guardian: true, roles: true } })
    : null;

  if (data.password) await assertPasswordLength(schoolId, data.password);
  const passwordHash = data.password ? await hashPassword(data.password) : null;

  if (existingUser?.guardian) {
    // A sibling's parent: only set a password if they don't have one yet
    if (passwordHash && !existingUser.passwordHash) await tx.user.update({ where: { id: existingUser.id }, data: { passwordHash } });
    return existingUser.guardian.id;
  }

  if (data.email && !existingUser) await assertContactsAvailable(schoolId, data.email, null);

  const userId =
    existingUser?.id ??
    (
      await tx.user.create({
        data: { schoolId, fullName: data.fullName, phone: data.phone || null, email: data.email?.toLowerCase() || null, passwordHash },
      })
    ).id;

  if (!existingUser?.roles.some((r) => r.roleId === parentRole.id)) {
    await tx.userRole.create({ data: { userId, roleId: parentRole.id } });
  }

  const guardian = await tx.guardian.create({
    data: {
      schoolId,
      userId,
      occupation: data.occupation,
      address: data.address,
      alternatePhone: data.alternatePhone,
      whatsappOptIn: Boolean(data.whatsappOptIn),
      whatsappOptInAt: data.whatsappOptIn ? new Date() : null,
    },
  });
  return guardian.id;
}

export async function listGuardians(schoolId: string, query: { search?: string; page: number; pageSize: number }): Promise<Paginated<GuardianListItem>> {
  const where: Prisma.GuardianWhereInput = {
    schoolId,
    ...(query.search && {
      OR: [
        { user: { fullName: { contains: query.search } } },
        { user: { phone: { contains: query.search } } },
        { students: { some: { student: { OR: [{ firstName: { contains: query.search } }, { lastName: { contains: query.search } }] } } } },
      ],
    }),
  };

  const [guardians, total] = await Promise.all([
    prisma.guardian.findMany({
      where,
      include: guardianInclude,
      orderBy: { user: { fullName: "asc" } },
      ...paginate(query.page, query.pageSize),
    }),
    prisma.guardian.count({ where }),
  ]);
  return { items: guardians.map(toGuardianDto), total, page: query.page, pageSize: query.pageSize };
}

export async function getGuardian(schoolId: string, guardianId: string) {
  const guardian = await prisma.guardian.findFirst({ where: { id: guardianId, schoolId }, include: guardianInclude });
  if (!guardian) throw notFound("Guardian");
  return toGuardianDto(guardian);
}

export interface UpdateGuardianInput {
  fullName?: string;
  phone?: string | null;
  email?: string | null;
  occupation?: string | null;
  address?: string | null;
  alternatePhone?: string | null;
  whatsappOptIn?: boolean;
}

export async function updateGuardian(actor: Actor, guardianId: string, input: UpdateGuardianInput) {
  const before = await prisma.guardian.findFirst({ where: { id: guardianId, schoolId: actor.schoolId }, include: { user: true } });
  if (!before) throw notFound("Guardian");
  await assertContactsAvailable(actor.schoolId, input.email, input.phone, before.userId);

  const optInChanged = input.whatsappOptIn !== undefined && input.whatsappOptIn !== before.whatsappOptIn;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: before.userId },
      data: {
        fullName: input.fullName,
        phone: input.phone === undefined ? undefined : input.phone || null,
        email: input.email === undefined ? undefined : input.email?.toLowerCase() || null,
      },
    });
    await tx.guardian.update({
      where: { id: guardianId },
      data: {
        occupation: input.occupation,
        address: input.address,
        alternatePhone: input.alternatePhone,
        whatsappOptIn: input.whatsappOptIn,
        ...(optInChanged && input.whatsappOptIn ? { whatsappOptInAt: new Date() } : {}),
        ...(optInChanged && !input.whatsappOptIn ? { whatsappOptOutAt: new Date() } : {}),
      },
    });
    await recordAudit(
      actor,
      {
        action: "guardian.update",
        entityType: "Guardian",
        entityId: guardianId,
        oldValue: { fullName: before.user.fullName, phone: before.user.phone, email: before.user.email, whatsappOptIn: before.whatsappOptIn },
        newValue: input,
      },
      tx,
    );
  });

  return getGuardian(actor.schoolId, guardianId);
}

/** Throws 404 (not 403) so a parent can't tell whether another child exists. */
export async function assertIsGuardianOf(userId: string, studentId: string): Promise<void> {
  const link = await prisma.studentGuardian.findFirst({ where: { studentId, guardian: { userId } } });
  if (!link) throw notFound("Student");
}

/** Sets (or resets) a parent's app password and signs them out of other devices. */
export async function setGuardianPassword(actor: Actor, guardianId: string, password: string) {
  const guardian = await prisma.guardian.findFirst({ where: { id: guardianId, schoolId: actor.schoolId } });
  if (!guardian) throw notFound("Guardian");
  await assertPasswordLength(actor.schoolId, password);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: guardian.userId }, data: { passwordHash: await hashPassword(password) } });
    await tx.refreshToken.updateMany({ where: { userId: guardian.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await recordAudit(actor, { action: "guardian.password.set", entityType: "Guardian", entityId: guardianId }, tx);
  });
  return getGuardian(actor.schoolId, guardianId);
}

async function assertPasswordLength(schoolId: string, password: string) {
  const min = Number((await getSchoolSettings(schoolId))["security.passwordMinLength"] ?? 8);
  if (password.length < min) throw badRequest(`The app password must be at least ${min} characters`, { fieldErrors: { password: [`At least ${min} characters`] } });
}

/** For the parent app: the logged-in parent's children. */
export async function getMyChildren(userId: string) {
  const guardian = await prisma.guardian.findUnique({
    where: { userId },
    include: {
      students: {
        include: {
          student: {
            include: {
              enrollments: {
                where: { academicYear: { isCurrent: true } },
                include: { class: { select: { name: true } }, section: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!guardian) return [];
  return guardian.students
    .filter((link) => link.student.status === "ACTIVE")
    .map(({ student, relation }) => ({
      id: student.id,
      fullName: [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" "),
      admissionNo: student.admissionNo,
      relation,
      classSection: student.enrollments[0] ? `${student.enrollments[0].class.name} ${student.enrollments[0].section.name}` : null,
      rollNo: student.enrollments[0]?.rollNo ?? null,
      photoUrl: fileUrl(student.photoKey),
    }));
}

const guardianInclude = {
  user: { select: { id: true, fullName: true, phone: true, email: true, isActive: true, lastLoginAt: true, passwordHash: true } },
  students: {
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNo: true,
          status: true,
          enrollments: {
            where: { academicYear: { isCurrent: true } },
            select: { class: { select: { name: true } }, section: { select: { name: true } } },
          },
        },
      },
    },
  },
} as const;

type GuardianWithRelations = Prisma.GuardianGetPayload<{ include: typeof guardianInclude }>;
export type GuardianListItem = ReturnType<typeof toGuardianDto>;

function toGuardianDto(g: GuardianWithRelations) {
  return {
    id: g.id,
    userId: g.user.id,
    fullName: g.user.fullName,
    phone: g.user.phone,
    email: g.user.email,
    occupation: g.occupation,
    address: g.address,
    alternatePhone: g.alternatePhone,
    whatsappOptIn: g.whatsappOptIn,
    whatsappOptInAt: g.whatsappOptInAt,
    whatsappOptOutAt: g.whatsappOptOutAt,
    hasLoggedIn: Boolean(g.user.lastLoginAt),
    hasPassword: Boolean(g.user.passwordHash),
    children: g.students.map((link) => ({
      id: link.student.id,
      name: `${link.student.firstName} ${link.student.lastName}`,
      admissionNo: link.student.admissionNo,
      status: link.student.status,
      relation: link.relation,
      isPrimary: link.isPrimary,
      classSection: link.student.enrollments[0] ? `${link.student.enrollments[0].class.name} ${link.student.enrollments[0].section.name}` : null,
    })),
  };
}
