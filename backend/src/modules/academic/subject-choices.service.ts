import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { prisma, type Db } from "../../lib/prisma.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { resolveAcademicYear } from "./academic-year.service.js";

/**
 * Optional subjects (e.g. Grade 9–10 "Optional I: Computer or Account").
 *
 * - A class's optional subjects are grouped by `ClassSubject.optionGroup`.
 * - Each student chooses one subject per group for the year (StudentSubject).
 * - A student takes every compulsory subject, plus their choice in each group.
 * - Until a student has chosen in a group, they're counted in every subject of
 *   that group, so nothing silently disappears; the choices screen flags them.
 */

export const DEFAULT_GROUP = "Optional";
export const groupName = (optionGroup: string | null | undefined) => optionGroup?.trim() || DEFAULT_GROUP;

export type TakesSubject = (studentId: string, subjectId: string) => boolean;

/** Who takes which subject in a class this year. Compulsory subjects: everyone. */
export async function subjectTakers(classId: string, academicYearId: string, db: Db = prisma): Promise<TakesSubject> {
  const optional = await db.classSubject.findMany({ where: { classId, isOptional: true }, select: { subjectId: true, optionGroup: true } });
  if (!optional.length) return () => true;

  const groupOf = new Map(optional.map((o) => [o.subjectId, groupName(o.optionGroup)]));
  const choices = await db.studentSubject.findMany({ where: { academicYearId, subjectId: { in: [...groupOf.keys()] } }, select: { studentId: true, subjectId: true } });
  const chosen = new Map<string, string>(); // `${studentId}:${group}` → subjectId
  for (const c of choices) chosen.set(`${c.studentId}:${groupOf.get(c.subjectId)}`, c.subjectId);

  return (studentId, subjectId) => {
    const group = groupOf.get(subjectId);
    if (!group) return true;
    const choice = chosen.get(`${studentId}:${group}`);
    return !choice || choice === subjectId;
  };
}

async function optionGroups(schoolId: string, classId: string) {
  const schoolClass = await prisma.schoolClass.findFirst({ where: { id: classId, schoolId } });
  if (!schoolClass) throw notFound("Class");
  const optional = await prisma.classSubject.findMany({
    where: { classId, isOptional: true },
    include: { subject: { select: { id: true, name: true } } },
    orderBy: { subject: { name: "asc" } },
  });
  const groups = new Map<string, { id: string; name: string }[]>();
  for (const o of optional) groups.set(groupName(o.optionGroup), [...(groups.get(groupName(o.optionGroup)) ?? []), o.subject]);
  return { schoolClass, groups: [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, subjects]) => ({ name, subjects })) };
}

/** Students of a class (or one section) with their choice in each option group. */
export async function getSubjectChoices(schoolId: string, classId: string, input: { academicYearId?: string; sectionId?: string }) {
  const year = await resolveAcademicYear(schoolId, input.academicYearId);
  const { schoolClass, groups } = await optionGroups(schoolId, classId);
  const enrollments = await prisma.enrollment.findMany({
    where: { classId, academicYearId: year.id, status: { notIn: ["LEFT", "TRANSFERRED"] }, ...(input.sectionId && { sectionId: input.sectionId }) },
    include: { student: { select: { id: true, firstName: true, middleName: true, lastName: true } }, section: { select: { name: true } } },
    orderBy: [{ section: { name: "asc" } }, { rollNo: "asc" }],
  });
  const optionalIds = groups.flatMap((g) => g.subjects.map((s) => s.id));
  const choices = await prisma.studentSubject.findMany({ where: { academicYearId: year.id, subjectId: { in: optionalIds }, studentId: { in: enrollments.map((e) => e.studentId) } } });

  return {
    academicYear: { id: year.id, name: year.name },
    class: { id: schoolClass.id, name: schoolClass.name },
    groups,
    students: enrollments.map((e) => ({
      studentId: e.studentId,
      name: [e.student.firstName, e.student.middleName, e.student.lastName].filter(Boolean).join(" "),
      section: e.section.name,
      rollNo: e.rollNo,
      choices: Object.fromEntries(
        groups.map((g) => [g.name, choices.find((c) => c.studentId === e.studentId && g.subjects.some((s) => s.id === c.subjectId))?.subjectId ?? null]),
      ) as Record<string, string | null>,
    })),
  };
}

export interface ChoiceInput {
  studentId: string;
  group: string;
  /** null clears the choice */
  subjectId: string | null;
}

/** Set students' choices. Refused if a student already has marks in the subject they'd leave. */
export async function setSubjectChoices(actor: Actor, classId: string, input: { academicYearId?: string; choices: ChoiceInput[] }) {
  const year = await resolveAcademicYear(actor.schoolId, input.academicYearId);
  const { groups } = await optionGroups(actor.schoolId, classId);
  const enrolled = new Set(
    (await prisma.enrollment.findMany({ where: { classId, academicYearId: year.id }, select: { studentId: true } })).map((e) => e.studentId),
  );

  const planned = input.choices.map((c) => {
    const group = groups.find((g) => g.name === c.group);
    if (!group) throw badRequest(`${c.group} isn't an option group of this class`);
    if (c.subjectId && !group.subjects.some((s) => s.id === c.subjectId)) throw badRequest(`That subject isn't part of ${group.name}`);
    if (!enrolled.has(c.studentId)) throw badRequest("A student isn't in this class for the year");
    return { ...c, groupSubjectIds: group.subjects.map((s) => s.id) };
  });

  // Choosing one subject means leaving the others in the group (students who hadn't chosen
  // were counted in all of them), and leaving a subject that has marks would hide those marks
  const leaving = planned.flatMap((p) => (p.subjectId ? p.groupSubjectIds.filter((id) => id !== p.subjectId).map((subjectId) => ({ studentId: p.studentId, subjectId })) : []));
  if (leaving.length) {
    const withMarks = await prisma.mark.findMany({
      where: { OR: leaving.map((l) => ({ studentId: l.studentId, markSheet: { subjectId: l.subjectId, exam: { academicYearId: year.id } } })) },
      include: { student: { select: { firstName: true, lastName: true } }, markSheet: { include: { subject: { select: { name: true } } } } },
    });
    if (withMarks.length) {
      const names = [...new Set(withMarks.map((m) => `${m.student.firstName} ${m.student.lastName} (${m.markSheet.subject.name})`))];
      throw conflict(`These students already have marks in the subject they'd leave: ${names.slice(0, 5).join(", ")}${names.length > 5 ? "…" : ""}. Delete those marks first.`);
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const p of planned) {
      await tx.studentSubject.deleteMany({ where: { studentId: p.studentId, academicYearId: year.id, subjectId: { in: p.groupSubjectIds } } });
      if (p.subjectId) await tx.studentSubject.create({ data: { schoolId: actor.schoolId, studentId: p.studentId, academicYearId: year.id, subjectId: p.subjectId } });
    }
    await recordAudit(actor, { action: "student.subjects.choose", entityType: "SchoolClass", entityId: classId, newValue: { academicYear: year.name, choices: input.choices } }, tx);
  });
  return getSubjectChoices(actor.schoolId, classId, { academicYearId: year.id });
}

/** Optional subjects a student takes this year (for their profile). */
export async function studentOptionalSubjects(studentId: string, academicYearId: string) {
  const choices = await prisma.studentSubject.findMany({ where: { studentId, academicYearId }, include: { subject: { select: { id: true, name: true } } } });
  return choices.map((c) => c.subject);
}
