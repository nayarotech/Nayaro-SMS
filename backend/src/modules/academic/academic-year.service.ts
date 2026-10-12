import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { fromDateString, toDateString } from "../../lib/nepali-date.js";
import { prisma } from "../../lib/prisma.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";

export interface AcademicYearInput {
  name: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
}

export async function listAcademicYears(schoolId: string) {
  const years = await prisma.academicYear.findMany({
    where: { schoolId },
    orderBy: { startDate: "desc" },
    include: { _count: { select: { enrollments: true } } },
  });
  return years.map((y) => ({ ...toDto(y), enrollmentCount: y._count.enrollments }));
}

export async function createAcademicYear(actor: Actor, input: AcademicYearInput) {
  assertDateRange(input);
  const isFirst = (await prisma.academicYear.count({ where: { schoolId: actor.schoolId } })) === 0;

  const year = await prisma.$transaction(async (tx) => {
    const makeCurrent = input.isCurrent || isFirst;
    if (makeCurrent) await tx.academicYear.updateMany({ where: { schoolId: actor.schoolId }, data: { isCurrent: false } });
    const created = await tx.academicYear.create({
      data: {
        schoolId: actor.schoolId,
        name: input.name,
        startDate: fromDateString(input.startDate),
        endDate: fromDateString(input.endDate),
        isCurrent: makeCurrent,
      },
    });
    await recordAudit(actor, { action: "academic_year.create", entityType: "AcademicYear", entityId: created.id, newValue: input }, tx);
    return created;
  });
  return toDto(year);
}

export async function updateAcademicYear(actor: Actor, yearId: string, input: Partial<AcademicYearInput>) {
  const before = await findYear(actor.schoolId, yearId);
  const merged = { startDate: toDateString(before.startDate), endDate: toDateString(before.endDate), ...input };
  assertDateRange(merged);
  if (input.isCurrent === false && before.isCurrent) throw badRequest("Make another year current instead");

  const year = await prisma.$transaction(async (tx) => {
    if (input.isCurrent) await tx.academicYear.updateMany({ where: { schoolId: actor.schoolId }, data: { isCurrent: false } });
    const updated = await tx.academicYear.update({
      where: { id: yearId },
      data: {
        name: input.name,
        startDate: input.startDate ? fromDateString(input.startDate) : undefined,
        endDate: input.endDate ? fromDateString(input.endDate) : undefined,
        isCurrent: input.isCurrent,
      },
    });
    await recordAudit(actor, { action: "academic_year.update", entityType: "AcademicYear", entityId: yearId, oldValue: toDto(before), newValue: input }, tx);
    return updated;
  });
  return toDto(year);
}

export async function deleteAcademicYear(actor: Actor, yearId: string) {
  const year = await findYear(actor.schoolId, yearId);
  const enrollments = await prisma.enrollment.count({ where: { academicYearId: yearId } });
  if (enrollments) throw conflict("This year has student enrollments and can't be deleted");
  if (year.isCurrent) throw conflict("The current year can't be deleted");

  await prisma.$transaction(async (tx) => {
    await tx.academicYear.delete({ where: { id: yearId } });
    await recordAudit(actor, { action: "academic_year.delete", entityType: "AcademicYear", entityId: yearId, oldValue: toDto(year) }, tx);
  });
}

/** The given year (checked to belong to the school), or the school's current year. */
export async function resolveAcademicYear(schoolId: string, yearId?: string) {
  const year = yearId
    ? await prisma.academicYear.findFirst({ where: { id: yearId, schoolId } })
    : await prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true } });
  if (!year) throw yearId ? notFound("Academic year") : badRequest("Set up the current academic year first (Academic setup → Academic years)");
  return year;
}

async function findYear(schoolId: string, yearId: string) {
  const year = await prisma.academicYear.findFirst({ where: { id: yearId, schoolId } });
  if (!year) throw notFound("Academic year");
  return year;
}

function assertDateRange(input: { startDate: string; endDate: string }) {
  if (input.endDate <= input.startDate) {
    throw badRequest("End date must be after start date", { fieldErrors: { endDate: ["Must be after the start date"] } });
  }
}

function toDto(year: { id: string; name: string; startDate: Date; endDate: Date; isCurrent: boolean }) {
  return {
    id: year.id,
    name: year.name,
    startDate: toDateString(year.startDate),
    endDate: toDateString(year.endDate),
    isCurrent: year.isCurrent,
  };
}
