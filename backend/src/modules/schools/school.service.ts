import { conflict, notFound } from "../../lib/errors.js";
import { hashPassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";
import { fileUrl } from "../../lib/storage/index.js";
import { paginate, type Paginated } from "../../http/schemas.js";
import { SYSTEM_ROLE_KEYS } from "../permissions/default-roles.js";
import { findRoleByKey, provisionDefaultRoles } from "../roles/role.provisioning.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { pickKeys } from "../../lib/objects.js";

export interface CreateSchoolInput {
  name: string;
  code: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  admin: { fullName: string; email: string; phone?: string | null; password: string };
}

export interface UpdateSchoolInput {
  name?: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  isActive?: boolean;
  logoKey?: string | null;
}

/**
 * Creates a school with its built-in roles and its first School Admin account,
 * all in one transaction.
 */
export async function createSchool(input: CreateSchoolInput) {
  const code = input.code.toUpperCase();
  if (await prisma.school.findUnique({ where: { code } })) throw conflict(`School code "${code}" is already used`);

  return prisma.$transaction(async (tx) => {
    const school = await tx.school.create({
      data: { name: input.name, code, address: input.address, phone: input.phone, email: input.email, settings: {} },
    });

    await provisionDefaultRoles(tx, school.id);
    const adminRole = await findRoleByKey(tx, school.id, SYSTEM_ROLE_KEYS.schoolAdmin);

    await tx.user.create({
      data: {
        schoolId: school.id,
        fullName: input.admin.fullName,
        email: input.admin.email.toLowerCase(),
        phone: input.admin.phone,
        passwordHash: await hashPassword(input.admin.password),
        roles: { create: { roleId: adminRole.id } },
        staffProfile: { create: { schoolId: school.id, designation: "Administrator" } },
      },
    });

    return toSchoolDto(school);
  });
}

export async function listSchools(params: { search?: string; page: number; pageSize: number }): Promise<Paginated<SchoolDto>> {
  const where = params.search
    ? { OR: [{ name: { contains: params.search } }, { code: { contains: params.search } }] }
    : {};

  const [schools, total] = await Promise.all([
    prisma.school.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { students: true, users: true } } },
      ...paginate(params.page, params.pageSize),
    }),
    prisma.school.count({ where }),
  ]);

  return {
    items: schools.map((school) => ({
      ...toSchoolDto(school),
      studentCount: school._count.students,
      userCount: school._count.users,
    })),
    total,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function getSchool(schoolId: string) {
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) throw notFound("School");
  return toSchoolDto(school);
}

export async function updateSchool(schoolId: string, input: UpdateSchoolInput, actor?: Actor) {
  const before = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!before) throw notFound("School");

  const school = await prisma.school.update({ where: { id: schoolId }, data: input });
  if (actor) {
    await recordAudit(actor, {
      action: "school.update",
      entityType: "School",
      entityId: schoolId,
      oldValue: pickKeys(before, Object.keys(input)),
      newValue: input,
    });
  }
  return toSchoolDto(school);
}

export type SchoolDto = ReturnType<typeof toSchoolDto>;

function toSchoolDto(school: {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logoKey: string | null;
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    id: school.id,
    name: school.name,
    code: school.code,
    address: school.address,
    phone: school.phone,
    email: school.email,
    logoUrl: fileUrl(school.logoKey),
    isActive: school.isActive,
    createdAt: school.createdAt,
  };
}
