import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { fromDateString, toDateString } from "../../lib/nepali-date.js";
import { prisma, type Db } from "../../lib/prisma.js";
import { fileUrl, storage } from "../../lib/storage/index.js";
import { paginate, type Paginated } from "../../http/schemas.js";
import type { AuthContext } from "../../http/auth-context.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { recordAccess } from "./student-record.service.js";
import { resolveAcademicYear } from "../academic/academic-year.service.js";
import { findSection } from "../academic/class.service.js";
import { assertFileBelongsToSchool } from "../files/file.service.js";
import { findOrCreateGuardian, type GuardianLinkInput } from "../guardians/guardian.service.js";
import { getSchoolSettings } from "../settings/settings.service.js";
import type { Gender, GuardianRelation, Prisma, StudentStatus } from "../../generated/prisma/client.js";

export interface StudentDetailsInput {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gender: Gender;
  dateOfBirth: string;
  bloodGroup?: string | null;
  religion?: string | null;
  nationality?: string | null;
  address?: string | null;
  temporaryAddress?: string | null;
  phone?: string | null;
  email?: string | null;
  photoKey?: string | null;
  admissionDate: string;
  previousSchool?: string | null;
  medicalNotes?: string | null;
}

export interface AdmissionInput extends StudentDetailsInput {
  /** Required when automatic admission numbers are turned off in settings. */
  admissionNo?: string | null;
  enrollment: { academicYearId?: string; sectionId: string; rollNo?: number | null };
  guardians: GuardianLinkInput[];
  documents?: { title: string; fileKey: string }[];
}

export interface ListStudentsQuery {
  search?: string;
  classId?: string;
  sectionId?: string;
  status?: StudentStatus;
  academicYearId?: string;
  page: number;
  pageSize: number;
}

// ─── Admission ───────────────────────────────────────────────

/** Admit a student: student + guardians (found or created) + enrollment + documents, all-or-nothing. */
export async function admitStudent(actor: Actor, input: AdmissionInput) {
  const settings = await getSchoolSettings(actor.schoolId);
  const year = await resolveAcademicYear(actor.schoolId, input.enrollment.academicYearId);
  const section = await findSection(actor.schoolId, input.enrollment.sectionId);

  if (input.guardians.length === 0) throw badRequest("Add at least one parent or guardian");
  if (settings["students.requireGuardianPhone"] && !input.guardians.some((g) => g.guardianId || g.guardian?.phone)) {
    throw badRequest("At least one guardian needs a mobile number");
  }
  if (!settings["students.autoAdmissionNo"] && !input.admissionNo) {
    throw badRequest("Enter an admission number", { fieldErrors: { admissionNo: ["Required"] } });
  }
  await assertFilesBelongToSchool(actor.schoolId, [input.photoKey, ...(input.documents ?? []).map((d) => d.fileKey)]);

  const studentId = await prisma.$transaction(async (tx) => {
    const admissionNo = input.admissionNo || (await nextAdmissionNo(tx, actor.schoolId, String(settings["students.admissionNoPrefix"] ?? ""), year.name));
    if (await tx.student.findUnique({ where: { schoolId_admissionNo: { schoolId: actor.schoolId, admissionNo } } })) {
      throw conflict(`Admission number ${admissionNo} is already used`, { fieldErrors: { admissionNo: ["Already used"] } });
    }

    const student = await tx.student.create({
      data: { schoolId: actor.schoolId, admissionNo, ...studentData(input) },
    });

    const primaryIndex = Math.max(0, input.guardians.findIndex((g) => g.isPrimary));
    for (const [index, link] of input.guardians.entries()) {
      const guardianId = await findOrCreateGuardian(tx, actor.schoolId, link);
      await tx.studentGuardian.upsert({
        where: { studentId_guardianId: { studentId: student.id, guardianId } },
        create: { studentId: student.id, guardianId, relation: link.relation, isPrimary: index === primaryIndex },
        update: {},
      });
    }

    await tx.enrollment.create({
      data: {
        schoolId: actor.schoolId,
        studentId: student.id,
        academicYearId: year.id,
        classId: section.classId,
        sectionId: section.id,
        rollNo: input.enrollment.rollNo ?? (await nextRollNo(tx, year.id, section.id)),
      },
    });

    if (input.documents?.length) {
      await tx.studentDocument.createMany({
        data: input.documents.map((d) => ({ schoolId: actor.schoolId, studentId: student.id, title: d.title, fileKey: d.fileKey, uploadedById: actor.userId })),
      });
    }

    await recordAudit(
      actor,
      {
        action: "student.admit",
        entityType: "Student",
        entityId: student.id,
        newValue: { admissionNo, name: `${input.firstName} ${input.lastName}`, class: `${section.class.name} ${section.name}`, academicYear: year.name },
      },
      tx,
    );
    return student.id;
  });

  return getStudent(actor.schoolId, studentId);
}

/** e.g. prefix "ADM-", year "2082" → "ADM-2082-0007" */
async function nextAdmissionNo(tx: Db, schoolId: string, prefix: string, yearName: string): Promise<string> {
  const base = `${prefix}${yearName}-`;
  const last = await tx.student.findFirst({
    where: { schoolId, admissionNo: { startsWith: base } },
    orderBy: { admissionNo: "desc" },
    select: { admissionNo: true },
  });
  const lastNumber = last ? Number(last.admissionNo.slice(base.length)) || 0 : 0;
  return `${base}${String(lastNumber + 1).padStart(4, "0")}`;
}

async function nextRollNo(tx: Db, academicYearId: string, sectionId: string): Promise<number> {
  const result = await tx.enrollment.aggregate({ where: { academicYearId, sectionId }, _max: { rollNo: true } });
  return (result._max.rollNo ?? 0) + 1;
}

// ─── Queries ─────────────────────────────────────────────────

export async function listStudents(schoolId: string, query: ListStudentsQuery): Promise<Paginated<StudentListItem>> {
  const year = await prisma.academicYear.findFirst({
    where: query.academicYearId ? { id: query.academicYearId, schoolId } : { schoolId, isCurrent: true },
  });

  const enrollmentFilter: Prisma.EnrollmentWhereInput = {
    academicYearId: year?.id ?? "",
    ...(query.classId && { classId: query.classId }),
    ...(query.sectionId && { sectionId: query.sectionId }),
  };

  const where: Prisma.StudentWhereInput = {
    schoolId,
    status: query.status ?? "ACTIVE",
    ...((query.classId || query.sectionId) && { enrollments: { some: enrollmentFilter } }),
    ...(query.search && {
      OR: [
        { firstName: { contains: query.search } },
        { lastName: { contains: query.search } },
        { admissionNo: { contains: query.search } },
        { guardians: { some: { guardian: { user: { phone: { contains: query.search } } } } } },
      ],
    }),
  };

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      include: {
        enrollments: { where: { academicYearId: year?.id ?? "" }, include: { class: true, section: true } },
        guardians: { where: { isPrimary: true }, include: { guardian: { include: { user: { select: { fullName: true, phone: true } } } } } },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      ...paginate(query.page, query.pageSize),
    }),
    prisma.student.count({ where }),
  ]);

  const items = students.map((s) => {
    const enrollment = s.enrollments[0];
    const primary = s.guardians[0]?.guardian.user;
    return {
      id: s.id,
      admissionNo: s.admissionNo,
      fullName: fullName(s),
      gender: s.gender,
      dateOfBirth: toDateString(s.dateOfBirth),
      photoUrl: fileUrl(s.photoKey),
      status: s.status,
      class: enrollment ? { id: enrollment.class.id, name: enrollment.class.name, order: enrollment.class.order } : null,
      section: enrollment ? { id: enrollment.section.id, name: enrollment.section.name } : null,
      rollNo: enrollment?.rollNo ?? null,
      primaryGuardian: primary ? { name: primary.fullName, phone: primary.phone } : null,
    };
  });

  return { items, total, page: query.page, pageSize: query.pageSize };
}

export type StudentListItem = {
  id: string;
  admissionNo: string;
  fullName: string;
  gender: Gender;
  dateOfBirth: string;
  photoUrl: string | null;
  status: StudentStatus;
  class: { id: string; name: string; order: number } | null;
  section: { id: string; name: string } | null;
  rollNo: number | null;
  primaryGuardian: { name: string; phone: string | null } | null;
};

/**
 * Student profile. Class history and documents are part of the full record,
 * so they're only included for users with `student.record.view`.
 */
export async function getStudent(schoolId: string, studentId: string, auth?: AuthContext) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    include: {
      enrollments: { include: { academicYear: true, class: true, section: true }, orderBy: { academicYear: { startDate: "desc" } } },
      guardians: { include: { guardian: { include: { user: { select: { id: true, fullName: true, phone: true, email: true, lastLoginAt: true, passwordHash: true } } } } } },
      documents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!student) throw notFound("Student");

  const canSeeRecord = !auth || auth.permissions.has("student.record.view");
  const access = auth ? await recordAccess(auth, studentId) : { record: true, notes: true, addNotes: true, manageNotes: true };
  const current = student.enrollments.find((e) => e.academicYear.isCurrent) ?? null;

  return {
    id: student.id,
    admissionNo: student.admissionNo,
    fullName: fullName(student),
    firstName: student.firstName,
    middleName: student.middleName,
    lastName: student.lastName,
    gender: student.gender,
    dateOfBirth: toDateString(student.dateOfBirth),
    bloodGroup: student.bloodGroup,
    religion: student.religion,
    nationality: student.nationality,
    address: student.address,
    temporaryAddress: student.temporaryAddress,
    phone: student.phone,
    email: student.email,
    photoUrl: fileUrl(student.photoKey),
    admissionDate: toDateString(student.admissionDate),
    previousSchool: student.previousSchool,
    medicalNotes: student.medicalNotes,
    status: student.status,
    currentEnrollment: current && {
      id: current.id,
      academicYear: { id: current.academicYear.id, name: current.academicYear.name },
      class: { id: current.class.id, name: current.class.name },
      section: { id: current.section.id, name: current.section.name },
      rollNo: current.rollNo,
      status: current.status,
    },
    guardians: student.guardians
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
      .map((link) => ({
        id: link.guardian.id,
        fullName: link.guardian.user.fullName,
        phone: link.guardian.user.phone,
        email: link.guardian.user.email,
        occupation: link.guardian.occupation,
        relation: link.relation,
        isPrimary: link.isPrimary,
        whatsappOptIn: link.guardian.whatsappOptIn,
        hasLoggedIn: Boolean(link.guardian.user.lastLoginAt),
        hasPassword: Boolean(link.guardian.user.passwordHash),
      })),
    canSeeFullRecord: canSeeRecord,
    /** 360° record and notes (also open to the student's class teacher) */
    access,
    history: canSeeRecord
      ? student.enrollments.map((e) => ({
          id: e.id,
          academicYear: e.academicYear.name,
          classSection: `${e.class.name} ${e.section.name}`,
          rollNo: e.rollNo,
          status: e.status,
          remarks: e.remarks,
        }))
      : null,
    documents: canSeeRecord
      ? student.documents.map((d) => ({ id: d.id, title: d.title, url: storage.getUrl(d.fileKey), createdAt: d.createdAt }))
      : null,
  };
}

// ─── Updates ─────────────────────────────────────────────────

export async function updateStudent(actor: Actor, studentId: string, input: Partial<StudentDetailsInput> & { status?: StudentStatus }) {
  const before = await findStudent(actor.schoolId, studentId);
  await assertFilesBelongToSchool(actor.schoolId, [input.photoKey]);

  await prisma.$transaction(async (tx) => {
    await tx.student.update({ where: { id: studentId }, data: { ...studentData(input), status: input.status } });
    await recordAudit(
      actor,
      { action: "student.update", entityType: "Student", entityId: studentId, oldValue: pickChanged(before, input), newValue: input },
      tx,
    );
  });
  return getStudent(actor.schoolId, studentId);
}

/** Move a student to another section of the same class in the current year, or change their roll number. */
export async function updateCurrentEnrollment(actor: Actor, studentId: string, input: { sectionId?: string; rollNo?: number | null }) {
  await findStudent(actor.schoolId, studentId);
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, schoolId: actor.schoolId, academicYear: { isCurrent: true } },
    include: { section: true },
  });
  if (!enrollment) throw badRequest("The student isn't enrolled in the current academic year");

  if (input.sectionId) {
    const section = await findSection(actor.schoolId, input.sectionId);
    if (section.classId !== enrollment.classId) throw badRequest("Use promotion to move a student to a different class");
  }

  await prisma.$transaction(async (tx) => {
    await tx.enrollment.update({ where: { id: enrollment.id }, data: { sectionId: input.sectionId, rollNo: input.rollNo } });
    await recordAudit(
      actor,
      {
        action: "enrollment.update",
        entityType: "Enrollment",
        entityId: enrollment.id,
        oldValue: { sectionId: enrollment.sectionId, rollNo: enrollment.rollNo },
        newValue: input,
      },
      tx,
    );
  });
  return getStudent(actor.schoolId, studentId);
}

export async function addGuardian(actor: Actor, studentId: string, link: GuardianLinkInput) {
  await findStudent(actor.schoolId, studentId);
  await prisma.$transaction(async (tx) => {
    const guardianId = await findOrCreateGuardian(tx, actor.schoolId, link);
    if (link.isPrimary) await tx.studentGuardian.updateMany({ where: { studentId }, data: { isPrimary: false } });
    await tx.studentGuardian.upsert({
      where: { studentId_guardianId: { studentId, guardianId } },
      create: { studentId, guardianId, relation: link.relation, isPrimary: Boolean(link.isPrimary) },
      update: { relation: link.relation, isPrimary: link.isPrimary },
    });
    await recordAudit(actor, { action: "student.guardian.add", entityType: "Student", entityId: studentId, newValue: { guardianId, relation: link.relation } }, tx);
  });
  return getStudent(actor.schoolId, studentId);
}

export async function updateGuardianLink(actor: Actor, studentId: string, guardianId: string, input: { relation?: GuardianRelation; isPrimary?: boolean }) {
  await findStudent(actor.schoolId, studentId);
  const link = await prisma.studentGuardian.findUnique({ where: { studentId_guardianId: { studentId, guardianId } } });
  if (!link) throw notFound("Guardian link");

  await prisma.$transaction(async (tx) => {
    if (input.isPrimary) await tx.studentGuardian.updateMany({ where: { studentId }, data: { isPrimary: false } });
    await tx.studentGuardian.update({ where: { studentId_guardianId: { studentId, guardianId } }, data: input });
    await recordAudit(actor, { action: "student.guardian.update", entityType: "Student", entityId: studentId, oldValue: link, newValue: { guardianId, ...input } }, tx);
  });
  return getStudent(actor.schoolId, studentId);
}

export async function removeGuardian(actor: Actor, studentId: string, guardianId: string) {
  await findStudent(actor.schoolId, studentId);
  const count = await prisma.studentGuardian.count({ where: { studentId } });
  if (count <= 1) throw badRequest("A student must have at least one guardian");

  await prisma.$transaction(async (tx) => {
    await tx.studentGuardian.delete({ where: { studentId_guardianId: { studentId, guardianId } } });
    await recordAudit(actor, { action: "student.guardian.remove", entityType: "Student", entityId: studentId, oldValue: { guardianId } }, tx);
  });
  return getStudent(actor.schoolId, studentId);
}

export async function addDocument(actor: Actor, studentId: string, input: { title: string; fileKey: string }) {
  await findStudent(actor.schoolId, studentId);
  await assertFileBelongsToSchool(actor.schoolId, input.fileKey);
  await prisma.$transaction(async (tx) => {
    const doc = await tx.studentDocument.create({ data: { schoolId: actor.schoolId, studentId, uploadedById: actor.userId, ...input } });
    await recordAudit(actor, { action: "student.document.add", entityType: "Student", entityId: studentId, newValue: { documentId: doc.id, title: input.title } }, tx);
  });
  return getStudent(actor.schoolId, studentId);
}

export async function removeDocument(actor: Actor, studentId: string, documentId: string) {
  const doc = await prisma.studentDocument.findFirst({ where: { id: documentId, studentId, schoolId: actor.schoolId } });
  if (!doc) throw notFound("Document");
  await prisma.$transaction(async (tx) => {
    await tx.studentDocument.delete({ where: { id: documentId } });
    await recordAudit(actor, { action: "student.document.remove", entityType: "Student", entityId: studentId, oldValue: { title: doc.title } }, tx);
  });
  await storage.remove(doc.fileKey).catch(() => undefined);
  return getStudent(actor.schoolId, studentId);
}

// ─── Privacy: export and delete on request ───────────────────

/** Everything stored about a student, for a parent's data request. */
export async function exportStudentData(actor: Actor, studentId: string) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: actor.schoolId },
    include: {
      enrollments: { include: { academicYear: true, class: true, section: true } },
      guardians: { include: { guardian: { include: { user: { select: { fullName: true, phone: true, email: true } } } } } },
      documents: true,
    },
  });
  if (!student) throw notFound("Student");
  await recordAudit(actor, { action: "student.export", entityType: "Student", entityId: studentId });
  return { exportedAt: new Date().toISOString(), student };
}

/** Permanently deletes a student and their files. Guardians stay (they may have other children). */
export async function deleteStudent(actor: Actor, studentId: string) {
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: actor.schoolId }, include: { documents: true } });
  if (!student) throw notFound("Student");

  await prisma.$transaction(async (tx) => {
    await tx.student.delete({ where: { id: studentId } });
    // Keep only what's needed to show that a deletion happened — no personal details.
    await recordAudit(actor, { action: "student.delete", entityType: "Student", entityId: studentId, oldValue: { admissionNo: student.admissionNo } }, tx);
  });

  const keys = [student.photoKey, ...student.documents.map((d) => d.fileKey)].filter((k): k is string => Boolean(k));
  await Promise.all(keys.map((key) => storage.remove(key).catch(() => undefined)));
}

// ─── Helpers ─────────────────────────────────────────────────

async function findStudent(schoolId: string, studentId: string) {
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!student) throw notFound("Student");
  return student;
}

async function assertFilesBelongToSchool(schoolId: string, keys: (string | null | undefined)[]) {
  for (const key of keys) if (key) await assertFileBelongsToSchool(schoolId, key);
}

/** Maps API fields to columns (undefined fields are left unchanged on update). */
function studentData(input: Partial<StudentDetailsInput>) {
  return {
    firstName: input.firstName,
    middleName: input.middleName,
    lastName: input.lastName,
    gender: input.gender,
    dateOfBirth: input.dateOfBirth ? fromDateString(input.dateOfBirth) : undefined,
    bloodGroup: input.bloodGroup,
    religion: input.religion,
    nationality: input.nationality,
    address: input.address,
    temporaryAddress: input.temporaryAddress,
    phone: input.phone,
    email: input.email,
    photoKey: input.photoKey,
    admissionDate: input.admissionDate ? fromDateString(input.admissionDate) : undefined,
    previousSchool: input.previousSchool,
    medicalNotes: input.medicalNotes,
  } as Omit<Prisma.StudentUncheckedCreateInput, "schoolId" | "admissionNo">;
}

function fullName(s: { firstName: string; middleName: string | null; lastName: string }) {
  return [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ");
}

function pickChanged(before: Record<string, unknown>, input: Record<string, unknown>) {
  return Object.fromEntries(Object.keys(input).map((key) => [key, before[key] instanceof Date ? toDateString(before[key] as Date) : before[key]]));
}
