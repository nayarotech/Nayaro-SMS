import { badRequest, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { resolveAcademicYear } from "./academic-year.service.js";
import { findSection } from "./class.service.js";

/**
 * Who teaches what, per academic year:
 * - one Class Teacher per section
 * - subject teachers per section + subject (a subject can have more than one teacher)
 */

export async function getAssignments(schoolId: string, academicYearId?: string) {
  const year = await resolveAcademicYear(schoolId, academicYearId);

  const classes = await prisma.schoolClass.findMany({
    where: { schoolId },
    orderBy: { order: "asc" },
    include: {
      subjects: { include: { subject: { select: { id: true, name: true } } } },
      sections: {
        orderBy: { name: "asc" },
        include: {
          classTeachers: { where: { academicYearId: year.id }, include: { teacher: { select: { id: true, fullName: true } } } },
          subjectAssignments: {
            where: { academicYearId: year.id },
            include: { teacher: { select: { id: true, fullName: true } } },
          },
        },
      },
    },
  });

  return {
    academicYear: { id: year.id, name: year.name },
    classes: classes.map((c) => ({
      id: c.id,
      name: c.name,
      sections: c.sections.map((s) => ({
        id: s.id,
        name: s.name,
        classTeacher: s.classTeachers[0]?.teacher ?? null,
        subjects: c.subjects
          .map((cs) => ({
            subjectId: cs.subject.id,
            subjectName: cs.subject.name,
            isOptional: cs.isOptional,
            teachers: s.subjectAssignments
              .filter((a) => a.subjectId === cs.subject.id)
              .map((a) => ({ assignmentId: a.id, id: a.teacher.id, fullName: a.teacher.fullName })),
          }))
          .sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
      })),
    })),
  };
}

/** Set (or clear with teacherId = null) the class teacher of a section. */
export async function setClassTeacher(actor: Actor, input: { academicYearId?: string; sectionId: string; teacherId: string | null }) {
  const year = await resolveAcademicYear(actor.schoolId, input.academicYearId);
  await findSection(actor.schoolId, input.sectionId);
  if (input.teacherId) await assertTeacher(actor.schoolId, input.teacherId);

  const key = { academicYearId_sectionId: { academicYearId: year.id, sectionId: input.sectionId } };
  const before = await prisma.classTeacherAssignment.findUnique({ where: key });

  await prisma.$transaction(async (tx) => {
    if (input.teacherId) {
      await tx.classTeacherAssignment.upsert({
        where: key,
        create: { schoolId: actor.schoolId, academicYearId: year.id, sectionId: input.sectionId, teacherId: input.teacherId },
        update: { teacherId: input.teacherId },
      });
    } else if (before) {
      await tx.classTeacherAssignment.delete({ where: key });
    }
    await recordAudit(
      actor,
      {
        action: "class_teacher.update",
        entityType: "ClassTeacherAssignment",
        entityId: input.sectionId,
        oldValue: before ? { teacherId: before.teacherId } : null,
        newValue: { teacherId: input.teacherId, academicYearId: year.id },
      },
      tx,
    );
  });
}

export async function addSubjectTeacher(actor: Actor, input: { academicYearId?: string; sectionId: string; subjectId: string; teacherId: string }) {
  const year = await resolveAcademicYear(actor.schoolId, input.academicYearId);
  const section = await findSection(actor.schoolId, input.sectionId);
  await assertTeacher(actor.schoolId, input.teacherId);

  const taught = await prisma.classSubject.findUnique({ where: { classId_subjectId: { classId: section.classId, subjectId: input.subjectId } } });
  if (!taught) throw badRequest(`${section.class.name} doesn't study this subject. Add it to the class first.`);

  return prisma.$transaction(async (tx) => {
    const assignment = await tx.subjectAssignment.create({
      data: { schoolId: actor.schoolId, academicYearId: year.id, sectionId: input.sectionId, subjectId: input.subjectId, teacherId: input.teacherId },
    });
    await recordAudit(actor, { action: "subject_teacher.create", entityType: "SubjectAssignment", entityId: assignment.id, newValue: { ...input, academicYearId: year.id } }, tx);
    return assignment;
  });
}

export async function removeSubjectTeacher(actor: Actor, assignmentId: string) {
  const assignment = await prisma.subjectAssignment.findFirst({ where: { id: assignmentId, schoolId: actor.schoolId } });
  if (!assignment) throw notFound("Assignment");
  await prisma.$transaction(async (tx) => {
    await tx.subjectAssignment.delete({ where: { id: assignmentId } });
    await recordAudit(actor, { action: "subject_teacher.delete", entityType: "SubjectAssignment", entityId: assignmentId, oldValue: assignment }, tx);
  });
}

/** Active staff who can be assigned to teach. */
export async function listTeachers(schoolId: string) {
  return prisma.user.findMany({
    where: {
      schoolId,
      isActive: true,
      OR: [{ staffProfile: { isNot: null } }, { roles: { some: { role: { key: { in: ["class_teacher", "subject_teacher", "principal"] } } } } }],
    },
    select: { id: true, fullName: true, staffProfile: { select: { designation: true } } },
    orderBy: { fullName: "asc" },
  });
}

export async function assertTeacher(schoolId: string, teacherId: string) {
  const teacher = await prisma.user.findFirst({ where: { id: teacherId, schoolId, isActive: true } });
  if (!teacher) throw badRequest("Teacher not found or deactivated");
}

export interface CopyAssignmentsInput {
  fromYearId: string;
  /** Defaults to the current year */
  toYearId?: string;
  classTeachers: boolean;
  subjectTeachers: boolean;
  timetable: boolean;
}

/**
 * Start a new year with last year's setup: class teachers, subject teachers and
 * the timetable. Anything already set in the new year is kept, and deactivated
 * teachers are left out.
 */
export async function copyFromYear(actor: Actor, input: CopyAssignmentsInput) {
  const from = await resolveAcademicYear(actor.schoolId, input.fromYearId);
  const to = await resolveAcademicYear(actor.schoolId, input.toYearId);
  if (from.id === to.id) throw badRequest("Choose two different academic years");

  const activeTeachers = new Set(
    (await prisma.user.findMany({ where: { schoolId: actor.schoolId, isActive: true }, select: { id: true } })).map((u) => u.id),
  );
  const copied = { classTeachers: 0, subjectTeachers: 0, timetable: 0 };

  await prisma.$transaction(async (tx) => {
    if (input.classTeachers) {
      const source = await tx.classTeacherAssignment.findMany({ where: { academicYearId: from.id, schoolId: actor.schoolId } });
      const existing = new Set((await tx.classTeacherAssignment.findMany({ where: { academicYearId: to.id }, select: { sectionId: true } })).map((a) => a.sectionId));
      const data = source
        .filter((a) => !existing.has(a.sectionId) && activeTeachers.has(a.teacherId))
        .map((a) => ({ schoolId: actor.schoolId, academicYearId: to.id, sectionId: a.sectionId, teacherId: a.teacherId }));
      copied.classTeachers = (await tx.classTeacherAssignment.createMany({ data, skipDuplicates: true })).count;
    }

    if (input.subjectTeachers) {
      const source = await tx.subjectAssignment.findMany({ where: { academicYearId: from.id, schoolId: actor.schoolId } });
      const data = source
        .filter((a) => activeTeachers.has(a.teacherId))
        .map((a) => ({ schoolId: actor.schoolId, academicYearId: to.id, sectionId: a.sectionId, subjectId: a.subjectId, teacherId: a.teacherId }));
      copied.subjectTeachers = (await tx.subjectAssignment.createMany({ data, skipDuplicates: true })).count;
    }

    if (input.timetable) {
      const [source, existing] = await Promise.all([
        tx.timetableEntry.findMany({ where: { academicYearId: from.id, schoolId: actor.schoolId } }),
        tx.timetableEntry.findMany({ where: { academicYearId: to.id }, select: { sectionId: true, dayOfWeek: true, periodId: true, teacherId: true } }),
      ]);
      const slot = (e: { dayOfWeek: number; periodId: string }) => `${e.dayOfWeek}:${e.periodId}`;
      const filled = new Set(existing.map((e) => `${e.sectionId}:${slot(e)}`));
      // A teacher already busy in that slot in the new year would clash
      const busy = new Set(existing.filter((e) => e.teacherId).map((e) => `${e.teacherId}:${slot(e)}`));
      const data = source
        .filter((e) => !filled.has(`${e.sectionId}:${slot(e)}`) && !(e.teacherId && busy.has(`${e.teacherId}:${slot(e)}`)))
        .map((e) => ({
          schoolId: actor.schoolId,
          academicYearId: to.id,
          sectionId: e.sectionId,
          dayOfWeek: e.dayOfWeek,
          periodId: e.periodId,
          subjectId: e.subjectId,
          teacherId: e.teacherId && activeTeachers.has(e.teacherId) ? e.teacherId : null,
        }));
      copied.timetable = (await tx.timetableEntry.createMany({ data, skipDuplicates: true })).count;
    }

    await recordAudit(actor, { action: "assignments.copy", entityType: "AcademicYear", entityId: to.id, newValue: { from: from.name, to: to.name, ...copied } }, tx);
  });

  return { from: from.name, to: to.name, copied };
}
