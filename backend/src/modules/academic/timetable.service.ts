import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { resolveAcademicYear } from "./academic-year.service.js";
import { assertTeacher } from "./assignment.service.js";
import { findSection } from "./class.service.js";

// ─── Periods (the school's bell schedule) ────────────────────

export interface PeriodInput {
  name: string;
  startTime: string;
  endTime: string;
  order: number;
  isBreak?: boolean;
}

export async function listPeriods(schoolId: string) {
  return prisma.period.findMany({ where: { schoolId }, orderBy: { order: "asc" } });
}

export async function createPeriod(actor: Actor, input: PeriodInput) {
  assertTimes(input);
  return prisma.$transaction(async (tx) => {
    const period = await tx.period.create({ data: { schoolId: actor.schoolId, ...input } });
    await recordAudit(actor, { action: "period.create", entityType: "Period", entityId: period.id, newValue: input }, tx);
    return period;
  });
}

export async function updatePeriod(actor: Actor, periodId: string, input: Partial<PeriodInput>) {
  const before = await findPeriod(actor.schoolId, periodId);
  assertTimes({ startTime: input.startTime ?? before.startTime, endTime: input.endTime ?? before.endTime });
  return prisma.$transaction(async (tx) => {
    const period = await tx.period.update({ where: { id: periodId }, data: input });
    await recordAudit(actor, { action: "period.update", entityType: "Period", entityId: periodId, oldValue: before, newValue: input }, tx);
    return period;
  });
}

export async function deletePeriod(actor: Actor, periodId: string) {
  const period = await findPeriod(actor.schoolId, periodId);
  await prisma.$transaction(async (tx) => {
    await tx.period.delete({ where: { id: periodId } });
    await recordAudit(actor, { action: "period.delete", entityType: "Period", entityId: periodId, oldValue: period }, tx);
  });
}

// ─── Timetable ───────────────────────────────────────────────

export async function getSectionTimetable(schoolId: string, sectionId: string, academicYearId?: string) {
  const year = await resolveAcademicYear(schoolId, academicYearId);
  await findSection(schoolId, sectionId);
  const entries = await prisma.timetableEntry.findMany({
    where: { schoolId, academicYearId: year.id, sectionId },
    include: { subject: { select: { id: true, name: true } }, teacher: { select: { id: true, fullName: true } } },
  });
  return {
    academicYear: { id: year.id, name: year.name },
    entries: entries.map((e) => ({ id: e.id, dayOfWeek: e.dayOfWeek, periodId: e.periodId, subject: e.subject, teacher: e.teacher })),
  };
}

export interface TimetableSlotInput {
  academicYearId?: string;
  sectionId: string;
  dayOfWeek: number;
  periodId: string;
  subjectId: string | null;
  teacherId: string | null;
}

/**
 * Set one cell of a section's timetable. Clearing both subject and teacher removes it.
 * A teacher can't be in two sections in the same period.
 */
export async function setTimetableSlot(actor: Actor, input: TimetableSlotInput) {
  const year = await resolveAcademicYear(actor.schoolId, input.academicYearId);
  await findSection(actor.schoolId, input.sectionId);
  const period = await findPeriod(actor.schoolId, input.periodId);
  if (period.isBreak) throw badRequest("Breaks can't have a subject");
  if (input.teacherId) await assertTeacher(actor.schoolId, input.teacherId);
  if (input.subjectId && !(await prisma.subject.findFirst({ where: { id: input.subjectId, schoolId: actor.schoolId } }))) {
    throw notFound("Subject");
  }

  if (input.teacherId) {
    const clash = await prisma.timetableEntry.findFirst({
      where: {
        academicYearId: year.id,
        dayOfWeek: input.dayOfWeek,
        periodId: input.periodId,
        teacherId: input.teacherId,
        sectionId: { not: input.sectionId },
      },
      include: { section: { include: { class: true } } },
    });
    if (clash) throw conflict(`This teacher is already teaching ${clash.section.class.name} ${clash.section.name} in this period`);
  }

  const key = {
    academicYearId_sectionId_dayOfWeek_periodId: {
      academicYearId: year.id,
      sectionId: input.sectionId,
      dayOfWeek: input.dayOfWeek,
      periodId: input.periodId,
    },
  };
  const before = await prisma.timetableEntry.findUnique({ where: key });

  await prisma.$transaction(async (tx) => {
    if (!input.subjectId && !input.teacherId) {
      if (before) await tx.timetableEntry.delete({ where: key });
    } else {
      await tx.timetableEntry.upsert({
        where: key,
        create: {
          schoolId: actor.schoolId,
          academicYearId: year.id,
          sectionId: input.sectionId,
          dayOfWeek: input.dayOfWeek,
          periodId: input.periodId,
          subjectId: input.subjectId,
          teacherId: input.teacherId,
        },
        update: { subjectId: input.subjectId, teacherId: input.teacherId },
      });
    }
    await recordAudit(
      actor,
      { action: "timetable.update", entityType: "TimetableEntry", entityId: input.sectionId, oldValue: before, newValue: { ...input, academicYearId: year.id } },
      tx,
    );
  });
}

async function findPeriod(schoolId: string, periodId: string) {
  const period = await prisma.period.findFirst({ where: { id: periodId, schoolId } });
  if (!period) throw notFound("Period");
  return period;
}

function assertTimes(input: { startTime: string; endTime: string }) {
  if (input.endTime <= input.startTime) {
    throw badRequest("End time must be after start time", { fieldErrors: { endTime: ["Must be after the start time"] } });
  }
}
