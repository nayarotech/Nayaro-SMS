import { badRequest, forbidden, notFound } from "../../lib/errors.js";
import { formatBsLong, fromDateString, toDateString, todayInNepal } from "../../lib/nepali-date.js";
import { prisma } from "../../lib/prisma.js";
import { paginate } from "../../http/schemas.js";
import type { AuthContext } from "../../http/auth-context.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { resolveAcademicYear } from "../academic/academic-year.service.js";
import { subjectTakers } from "../academic/subject-choices.service.js";
import { sectionStudents } from "../attendance/attendance.service.js";
import { guardianUserIds, notifyUsers } from "../notifications/notification.service.js";
import type { HomeworkStatus } from "../../generated/prisma/client.js";
import { pairKey, scopeFilter, teachingScope, toAttachments, withUrls } from "./scope.service.js";

/**
 * Homework: a teacher posts it for a section and subject (several sections at
 * once), parents are notified, and after the due date the teacher ticks who did it.
 * Optional subjects only reach the students who take them.
 */

const homeworkInclude = {
  section: { include: { class: true } },
  subject: { select: { id: true, name: true } },
  teacher: { select: { id: true, fullName: true } },
  _count: { select: { checks: true } },
} as const;

type HomeworkRow = Awaited<ReturnType<typeof findHomework>>;

function toDto(h: HomeworkRow, extra: { students?: number; canManage?: boolean } = {}) {
  return {
    id: h.id,
    section: { id: h.section.id, name: h.section.name, classId: h.section.classId, className: h.section.class.name },
    subject: h.subject,
    teacher: h.teacher,
    title: h.title,
    description: h.description,
    assignedDate: toDateString(h.assignedDate),
    dueDate: toDateString(h.dueDate),
    attachments: withUrls(h.attachments),
    checked: h._count.checks,
    createdAt: h.createdAt,
    ...extra,
  };
}

async function findHomework(schoolId: string, id: string) {
  const homework = await prisma.homework.findFirst({ where: { id, schoolId }, include: homeworkInclude });
  if (!homework) throw notFound("Homework");
  return homework;
}

/** Students of the section who take the subject (all of them unless it's optional). */
async function homeworkStudents(sectionId: string, classId: string, subjectId: string, academicYearId: string) {
  const [students, takes] = await Promise.all([sectionStudents(sectionId, academicYearId), subjectTakers(classId, academicYearId)]);
  return students.filter((s) => takes(s.studentId, subjectId));
}

/** The teacher it belongs to, the poster, or a coordinator can change it. */
async function assertCanManage(auth: AuthContext, homework: HomeworkRow) {
  if (auth.permissions.has("homework.post_on_behalf")) return;
  if (homework.teacherId === auth.userId) return;
  const scope = await teachingScope(auth, homework.academicYearId);
  if (!auth.permissions.has("homework.post") || !scope.pairs.has(pairKey(homework.sectionId, homework.subjectId))) {
    throw forbidden("Only the subject teacher or class teacher can change this homework");
  }
}

// ─── Posting form ────────────────────────────────────────────

/** Sections and subjects the user may post to (and teachers, for coordinators). */
export async function postingOptions(auth: AuthContext, schoolId: string) {
  const year = await resolveAcademicYear(schoolId);
  const scope = await teachingScope(auth, year.id);
  const classes = await prisma.schoolClass.findMany({
    where: { schoolId },
    orderBy: { order: "asc" },
    include: { sections: { orderBy: { name: "asc" } }, subjects: { include: { subject: { select: { id: true, name: true } } } } },
  });
  const options = classes
    .map((c) => ({
      id: c.id,
      name: c.name,
      subjects: c.subjects
        .map((cs) => ({
          id: cs.subject.id,
          name: cs.subject.name,
          sectionIds: c.sections.filter((s) => scope.all || scope.pairs.has(pairKey(s.id, cs.subjectId))).map((s) => s.id),
        }))
        .filter((s) => s.sectionIds.length)
        .sort((a, b) => a.name.localeCompare(b.name)),
      sections: c.sections.map((s) => ({ id: s.id, name: s.name })),
    }))
    .filter((c) => c.subjects.length);

  const teachers = scope.all
    ? await prisma.user.findMany({
        where: { schoolId, isActive: true, subjectAssignments: { some: { academicYearId: year.id } } },
        select: { id: true, fullName: true },
        orderBy: { fullName: "asc" },
      })
    : [];
  return { academicYear: { id: year.id, name: year.name }, onBehalf: scope.all, classes: options, teachers };
}

// ─── Staff: list, post, edit ─────────────────────────────────

export interface ListHomeworkQuery {
  sectionId?: string;
  subjectId?: string;
  classId?: string;
  /** Only homework of this teacher */
  mine?: boolean;
  page: number;
  pageSize: number;
}

export async function listHomework(auth: AuthContext, schoolId: string, query: ListHomeworkQuery) {
  const year = await resolveAcademicYear(schoolId);
  const scope = await teachingScope(auth, year.id);
  const seeAll = scope.all || auth.permissions.has("student.record.view");
  const where = {
    schoolId,
    academicYearId: year.id,
    ...(seeAll && !query.mine ? {} : query.mine ? { teacherId: auth.userId } : scopeFilter(scope, auth.userId)),
    ...(query.sectionId && { sectionId: query.sectionId }),
    ...(query.subjectId && { subjectId: query.subjectId }),
    ...(query.classId && { section: { classId: query.classId } }),
  };
  const [rows, total] = await Promise.all([
    prisma.homework.findMany({ where, include: homeworkInclude, orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }], ...paginate(query.page, query.pageSize) }),
    prisma.homework.count({ where }),
  ]);

  // How many students each homework is for (optional subjects count only their takers)
  const counts = new Map<string, number>();
  for (const h of rows) counts.set(h.id, (await homeworkStudents(h.sectionId, h.section.classId, h.subjectId, h.academicYearId)).length);
  const items = rows.map((h) => toDto(h, { students: counts.get(h.id), canManage: scope.all || h.teacherId === auth.userId || scope.pairs.has(pairKey(h.sectionId, h.subjectId)) }));
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export interface HomeworkInput {
  sectionIds: string[];
  subjectId: string;
  title: string;
  description?: string | null;
  assignedDate?: string;
  dueDate: string;
  attachments?: string[];
  /** Coordinators: the teacher it's posted for */
  teacherId?: string;
}

export async function postHomework(auth: AuthContext, actor: Actor, input: HomeworkInput) {
  const year = await resolveAcademicYear(actor.schoolId);
  const scope = await teachingScope(auth, year.id);
  const assignedDate = input.assignedDate ?? todayInNepal();
  if (input.dueDate < assignedDate) throw badRequest("The due date can't be before the day it's given", { fieldErrors: { dueDate: ["Before the given date"] } });

  const sections = await prisma.section.findMany({ where: { schoolId: actor.schoolId, id: { in: input.sectionIds } }, include: { class: { include: { subjects: true } } } });
  if (sections.length !== new Set(input.sectionIds).size) throw notFound("Section");
  for (const section of sections) {
    if (!section.class.subjects.some((cs) => cs.subjectId === input.subjectId)) throw badRequest(`${section.class.name} doesn't study this subject`);
    if (!scope.all && !scope.pairs.has(pairKey(section.id, input.subjectId))) throw forbidden(`You don't teach this subject in ${section.class.name} ${section.name}`);
  }

  let teacherId = actor.userId;
  if (input.teacherId && input.teacherId !== actor.userId) {
    if (!scope.all) throw forbidden("Only coordinators can post homework for another teacher");
    const teacher = await prisma.user.findFirst({ where: { id: input.teacherId, schoolId: actor.schoolId, isActive: true } });
    if (!teacher) throw badRequest("Teacher not found");
    teacherId = teacher.id;
  }
  const attachments = await toAttachments(actor.schoolId, input.attachments ?? []);

  const created = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const section of sections) {
      rows.push(
        await tx.homework.create({
          data: {
            schoolId: actor.schoolId,
            academicYearId: year.id,
            sectionId: section.id,
            subjectId: input.subjectId,
            title: input.title,
            description: input.description ?? null,
            assignedDate: fromDateString(assignedDate),
            dueDate: fromDateString(input.dueDate),
            attachments: attachments as unknown as object,
            teacherId,
            postedById: actor.userId,
          },
        }),
      );
    }
    await recordAudit(actor, { action: "homework.post", entityType: "Homework", entityId: rows[0].id, newValue: { title: input.title, sections: sections.map((s) => s.id), subjectId: input.subjectId, dueDate: input.dueDate, teacherId } }, tx);
    return rows;
  });

  // Tell the parents of students who take the subject
  const subject = await prisma.subject.findUniqueOrThrow({ where: { id: input.subjectId } });
  for (const section of sections) {
    const students = await homeworkStudents(section.id, section.classId, input.subjectId, year.id);
    const parents = await guardianUserIds(students.map((s) => s.studentId));
    const homework = created.find((h) => h.sectionId === section.id)!;
    for (const student of students) {
      await notifyUsers(actor.schoolId, parents.get(student.studentId) ?? [], {
        type: "homework.posted",
        title: `${subject.name} homework for ${student.firstName}`,
        body: `${input.title} — due ${formatBsLong(input.dueDate)}`,
        data: { studentId: student.studentId, homeworkId: homework.id },
      });
    }
  }
  return Promise.all(created.map(async (h) => toDto(await findHomework(actor.schoolId, h.id), { canManage: true })));
}

export async function updateHomework(auth: AuthContext, actor: Actor, id: string, input: Partial<Pick<HomeworkInput, "title" | "description" | "dueDate" | "attachments">>) {
  const before = await findHomework(actor.schoolId, id);
  await assertCanManage(auth, before);
  if (input.dueDate && input.dueDate < toDateString(before.assignedDate)!) throw badRequest("The due date can't be before the day it was given");
  const attachments = input.attachments ? await toAttachments(actor.schoolId, input.attachments) : undefined;
  await prisma.$transaction(async (tx) => {
    await tx.homework.update({
      where: { id },
      data: { title: input.title, description: input.description, dueDate: input.dueDate ? fromDateString(input.dueDate) : undefined, attachments: attachments as unknown as object | undefined },
    });
    await recordAudit(actor, { action: "homework.update", entityType: "Homework", entityId: id, oldValue: { title: before.title, dueDate: toDateString(before.dueDate) }, newValue: input }, tx);
  });
  return toDto(await findHomework(actor.schoolId, id), { canManage: true });
}

export async function deleteHomework(auth: AuthContext, actor: Actor, id: string) {
  const before = await findHomework(actor.schoolId, id);
  await assertCanManage(auth, before);
  await prisma.$transaction(async (tx) => {
    await tx.homework.delete({ where: { id } });
    await recordAudit(actor, { action: "homework.delete", entityType: "Homework", entityId: id, oldValue: { title: before.title, section: before.sectionId, subject: before.subject.name } }, tx);
  });
}

// ─── Checking who did it ─────────────────────────────────────

export async function getChecks(auth: AuthContext, schoolId: string, id: string) {
  const homework = await findHomework(schoolId, id);
  await assertCanManage(auth, homework);
  const [students, checks] = await Promise.all([
    homeworkStudents(homework.sectionId, homework.section.classId, homework.subjectId, homework.academicYearId),
    prisma.homeworkCheck.findMany({ where: { homeworkId: id } }),
  ]);
  return {
    homework: toDto(homework, { canManage: true }),
    students: students.map((s) => {
      const check = checks.find((c) => c.studentId === s.studentId);
      return { studentId: s.studentId, name: s.name, rollNo: s.rollNo, photoUrl: s.photoUrl, status: check?.status ?? null, remark: check?.remark ?? null };
    }),
  };
}

export async function saveChecks(auth: AuthContext, actor: Actor, id: string, checks: { studentId: string; status: HomeworkStatus | null; remark?: string | null }[]) {
  const homework = await findHomework(actor.schoolId, id);
  await assertCanManage(auth, homework);
  const students = await homeworkStudents(homework.sectionId, homework.section.classId, homework.subjectId, homework.academicYearId);
  const allowed = new Set(students.map((s) => s.studentId));
  if (checks.some((c) => !allowed.has(c.studentId))) throw badRequest("A student isn't in this homework's class or doesn't take the subject");

  const before = await prisma.homeworkCheck.findMany({ where: { homeworkId: id } });
  await prisma.$transaction(async (tx) => {
    for (const c of checks) {
      if (c.status === null) await tx.homeworkCheck.deleteMany({ where: { homeworkId: id, studentId: c.studentId } });
      else {
        await tx.homeworkCheck.upsert({
          where: { homeworkId_studentId: { homeworkId: id, studentId: c.studentId } },
          create: { homeworkId: id, studentId: c.studentId, status: c.status, remark: c.remark ?? null, checkedById: actor.userId },
          update: { status: c.status, remark: c.remark ?? null, checkedById: actor.userId },
        });
      }
    }
    await recordAudit(actor, { action: "homework.check", entityType: "Homework", entityId: id, newValue: { checks: checks.length } }, tx);
  });

  // Parents hear when homework wasn't done (only the first time it's marked so)
  const newlyNotDone = checks.filter((c) => c.status === "NOT_DONE" && before.find((b) => b.studentId === c.studentId)?.status !== "NOT_DONE");
  if (newlyNotDone.length) {
    const parents = await guardianUserIds(newlyNotDone.map((c) => c.studentId));
    for (const c of newlyNotDone) {
      const student = students.find((s) => s.studentId === c.studentId)!;
      await notifyUsers(actor.schoolId, parents.get(c.studentId) ?? [], {
        type: "homework.not_done",
        title: `${student.firstName} didn't complete ${homework.subject.name} homework`,
        body: `${homework.title}${c.remark ? ` — ${c.remark}` : ""}`,
        data: { studentId: c.studentId, homeworkId: id },
      });
    }
  }
  return getChecks(auth, actor.schoolId, id);
}

// ─── Parent app ──────────────────────────────────────────────

/** A child's homework: upcoming (due today or later) or past, with whether they did it. */
export async function childHomework(schoolId: string, studentId: string, when: "upcoming" | "past") {
  const enrollment = await prisma.enrollment.findFirst({ where: { studentId, schoolId, academicYear: { isCurrent: true } }, include: { section: true } });
  if (!enrollment) return [];
  const takes = await subjectTakers(enrollment.classId, enrollment.academicYearId);
  const today = fromDateString(todayInNepal());
  const rows = await prisma.homework.findMany({
    where: { schoolId, sectionId: enrollment.sectionId, academicYearId: enrollment.academicYearId, dueDate: when === "upcoming" ? { gte: today } : { lt: today } },
    include: { subject: { select: { id: true, name: true } }, teacher: { select: { fullName: true } }, checks: { where: { studentId } } },
    orderBy: when === "upcoming" ? [{ dueDate: "asc" }, { createdAt: "asc" }] : [{ dueDate: "desc" }],
    take: 60,
  });
  return rows
    .filter((h) => takes(studentId, h.subjectId))
    .map((h) => ({
      id: h.id,
      subject: h.subject,
      teacher: h.teacher.fullName,
      title: h.title,
      description: h.description,
      assignedDate: toDateString(h.assignedDate),
      dueDate: toDateString(h.dueDate),
      dueDateBs: formatBsLong(toDateString(h.dueDate)!),
      attachments: withUrls(h.attachments),
      status: h.checks[0]?.status ?? null,
      remark: h.checks[0]?.remark ?? null,
    }));
}
