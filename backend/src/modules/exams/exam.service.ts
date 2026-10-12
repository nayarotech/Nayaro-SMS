import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { fromDateString, toDateString } from "../../lib/nepali-date.js";
import { prisma } from "../../lib/prisma.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { resolveAcademicYear } from "../academic/academic-year.service.js";
import { NEB_GRADING, type GradeBand } from "./grading.js";
import type { Prisma } from "../../generated/prisma/client.js";

/** Exam setup: exams per academic year, and full/pass marks per class and subject. */

export interface ExamInput {
  name: string;
  order?: number;
  startDate?: string | null;
  endDate?: string | null;
  academicYearId?: string;
}

export async function listExams(schoolId: string, academicYearId?: string) {
  const year = await resolveAcademicYear(schoolId, academicYearId);
  const exams = await prisma.exam.findMany({
    where: { schoolId, academicYearId: year.id },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: {
      subjects: { select: { classId: true } },
      markSheets: { select: { status: true } },
    },
  });
  return {
    academicYear: { id: year.id, name: year.name },
    exams: exams.map((exam) => ({
      id: exam.id,
      name: exam.name,
      order: exam.order,
      startDate: toDateString(exam.startDate),
      endDate: toDateString(exam.endDate),
      classesConfigured: new Set(exam.subjects.map((s) => s.classId)).size,
      sheets: {
        draft: exam.markSheets.filter((m) => m.status === "DRAFT").length,
        submitted: exam.markSheets.filter((m) => m.status === "SUBMITTED").length,
        verified: exam.markSheets.filter((m) => m.status === "VERIFIED").length,
        published: exam.markSheets.filter((m) => m.status === "PUBLISHED").length,
      },
    })),
  };
}

export async function createExam(actor: Actor, input: ExamInput) {
  const year = await resolveAcademicYear(actor.schoolId, input.academicYearId);
  assertDates(input);
  const exam = await prisma.exam.create({
    data: {
      schoolId: actor.schoolId,
      academicYearId: year.id,
      name: input.name,
      order: input.order ?? (await prisma.exam.count({ where: { academicYearId: year.id } })) + 1,
      startDate: input.startDate ? fromDateString(input.startDate) : null,
      endDate: input.endDate ? fromDateString(input.endDate) : null,
    },
  });
  await recordAudit(actor, { action: "exam.create", entityType: "Exam", entityId: exam.id, newValue: input });
  return exam;
}

export async function updateExam(actor: Actor, examId: string, input: Partial<ExamInput>) {
  const before = await findExam(actor.schoolId, examId);
  assertDates({ startDate: input.startDate ?? toDateString(before.startDate), endDate: input.endDate ?? toDateString(before.endDate) });
  const exam = await prisma.exam.update({
    where: { id: examId },
    data: {
      name: input.name,
      order: input.order,
      startDate: input.startDate === undefined ? undefined : input.startDate ? fromDateString(input.startDate) : null,
      endDate: input.endDate === undefined ? undefined : input.endDate ? fromDateString(input.endDate) : null,
    },
  });
  await recordAudit(actor, { action: "exam.update", entityType: "Exam", entityId: examId, oldValue: { name: before.name }, newValue: input });
  return exam;
}

export async function deleteExam(actor: Actor, examId: string) {
  const exam = await findExam(actor.schoolId, examId);
  const marks = await prisma.mark.count({ where: { markSheet: { examId } } });
  if (marks) throw conflict("Marks have already been entered for this exam, so it can't be deleted");
  await prisma.exam.delete({ where: { id: examId } });
  await recordAudit(actor, { action: "exam.delete", entityType: "Exam", entityId: examId, oldValue: { name: exam.name } });
}

/** Full/pass marks for each subject the class studies (with sensible defaults where not set yet). */
export async function getClassSubjects(schoolId: string, examId: string, classId: string) {
  await findExam(schoolId, examId);
  const [classSubjects, configured] = await Promise.all([
    prisma.classSubject.findMany({ where: { classId, schoolId }, include: { subject: true }, orderBy: { subject: { name: "asc" } } }),
    prisma.examSubject.findMany({ where: { examId, classId } }),
  ]);
  return classSubjects.map(({ subject, isOptional }) => {
    const config = configured.find((c) => c.subjectId === subject.id);
    return {
      subjectId: subject.id,
      subjectName: subject.name,
      isOptional,
      included: Boolean(config),
      theoryFullMarks: config?.theoryFullMarks ?? (subject.hasPractical ? 75 : 100),
      theoryPassMarks: config?.theoryPassMarks ?? (subject.hasPractical ? 26.25 : 35),
      practicalFullMarks: config?.practicalFullMarks ?? (subject.hasPractical ? 25 : 0),
      practicalPassMarks: config?.practicalPassMarks ?? (subject.hasPractical ? 8.75 : 0),
      creditHours: config?.creditHours ?? 4,
      examDate: toDateString(config?.examDate),
    };
  });
}

export interface ExamSubjectInput {
  subjectId: string;
  theoryFullMarks: number;
  theoryPassMarks: number;
  practicalFullMarks: number;
  practicalPassMarks: number;
  creditHours: number;
  examDate?: string | null;
}

/** Replace which subjects a class sits in this exam, with their marks. */
export async function setClassSubjects(actor: Actor, examId: string, classId: string, subjects: ExamSubjectInput[]) {
  await findExam(actor.schoolId, examId);
  const studied = new Set((await prisma.classSubject.findMany({ where: { classId, schoolId: actor.schoolId } })).map((c) => c.subjectId));
  for (const s of subjects) {
    if (!studied.has(s.subjectId)) throw badRequest("A subject isn't part of this class's curriculum");
    if (s.theoryPassMarks > s.theoryFullMarks || s.practicalPassMarks > s.practicalFullMarks) throw badRequest("Pass marks can't be more than full marks");
  }
  const removed = await prisma.examSubject.findMany({ where: { examId, classId, subjectId: { notIn: subjects.map((s) => s.subjectId) } } });
  if (removed.length) {
    const withMarks = await prisma.mark.count({ where: { markSheet: { examId, subjectId: { in: removed.map((r) => r.subjectId) }, section: { classId } } } });
    if (withMarks) throw conflict("Marks were already entered for a subject you removed. Clear those marks first.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.examSubject.deleteMany({ where: { examId, classId, subjectId: { notIn: subjects.map((s) => s.subjectId) } } });
    for (const s of subjects) {
      const data = { ...s, examDate: s.examDate ? fromDateString(s.examDate) : null };
      await tx.examSubject.upsert({
        where: { examId_classId_subjectId: { examId, classId, subjectId: s.subjectId } },
        create: { schoolId: actor.schoolId, examId, classId, ...data },
        update: data,
      });
    }
    await recordAudit(actor, { action: "exam.subjects.update", entityType: "Exam", entityId: examId, newValue: { classId, subjects } }, tx);
  });
  return getClassSubjects(actor.schoolId, examId, classId);
}

/**
 * Copy subject setup (full/pass marks, credit hours) onto other classes, or from
 * another exam. Only subjects each target class studies are copied; existing
 * settings for those subjects are overwritten and nothing is removed.
 */
async function copyConfigs(actor: Actor, examId: string, sources: { classId: string; configs: ExamSubjectInput[] }[]) {
  const curriculum = await prisma.classSubject.findMany({ where: { schoolId: actor.schoolId, classId: { in: sources.map((s) => s.classId) } }, select: { classId: true, subjectId: true } });
  const copied: Record<string, number> = {};
  await prisma.$transaction(async (tx) => {
    for (const { classId, configs } of sources) {
      const studied = new Set(curriculum.filter((c) => c.classId === classId).map((c) => c.subjectId));
      const applicable = configs.filter((c) => studied.has(c.subjectId));
      for (const config of applicable) {
        const data = { ...config, examDate: config.examDate ? fromDateString(config.examDate) : null };
        await tx.examSubject.upsert({
          where: { examId_classId_subjectId: { examId, classId, subjectId: config.subjectId } },
          create: { schoolId: actor.schoolId, examId, classId, ...data },
          update: data,
        });
      }
      copied[classId] = applicable.length;
    }
    await recordAudit(actor, { action: "exam.subjects.copy", entityType: "Exam", entityId: examId, newValue: copied }, tx);
  });
  return copied;
}

const toInput = (es: { subjectId: string; theoryFullMarks: number; theoryPassMarks: number; practicalFullMarks: number; practicalPassMarks: number; creditHours: number }): ExamSubjectInput => ({
  subjectId: es.subjectId,
  theoryFullMarks: es.theoryFullMarks,
  theoryPassMarks: es.theoryPassMarks,
  practicalFullMarks: es.practicalFullMarks,
  practicalPassMarks: es.practicalPassMarks,
  creditHours: es.creditHours,
});

/** "Same as Grade 6": copy one class's setup in this exam to other classes. */
export async function copyClassSetup(actor: Actor, examId: string, fromClassId: string, toClassIds: string[]) {
  await findExam(actor.schoolId, examId);
  const source = await prisma.examSubject.findMany({ where: { examId, classId: fromClassId } });
  if (!source.length) throw badRequest("Save this class's subjects first, then copy them");
  const targets = await prisma.schoolClass.findMany({ where: { schoolId: actor.schoolId, id: { in: toClassIds.filter((id) => id !== fromClassId) } }, select: { id: true } });
  return { copied: await copyConfigs(actor, examId, targets.map((t) => ({ classId: t.id, configs: source.map(toInput) }))) };
}

/** "Same as First Terminal": copy every class's setup from another exam. */
export async function copyExamSetup(actor: Actor, examId: string, fromExamId: string) {
  await findExam(actor.schoolId, examId);
  await findExam(actor.schoolId, fromExamId);
  if (examId === fromExamId) throw badRequest("Choose a different exam to copy from");
  const source = await prisma.examSubject.findMany({ where: { examId: fromExamId } });
  if (!source.length) throw badRequest("That exam has no subjects set up");
  const byClass = new Map<string, ExamSubjectInput[]>();
  for (const es of source) byClass.set(es.classId, [...(byClass.get(es.classId) ?? []), toInput(es)]);
  return { copied: await copyConfigs(actor, examId, [...byClass].map(([classId, configs]) => ({ classId, configs }))) };
}

// ─── Grading scale ───────────────────────────────────────────

export async function getGradingScale(schoolId: string): Promise<GradeBand[]> {
  const scale = await prisma.gradingScale.findUnique({ where: { schoolId } });
  return scale ? (scale.bands as unknown as GradeBand[]) : NEB_GRADING;
}

export async function setGradingScale(actor: Actor, bands: GradeBand[]) {
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  if (!sorted.some((b) => b.min === 0)) throw badRequest("The lowest band must start at 0%");
  if (new Set(sorted.map((b) => b.min)).size !== sorted.length) throw badRequest("Two bands start at the same percentage");
  const before = await getGradingScale(actor.schoolId);
  await prisma.gradingScale.upsert({
    where: { schoolId: actor.schoolId },
    create: { schoolId: actor.schoolId, bands: sorted as unknown as Prisma.InputJsonValue },
    update: { bands: sorted as unknown as Prisma.InputJsonValue },
  });
  await recordAudit(actor, { action: "exam.grading.update", entityType: "GradingScale", entityId: actor.schoolId, oldValue: before, newValue: sorted });
  return sorted;
}

export async function findExam(schoolId: string, examId: string) {
  const exam = await prisma.exam.findFirst({ where: { id: examId, schoolId }, include: { academicYear: true } });
  if (!exam) throw notFound("Exam");
  return exam;
}

function assertDates(input: { startDate?: string | null; endDate?: string | null }) {
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    throw badRequest("The exam can't end before it starts", { fieldErrors: { endDate: ["Before the start date"] } });
  }
}
