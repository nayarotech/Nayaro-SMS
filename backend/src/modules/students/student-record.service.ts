import { forbidden, notFound } from "../../lib/errors.js";
import { formatBsLong, fromDateString, toDateString } from "../../lib/nepali-date.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthContext } from "../../http/auth-context.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { attendanceBetween } from "../attendance/attendance-reports.service.js";
import { computeResults, isPublished } from "../exams/results.service.js";
import { guardianUserIds, notifyUsers } from "../notifications/notification.service.js";
import { promotionHistory } from "../promotions/promotion.service.js";
import { getSchoolSettings } from "../settings/settings.service.js";
import type { StudentNoteCategory } from "../../generated/prisma/client.js";

/**
 * The student 360° profile: every year's class, attendance and exam results,
 * how each year ended, report card remarks, and notes from staff
 * (achievements, discipline, counselling, health).
 *
 * Who can see it: `student.record.view`, or the student's class teacher this year.
 * Who can add notes: `student.notes.manage`, or the student's class teacher this year.
 */

export async function isClassTeacherOf(userId: string, studentId: string): Promise<boolean> {
  const enrollment = await prisma.enrollment.findFirst({ where: { studentId, academicYear: { isCurrent: true } }, select: { sectionId: true, academicYearId: true } });
  if (!enrollment) return false;
  const assignment = await prisma.classTeacherAssignment.findFirst({ where: { teacherId: userId, sectionId: enrollment.sectionId, academicYearId: enrollment.academicYearId } });
  return Boolean(assignment);
}

/** What the logged-in staff member may do with this student's record. */
export async function recordAccess(auth: AuthContext, studentId: string) {
  const record = auth.permissions.has("student.record.view");
  const manageNotes = auth.permissions.has("student.notes.manage");
  const classTeacher = record && manageNotes ? false : await isClassTeacherOf(auth.userId, studentId);
  return { record: record || classTeacher, notes: record || manageNotes || classTeacher, addNotes: manageNotes || classTeacher, manageNotes };
}

async function findStudent(schoolId: string, studentId: string) {
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId }, select: { id: true, firstName: true } });
  if (!student) throw notFound("Student");
  return student;
}

// ─── 360° record ─────────────────────────────────────────────

export async function studentRecord(auth: AuthContext, schoolId: string, studentId: string) {
  await findStudent(schoolId, studentId);
  const access = await recordAccess(auth, studentId);
  if (!access.record) throw forbidden("Only the class teacher and staff who can view full student records can see this");

  const [enrollments, settings, promotions, remarks, notes] = await Promise.all([
    prisma.enrollment.findMany({
      where: { studentId, schoolId },
      include: { academicYear: true, class: true, section: true },
      orderBy: { academicYear: { startDate: "asc" } },
    }),
    getSchoolSettings(schoolId),
    promotionHistory(studentId),
    prisma.reportCardRemark.findMany({ where: { studentId }, select: { examId: true, remark: true } }),
    prisma.studentNote.groupBy({ by: ["category"], where: { studentId }, _count: { _all: true } }),
  ]);
  const late = Boolean(settings["attendance.lateCountsAsPresent"]);

  const years = [];
  for (const e of enrollments) {
    const [attendance, exams] = await Promise.all([
      attendanceBetween([studentId], e.academicYear.startDate, e.academicYear.endDate, late),
      prisma.exam.findMany({ where: { academicYearId: e.academicYearId, subjects: { some: { classId: e.classId } } }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    ]);

    const examResults = [];
    for (const exam of exams) {
      const data = await computeResults(schoolId, exam.id, e.classId, { studentIds: [studentId] });
      const row = data.students[0];
      if (!row) continue;
      examResults.push({
        examId: exam.id,
        name: exam.name,
        published: await isPublished(exam.id, e.classId),
        gpa: row.result.gpa,
        grade: row.result.grade,
        result: row.result.result,
        percentage: row.result.percentage,
        totalObtained: row.result.totalObtained,
        totalFull: row.result.totalFull,
        sectionRank: row.sectionRank,
        classRank: row.classRank,
        studentsInClass: data.class.studentsInClass,
        remark: remarks.find((r) => r.examId === exam.id)?.remark ?? null,
        subjects: row.result.subjects.map((s) => ({ subjectId: s.subjectId, name: s.subjectName, obtained: s.obtained, fullMarks: s.fullMarks, percentage: s.percentage, grade: s.grade, outcome: s.outcome })),
      });
    }

    const att = attendance.get(studentId)!;
    years.push({
      academicYear: { id: e.academicYear.id, name: e.academicYear.name, isCurrent: e.academicYear.isCurrent },
      enrollmentId: e.id,
      class: { id: e.class.id, name: e.class.name },
      section: { id: e.section.id, name: e.section.name },
      rollNo: e.rollNo,
      status: e.status,
      remarks: e.remarks,
      attendance: { present: att.present, absent: att.absent, late: att.late, leave: att.leave, total: att.total, percent: att.percent },
      exams: examResults,
    });
  }

  return {
    access,
    years: years.reverse(),
    promotions,
    notes: Object.fromEntries(notes.map((n) => [n.category, n._count._all])) as Partial<Record<StudentNoteCategory, number>>,
  };
}

// ─── Notes ───────────────────────────────────────────────────

export interface NoteInput {
  category: StudentNoteCategory;
  title: string;
  body?: string | null;
  date: string;
  sharedWithParents?: boolean;
}

const CATEGORY_LABEL: Record<StudentNoteCategory, string> = {
  ACHIEVEMENT: "Achievement",
  DISCIPLINE: "Discipline",
  COUNSELLING: "Counselling",
  HEALTH: "Health",
  GENERAL: "Note",
};

function toNoteDto(note: { id: string; category: StudentNoteCategory; title: string; body: string | null; date: Date; sharedWithParents: boolean; authorId: string; createdAt: Date; updatedAt: Date; author: { fullName: string } }, userId?: string, manageNotes = false) {
  return {
    id: note.id,
    category: note.category,
    title: note.title,
    body: note.body,
    date: toDateString(note.date),
    sharedWithParents: note.sharedWithParents,
    author: note.author.fullName,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    canEdit: manageNotes || note.authorId === userId,
  };
}

export async function listNotes(auth: AuthContext, schoolId: string, studentId: string, category?: StudentNoteCategory) {
  await findStudent(schoolId, studentId);
  const access = await recordAccess(auth, studentId);
  if (!access.notes) throw forbidden("You can't see this student's notes");
  const notes = await prisma.studentNote.findMany({
    where: { studentId, schoolId, ...(category && { category }) },
    include: { author: { select: { fullName: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  return { canAdd: access.addNotes, items: notes.map((n) => toNoteDto(n, auth.userId, access.manageNotes)) };
}

export async function createNote(auth: AuthContext, actor: Actor, studentId: string, input: NoteInput) {
  const student = await findStudent(actor.schoolId, studentId);
  const access = await recordAccess(auth, studentId);
  if (!access.addNotes) throw forbidden("Only the class teacher or staff who manage student notes can add notes");

  const note = await prisma.$transaction(async (tx) => {
    const created = await tx.studentNote.create({
      data: {
        schoolId: actor.schoolId,
        studentId,
        category: input.category,
        title: input.title,
        body: input.body ?? null,
        date: fromDateString(input.date),
        sharedWithParents: Boolean(input.sharedWithParents),
        authorId: actor.userId,
      },
      include: { author: { select: { fullName: true } } },
    });
    await recordAudit(actor, { action: "student.note.add", entityType: "Student", entityId: studentId, newValue: { noteId: created.id, category: input.category, title: input.title, shared: created.sharedWithParents } }, tx);
    return created;
  });

  if (note.sharedWithParents) await notifyParentsOfNote(actor.schoolId, studentId, student.firstName, note);
  return toNoteDto(note, auth.userId, access.manageNotes);
}

export async function updateNote(auth: AuthContext, actor: Actor, studentId: string, noteId: string, input: Partial<NoteInput>) {
  const { before, access, student } = await findEditableNote(auth, actor.schoolId, studentId, noteId);
  const note = await prisma.$transaction(async (tx) => {
    const updated = await tx.studentNote.update({
      where: { id: noteId },
      data: { category: input.category, title: input.title, body: input.body, date: input.date ? fromDateString(input.date) : undefined, sharedWithParents: input.sharedWithParents },
      include: { author: { select: { fullName: true } } },
    });
    await recordAudit(
      actor,
      { action: "student.note.update", entityType: "Student", entityId: studentId, oldValue: { noteId, title: before.title, body: before.body, category: before.category, shared: before.sharedWithParents }, newValue: input },
      tx,
    );
    return updated;
  });
  // Parents hear about a note the first time it's shared with them
  if (note.sharedWithParents && !before.sharedWithParents) await notifyParentsOfNote(actor.schoolId, studentId, student.firstName, note);
  return toNoteDto(note, auth.userId, access.manageNotes);
}

export async function deleteNote(auth: AuthContext, actor: Actor, studentId: string, noteId: string) {
  const { before } = await findEditableNote(auth, actor.schoolId, studentId, noteId);
  await prisma.$transaction(async (tx) => {
    await tx.studentNote.delete({ where: { id: noteId } });
    await recordAudit(actor, { action: "student.note.delete", entityType: "Student", entityId: studentId, oldValue: { noteId, category: before.category, title: before.title, body: before.body } }, tx);
  });
}

async function findEditableNote(auth: AuthContext, schoolId: string, studentId: string, noteId: string) {
  const student = await findStudent(schoolId, studentId);
  const before = await prisma.studentNote.findFirst({ where: { id: noteId, studentId, schoolId } });
  if (!before) throw notFound("Note");
  const access = await recordAccess(auth, studentId);
  if (!access.manageNotes && before.authorId !== auth.userId) throw forbidden("Only the author can change this note");
  return { before, access, student };
}

async function notifyParentsOfNote(schoolId: string, studentId: string, firstName: string, note: { id: string; category: StudentNoteCategory; title: string }) {
  const parents = await guardianUserIds([studentId]);
  await notifyUsers(schoolId, parents.get(studentId) ?? [], {
    type: "student.note",
    title: note.category === "ACHIEVEMENT" ? `🎉 ${firstName}: ${note.title}` : `${CATEGORY_LABEL[note.category]} about ${firstName}: ${note.title}`,
    body: "Open the app to read the note from school.",
    data: { studentId, noteId: note.id },
  });
}

/** Parent app: notes the school chose to share. */
export async function sharedNotes(schoolId: string, studentId: string) {
  const notes = await prisma.studentNote.findMany({
    where: { studentId, schoolId, sharedWithParents: true },
    include: { author: { select: { fullName: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  return notes.map((n) => ({ id: n.id, category: n.category, title: n.title, body: n.body, date: toDateString(n.date), dateBs: formatBsLong(toDateString(n.date)), author: n.author.fullName }));
}
