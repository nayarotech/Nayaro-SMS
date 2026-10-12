import { badRequest, forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthContext } from "../../http/auth-context.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { sectionStudents } from "../attendance/attendance.service.js";
import { findSection } from "../academic/class.service.js";
import { subjectTakers } from "../academic/subject-choices.service.js";
import { guardianUserIds, notifyUsers } from "../notifications/notification.service.js";
import { findExam } from "./exam.service.js";
import type { MarkSheetStatus, MarkStatus } from "../../generated/prisma/client.js";

/**
 * Mark sheets: one subject, one section, one exam.
 *
 *   DRAFT ──submit──▶ SUBMITTED ──verify──▶ VERIFIED ──publish (whole class)──▶ PUBLISHED
 *     ▲                   │                    │
 *     └──────return───────┴────────────────────┘
 *
 * - Subject teachers enter marks only for subjects/sections assigned to them, while DRAFT.
 * - Exam managers can enter any sheet until it's verified.
 * - Verifiers (principal/admin) check, return or verify; once verified or published,
 *   changes need "marks.edit_published". Every change is audit-logged.
 */

export interface SheetAccess {
  canView: boolean;
  canEdit: boolean;
  canSubmit: boolean;
  canVerify: boolean;
  canReturn: boolean;
  reason: string | null;
}

async function isAssignedTeacher(auth: AuthContext, academicYearId: string, sectionId: string, subjectId: string) {
  return Boolean(await prisma.subjectAssignment.findFirst({ where: { academicYearId, sectionId, subjectId, teacherId: auth.userId } }));
}

export async function sheetAccess(auth: AuthContext, academicYearId: string, sectionId: string, subjectId: string, status: MarkSheetStatus): Promise<SheetAccess> {
  const has = (p: string) => auth.permissions.has(p);
  const assigned = (await isAssignedTeacher(auth, academicYearId, sectionId, subjectId)) && has("marks.enter");
  const manager = has("exam.manage");
  const verifier = has("marks.verify");
  const isClassTeacher = Boolean(await prisma.classTeacherAssignment.findFirst({ where: { academicYearId, sectionId, teacherId: auth.userId } }));

  const canView = assigned || manager || verifier || has("marks.publish") || isClassTeacher;
  const canEdit =
    status === "DRAFT" ? assigned || manager : status === "SUBMITTED" ? manager || verifier : has("marks.edit_published");

  let reason: string | null = null;
  if (!canEdit) {
    reason =
      status === "DRAFT"
        ? "Only the subject teacher assigned to this section can enter these marks"
        : status === "SUBMITTED"
          ? "Submitted for checking — ask the principal to return it if you need to change something"
          : "Marks are locked after verification";
  }

  return {
    canView,
    canEdit,
    canSubmit: status === "DRAFT" && (assigned || manager),
    canVerify: status === "SUBMITTED" && verifier,
    canReturn: (status === "SUBMITTED" || status === "VERIFIED") && verifier,
    reason,
  };
}

/** Every subject × section that needs marks in an exam (only the user's own, for teachers). */
export async function listSheets(auth: AuthContext, schoolId: string, examId: string, classId?: string) {
  const exam = await findExam(schoolId, examId);
  const seeAll = ["exam.manage", "marks.verify", "marks.publish"].some((p) => auth.permissions.has(p));

  const examSubjects = await prisma.examSubject.findMany({
    where: { examId, ...(classId && { classId }) },
    include: { subject: true, class: { include: { sections: { orderBy: { name: "asc" } } } } },
    orderBy: [{ class: { order: "asc" } }, { subject: { name: "asc" } }],
  });
  const [sheets, assignments, enrollments] = await Promise.all([
    prisma.markSheet.findMany({ where: { examId }, include: { _count: { select: { marks: true } } } }),
    prisma.subjectAssignment.findMany({ where: { academicYearId: exam.academicYearId }, include: { teacher: { select: { id: true, fullName: true } } } }),
    prisma.enrollment.findMany({ where: { academicYearId: exam.academicYearId, status: { notIn: ["LEFT", "TRANSFERRED"] } }, select: { studentId: true, sectionId: true, classId: true } }),
  ]);
  // Optional subjects only count the students who chose them
  const takers = new Map(await Promise.all([...new Set(examSubjects.map((es) => es.classId))].map(async (id) => [id, await subjectTakers(id, exam.academicYearId)] as const)));
  const studentsTaking = (classId: string, sectionId: string, subjectId: string) =>
    enrollments.filter((e) => e.sectionId === sectionId && takers.get(classId)!(e.studentId, subjectId)).length;

  const rows = examSubjects.flatMap((es) =>
    es.class.sections.map((section) => {
      const sheet = sheets.find((s) => s.sectionId === section.id && s.subjectId === es.subjectId);
      const teachers = assignments.filter((a) => a.sectionId === section.id && a.subjectId === es.subjectId).map((a) => a.teacher);
      return {
        classId: es.classId,
        className: es.class.name,
        sectionId: section.id,
        sectionName: section.name,
        subjectId: es.subjectId,
        subjectName: es.subject.name,
        teachers,
        status: sheet?.status ?? ("DRAFT" as MarkSheetStatus),
        entered: sheet?._count.marks ?? 0,
        students: studentsTaking(es.classId, section.id, es.subjectId),
        returnNote: sheet?.returnNote ?? null,
        mine: teachers.some((t) => t.id === auth.userId),
      };
    }),
  );
  return { exam: { id: exam.id, name: exam.name, academicYear: exam.academicYear.name }, sheets: seeAll ? rows : rows.filter((r) => r.mine) };
}

/** The logged-in teacher's own mark sheets in every exam of the current year (mobile app). */
export async function myMarkSheets(auth: AuthContext, schoolId: string) {
  const year = await prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true } });
  if (!year) return { exams: [] };
  const exams = await prisma.exam.findMany({ where: { schoolId, academicYearId: year.id }, orderBy: [{ order: "desc" }, { createdAt: "desc" }] });
  const result = [];
  for (const exam of exams) {
    const { sheets } = await listSheets(auth, schoolId, exam.id);
    const mine = sheets.filter((s) => s.mine);
    if (mine.length) result.push({ id: exam.id, name: exam.name, startDate: exam.startDate, sheets: mine });
  }
  return { exams: result };
}

// ─── One sheet ───────────────────────────────────────────────

/** Students of the section who take this subject (all, unless it's an optional subject). */
async function sheetStudents(classId: string, sectionId: string, subjectId: string, academicYearId: string) {
  const [students, takes] = await Promise.all([sectionStudents(sectionId, academicYearId), subjectTakers(classId, academicYearId)]);
  return students.filter((s) => takes(s.studentId, subjectId));
}

async function loadSheetContext(schoolId: string, examId: string, sectionId: string, subjectId: string) {
  const exam = await findExam(schoolId, examId);
  const section = await findSection(schoolId, sectionId);
  const config = await prisma.examSubject.findUnique({
    where: { examId_classId_subjectId: { examId, classId: section.classId, subjectId } },
    include: { subject: true },
  });
  if (!config) throw notFound("This subject isn't part of the exam for this class");
  const sheet = await prisma.markSheet.findUnique({ where: { examId_sectionId_subjectId: { examId, sectionId, subjectId } }, include: { marks: true } });
  return { exam, section, config, sheet };
}

export async function getSheet(auth: AuthContext, schoolId: string, examId: string, sectionId: string, subjectId: string) {
  const { exam, section, config, sheet } = await loadSheetContext(schoolId, examId, sectionId, subjectId);
  const status = sheet?.status ?? "DRAFT";
  const access = await sheetAccess(auth, exam.academicYearId, sectionId, subjectId, status);
  if (!access.canView) throw forbidden("You can't see these marks");

  const marks = new Map(sheet?.marks.map((m) => [m.studentId, m]) ?? []);
  const people = await prisma.user.findMany({
    where: { id: { in: [sheet?.submittedById, sheet?.verifiedById, sheet?.publishedById].filter((id): id is string => Boolean(id)) } },
    select: { id: true, fullName: true },
  });
  const nameOf = (id: string | null | undefined) => people.find((p) => p.id === id)?.fullName ?? null;

  return {
    exam: { id: exam.id, name: exam.name },
    section: { id: section.id, label: `${section.class.name} ${section.name}` },
    subject: {
      id: config.subjectId,
      name: config.subject.name,
      theoryFullMarks: config.theoryFullMarks,
      theoryPassMarks: config.theoryPassMarks,
      practicalFullMarks: config.practicalFullMarks,
      practicalPassMarks: config.practicalPassMarks,
      creditHours: config.creditHours,
    },
    status,
    returnNote: sheet?.returnNote ?? null,
    history: {
      submitted: sheet?.submittedAt ? { by: nameOf(sheet.submittedById), at: sheet.submittedAt } : null,
      verified: sheet?.verifiedAt ? { by: nameOf(sheet.verifiedById), at: sheet.verifiedAt } : null,
      published: sheet?.publishedAt ? { by: nameOf(sheet.publishedById), at: sheet.publishedAt } : null,
    },
    access,
    students: (await sheetStudents(section.classId, sectionId, subjectId, exam.academicYearId)).map((s) => {
      const mark = marks.get(s.studentId);
      return { studentId: s.studentId, name: s.name, rollNo: s.rollNo, theory: mark?.theory ?? null, practical: mark?.practical ?? null, status: mark?.status ?? "PRESENT" };
    }),
    updatedAt: sheet?.updatedAt ?? null,
  };
}

export interface MarkEntry {
  studentId: string;
  theory: number | null;
  practical: number | null;
  status: MarkStatus;
}

/** Saves some or all marks on a sheet (the grid autosaves changed rows). */
export async function saveMarks(auth: AuthContext, actor: Actor, examId: string, sectionId: string, subjectId: string, entries: MarkEntry[]) {
  const { exam, section, config, sheet } = await loadSheetContext(actor.schoolId, examId, sectionId, subjectId);
  const status = sheet?.status ?? "DRAFT";
  const access = await sheetAccess(auth, exam.academicYearId, sectionId, subjectId, status);
  if (!access.canEdit) throw forbidden(access.reason ?? "You can't change these marks");

  const enrolled = new Set((await sheetStudents(section.classId, sectionId, subjectId, exam.academicYearId)).map((s) => s.studentId));
  const errors: Record<string, string[]> = {};
  for (const [index, entry] of entries.entries()) {
    if (!enrolled.has(entry.studentId)) throw badRequest("A student isn't in this section or doesn't take this subject");
    const problems = validateEntry(entry, config);
    if (problems) errors[`marks.${index}`] = [problems];
  }
  if (Object.keys(errors).length) throw badRequest("Some marks are not valid", { fieldErrors: errors });

  const before = new Map(sheet?.marks.map((m) => [m.studentId, m]) ?? []);
  const changes = entries.filter((e) => {
    const old = before.get(e.studentId);
    return !old || old.theory !== e.theory || old.practical !== e.practical || old.status !== e.status;
  });
  if (!changes.length) return { saved: 0, updatedAt: sheet?.updatedAt ?? null };

  const saved = await prisma.$transaction(async (tx) => {
    const target = sheet ?? (await tx.markSheet.create({ data: { schoolId: actor.schoolId, examId, sectionId, subjectId } }));
    for (const entry of changes) {
      const data = {
        theory: entry.status === "PRESENT" ? entry.theory : null,
        practical: entry.status === "PRESENT" && config.practicalFullMarks > 0 ? entry.practical : null,
        status: entry.status,
        updatedById: actor.userId,
      };
      await tx.mark.upsert({
        where: { markSheetId_studentId: { markSheetId: target.id, studentId: entry.studentId } },
        create: { schoolId: actor.schoolId, markSheetId: target.id, studentId: entry.studentId, ...data },
        update: data,
      });
    }
    const updated = await tx.markSheet.update({ where: { id: target.id }, data: { updatedAt: new Date() } });
    await recordAudit(
      actor,
      {
        action: status === "DRAFT" ? "marks.update" : "marks.update_locked",
        entityType: "MarkSheet",
        entityId: target.id,
        oldValue: Object.fromEntries(changes.map((c) => [c.studentId, before.has(c.studentId) ? pickMark(before.get(c.studentId)!) : null])),
        newValue: { status, changes: Object.fromEntries(changes.map((c) => [c.studentId, pickMark(c)])) },
      },
      tx,
    );
    return updated;
  });
  return { saved: changes.length, updatedAt: saved.updatedAt };
}

const pickMark = (m: { theory: number | null; practical: number | null; status: MarkStatus }) => ({ theory: m.theory, practical: m.practical, status: m.status });

function validateEntry(entry: MarkEntry, config: { theoryFullMarks: number; practicalFullMarks: number }): string | null {
  if (entry.status !== "PRESENT") return null;
  const check = (value: number | null, full: number, label: string) => {
    if (value === null) return null;
    if (!Number.isFinite(value) || value < 0) return `${label} can't be negative`;
    if (value > full) return `${label} can't be more than ${full}`;
    if (Math.round(value * 100) !== value * 100) return `${label} can have at most 2 decimal places`;
    return null;
  };
  if (config.practicalFullMarks === 0 && entry.practical !== null) return "This subject has no practical";
  return check(entry.theory, config.theoryFullMarks, "Theory") ?? check(entry.practical, config.practicalFullMarks, "Practical");
}

// ─── Workflow ────────────────────────────────────────────────

export async function submitSheet(auth: AuthContext, actor: Actor, examId: string, sectionId: string, subjectId: string) {
  const { exam, section, config, sheet } = await loadSheetContext(actor.schoolId, examId, sectionId, subjectId);
  const access = await sheetAccess(auth, exam.academicYearId, sectionId, subjectId, sheet?.status ?? "DRAFT");
  if (!access.canSubmit || !sheet) throw forbidden(sheet ? "This sheet can't be submitted now" : "Enter the marks first");

  const students = await sheetStudents(section.classId, sectionId, subjectId, exam.academicYearId);
  const complete = new Set(
    sheet.marks.filter((m) => m.status !== "PRESENT" || (m.theory !== null && (config.practicalFullMarks === 0 || m.practical !== null))).map((m) => m.studentId),
  );
  const missing = students.filter((s) => !complete.has(s.studentId));
  if (missing.length) throw badRequest(`Marks are missing for ${missing.length} student(s): ${missing.slice(0, 3).map((s) => s.name).join(", ")}${missing.length > 3 ? "…" : ""}`);

  await transition(actor, sheet.id, "SUBMITTED", { submittedById: actor.userId, submittedAt: new Date(), returnNote: null });
}

export async function verifySheet(auth: AuthContext, actor: Actor, examId: string, sectionId: string, subjectId: string) {
  const { exam, sheet } = await loadSheetContext(actor.schoolId, examId, sectionId, subjectId);
  const access = await sheetAccess(auth, exam.academicYearId, sectionId, subjectId, sheet?.status ?? "DRAFT");
  if (!access.canVerify || !sheet) throw forbidden("Only submitted sheets can be verified");
  await transition(actor, sheet.id, "VERIFIED", { verifiedById: actor.userId, verifiedAt: new Date() });
}

/** Verify every submitted sheet of an exam (optionally one class) in one go. */
export async function verifyAll(auth: AuthContext, actor: Actor, examId: string, classId?: string) {
  if (!auth.permissions.has("marks.verify")) throw forbidden("Only staff who verify marks can do this");
  await findExam(actor.schoolId, examId);
  const sheets = await prisma.markSheet.findMany({
    where: { examId, schoolId: actor.schoolId, status: "SUBMITTED", ...(classId && { section: { classId } }) },
    select: { id: true },
  });
  if (!sheets.length) return { verified: 0 };
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.markSheet.updateMany({ where: { id: { in: sheets.map((s) => s.id) }, status: "SUBMITTED" }, data: { status: "VERIFIED", verifiedById: actor.userId, verifiedAt: now } });
    await recordAudit(actor, { action: "marks.verify_all", entityType: "Exam", entityId: examId, newValue: { classId: classId ?? null, sheets: sheets.length } }, tx);
  });
  return { verified: sheets.length };
}

export async function returnSheet(auth: AuthContext, actor: Actor, examId: string, sectionId: string, subjectId: string, note: string) {
  const { exam, sheet } = await loadSheetContext(actor.schoolId, examId, sectionId, subjectId);
  const access = await sheetAccess(auth, exam.academicYearId, sectionId, subjectId, sheet?.status ?? "DRAFT");
  if (!access.canReturn || !sheet) throw forbidden("This sheet can't be returned");
  await transition(actor, sheet.id, "DRAFT", { returnNote: note, verifiedAt: null, verifiedById: null });

  // Let the subject teacher(s) know
  const teachers = await prisma.subjectAssignment.findMany({ where: { academicYearId: exam.academicYearId, sectionId, subjectId }, select: { teacherId: true } });
  const section = await findSection(actor.schoolId, sectionId);
  const subject = await prisma.subject.findUniqueOrThrow({ where: { id: subjectId } });
  await notifyUsers(actor.schoolId, teachers.map((t) => t.teacherId), {
    type: "marks.returned",
    title: `${subject.name} marks returned`,
    body: `${exam.name}, ${section.class.name} ${section.name}: ${note}`,
    data: { examId, sectionId, subjectId },
  });
}

async function transition(actor: Actor, sheetId: string, status: MarkSheetStatus, data: Record<string, unknown>) {
  const before = await prisma.markSheet.findUniqueOrThrow({ where: { id: sheetId } });
  await prisma.$transaction(async (tx) => {
    await tx.markSheet.update({ where: { id: sheetId }, data: { status, ...data } });
    await recordAudit(actor, { action: `marks.${status.toLowerCase()}`, entityType: "MarkSheet", entityId: sheetId, oldValue: { status: before.status }, newValue: { status, ...data } }, tx);
  });
}

/**
 * Publishes an exam's results for a whole class. Every subject of every section must
 * be verified first. Parents are notified and can then see results in the app.
 */
export async function publishClassResults(actor: Actor, examId: string, classId: string) {
  const exam = await findExam(actor.schoolId, examId);
  const [examSubjects, sections] = await Promise.all([
    prisma.examSubject.findMany({ where: { examId, classId }, include: { subject: true } }),
    prisma.section.findMany({ where: { classId, schoolId: actor.schoolId } }),
  ]);
  if (!examSubjects.length) throw badRequest("No subjects are set up for this class in this exam");

  const sheets = await prisma.markSheet.findMany({ where: { examId, sectionId: { in: sections.map((s) => s.id) } } });
  const notReady = sections.flatMap((section) =>
    examSubjects
      .filter((es) => !["VERIFIED", "PUBLISHED"].includes(sheets.find((s) => s.sectionId === section.id && s.subjectId === es.subjectId)?.status ?? "DRAFT"))
      .map((es) => `${section.name}: ${es.subject.name}`),
  );
  if (notReady.length) throw badRequest(`These marks aren't verified yet — ${notReady.slice(0, 6).join(", ")}${notReady.length > 6 ? "…" : ""}`);

  await prisma.$transaction(async (tx) => {
    await tx.markSheet.updateMany({
      where: { examId, sectionId: { in: sections.map((s) => s.id) }, status: "VERIFIED" },
      data: { status: "PUBLISHED", publishedById: actor.userId, publishedAt: new Date() },
    });
    await recordAudit(actor, { action: "marks.publish", entityType: "Exam", entityId: examId, newValue: { classId } }, tx);
  });

  const enrollments = await prisma.enrollment.findMany({
    where: { classId, academicYearId: exam.academicYearId, status: { notIn: ["LEFT", "TRANSFERRED"] } },
    include: { student: { select: { id: true, firstName: true } } },
  });
  const parents = await guardianUserIds(enrollments.map((e) => e.studentId));
  for (const { student } of enrollments) {
    await notifyUsers(actor.schoolId, parents.get(student.id) ?? [], {
      type: "results.published",
      title: `${exam.name} results are out`,
      body: `${student.firstName}'s results for ${exam.name} are now available.`,
      data: { studentId: student.id, examId },
    });
  }
}
