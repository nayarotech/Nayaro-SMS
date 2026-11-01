import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma, type Db } from "../../lib/prisma.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { adToBs, bsToAd, todayInNepal } from "../../lib/nepali-date.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { billingRoster } from "./bulk.service.js";
import { billTotal } from "./fees.service.js";

export interface PlanInput { name: string; classId: string; sectionId?: string; feeStructureId: string; calendar: "BS" | "AD"; billingDay: number; dueDay: number }
export function monthlyDates(calendar: string, month: string, billingDay: number, dueDay: number) {
  if (!["BS", "AD"].includes(calendar) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || ![billingDay, dueDay].every((d) => Number.isInteger(d) && d >= 1 && d <= 28) || dueDay < billingDay) throw badRequest("Use a valid month and days 1–28, with the due day on or after the billing day");
  const convert = (day: number) => {
    const value = `${month}-${String(day).padStart(2, "0")}`;
    if (calendar === "AD") return value;
    try { const ad = bsToAd(value); if (adToBs(ad) !== value) throw new Error(); return ad; }
    catch { throw badRequest("This BS month is outside the supported calendar range"); }
  };
  return { billingDate: convert(billingDay), dueDate: convert(dueDay) };
}
const totalDto = <T extends { total: bigint }>(row: T) => ({ ...row, total: Number(row.total) });
export async function listPlans(schoolId: string) {
  const plans = await prisma.feeRecurringPlan.findMany({ where: { schoolId }, orderBy: { name: "asc" }, include: {
    class: { select: { name: true } }, section: { select: { name: true } }, feeStructure: { select: { name: true, amount: true } }, academicYear: { select: { name: true } },
    scheduleStates: { orderBy: { updatedAt: "desc" }, take: 12, select: { id: true, month: true, status: true, attempts: true, nextAttemptAt: true, updatedAt: true, errorMessage: true } },
    runs: { orderBy: { createdAt: "desc" }, take: 12, select: { id: true, month: true, created: true, skipped: true, total: true, createdAt: true, source: true } },
  } });
  return plans.map((plan) => ({ ...plan, defaultMonth: (plan.calendar === "BS" ? adToBs(todayInNepal()) : todayInNepal()).slice(0, 7), runs: plan.runs.map(totalDto) }));
}
export async function createPlan(actor: Actor, input: PlanInput) {
  monthlyDates(input.calendar, input.calendar === "BS" ? adToBs(todayInNepal()).slice(0, 7) : todayInNepal().slice(0, 7), input.billingDay, input.dueDay);
  return prisma.$transaction(async (tx) => {
    const { year } = await billingRoster(actor.schoolId, { ...input, period: "", dueDate: "", fine: 0 }, tx);
    const plan = await tx.feeRecurringPlan.create({ data: { ...input, schoolId: actor.schoolId, academicYearId: year.id } });
    await recordAudit(actor, { action: "fees.recurring.create", entityType: "FeeRecurringPlan", entityId: plan.id, newValue: input }, tx);
    return plan;
  });
}
async function lockedPlan(schoolId: string, id: string, db: Db) {
  await db.$queryRaw(Prisma.sql`SELECT id FROM FeeRecurringPlan WHERE id = ${id} AND schoolId = ${schoolId} FOR UPDATE`);
  const plan = await db.feeRecurringPlan.findFirst({ where: { id, schoolId }, include: { discounts: { where: { schoolId } } } });
  if (!plan) throw notFound("Recurring plan");
  return plan;
}
async function preview(schoolId: string, id: string, month: string, db: Db) {
  const plan = await db.feeRecurringPlan.findFirst({ where: { id, schoolId }, include: { discounts: { where: { schoolId } } } });
  if (!plan) throw notFound("Recurring plan");
  if (!plan.active) throw conflict("This recurring plan is paused");
  const dates = monthlyDates(plan.calendar, month, plan.billingDay, plan.dueDay);
  const { year, structure, enrollments } = await billingRoster(schoolId, { classId: plan.classId, sectionId: plan.sectionId ?? undefined, feeStructureId: plan.feeStructureId, period: month, dueDate: dates.dueDate, fine: 0 }, db);
  if (year.id !== plan.academicYearId) throw conflict("This plan belongs to another academic year. Create a plan for the current year");
  if (new Date(dates.billingDate) < year.startDate || new Date(dates.dueDate) > year.endDate) throw badRequest("Billing and due dates must fall within the plan's academic year");
  const discounts = new Map(plan.discounts.map((d) => [d.studentId, d.discount]));
  const existing = await db.feeBill.findMany({ where: { schoolId, feeStructureId: structure.id, period: month, studentId: { in: enrollments.map((e) => e.studentId) } }, select: { id: true, studentId: true } });
  const billed = new Map(existing.map((b) => [b.studentId, b.id]));
  const students = enrollments.map((e) => ({ ...e.student, section: e.section.name, discount: discounts.get(e.studentId) ?? 0, total: billTotal(structure.amount, discounts.get(e.studentId) ?? 0, 0), existingBillId: billed.get(e.studentId) ?? null }));
  const fingerprint = createHash("sha256").update(JSON.stringify({ id, version: plan.version, month, dates, year: year.id, amount: structure.amount, title: structure.name, students: students.map(({ id, discount }) => ({ id, discount })) })).digest("hex");
  const run = await db.feeRecurringRun.findUnique({ where: { planId_month: { planId: id, month } } });
  return { planId: id, version: plan.version, amount: structure.amount, feeName: structure.name, academicYear: year.name, month, calendar: plan.calendar, ...dates, students, fingerprint, completedRun: run ? totalDto(run) : null };
}
export const previewPlan = (schoolId: string, id: string, month: string) => preview(schoolId, id, month, prisma);
export async function setPlanActive(actor: Actor, id: string, active: boolean) {
  return prisma.$transaction(async (tx) => {
    await lockedPlan(actor.schoolId, id, tx);
    const plan = await tx.feeRecurringPlan.update({ where: { id }, data: { active, version: { increment: 1 } } });
    await recordAudit(actor, { action: "fees.recurring.status", entityType: "FeeRecurringPlan", entityId: id, newValue: { active } }, tx);
    return plan;
  });
}
export async function saveDiscounts(actor: Actor, id: string, input: { version: number; expectedAmount: number; students: { studentId: string; discount: number }[] }) {
  if (new Set(input.students.map((s) => s.studentId)).size !== input.students.length) throw badRequest("Use each student only once");
  return prisma.$transaction(async (tx) => {
    const plan = await lockedPlan(actor.schoolId, id, tx);
    if (!plan.active || plan.version !== input.version) throw conflict("Plan changed. Preview again");
    const { structure, year, enrollments } = await billingRoster(actor.schoolId, { classId: plan.classId, sectionId: plan.sectionId ?? undefined, feeStructureId: plan.feeStructureId, period: "", dueDate: "", fine: 0 }, tx);
    if (year.id !== plan.academicYearId || structure.amount !== input.expectedAmount) throw conflict("Academic year or fee changed. Preview again");
    const eligible = new Set(enrollments.map((e) => e.studentId));
    for (const row of input.students) { if (!eligible.has(row.studentId)) throw badRequest("Discount student is outside the plan's active roster"); billTotal(structure.amount, row.discount, 0); }
    await tx.feeRecurringDiscount.deleteMany({ where: { schoolId: actor.schoolId, planId: id } });
    const rows = input.students.filter((s) => s.discount > 0);
    if (rows.length) await tx.feeRecurringDiscount.createMany({ data: rows.map((s) => ({ ...s, schoolId: actor.schoolId, planId: id })) });
    await tx.feeRecurringPlan.update({ where: { id }, data: { version: { increment: 1 } } });
    await recordAudit(actor, { action: "fees.recurring.discounts", entityType: "FeeRecurringPlan", entityId: id, newValue: input.students }, tx);
    return { saved: rows.length };
  });
}
export async function issuePlanInTransaction(actor: Actor, id: string, month: string, fingerprint: string | undefined, tx: Db, source = "MANUAL") {
  await lockedPlan(actor.schoolId, id, tx);
  const previous = await tx.feeRecurringRun.findUnique({ where: { planId_month: { planId: id, month } } });
  if (previous) return totalDto(previous);
  const data = await preview(actor.schoolId, id, month, tx);
  if (fingerprint !== undefined && data.fingerprint !== fingerprint) throw conflict("The plan, roster, fee or discounts changed. Preview again before issuing");
  if (!data.students.length) throw badRequest("No active students to bill");
  const plan = await tx.feeRecurringPlan.findUniqueOrThrow({ where: { id } });
  const rows = [...data.students].sort((a, b) => a.id.localeCompare(b.id)).map((s) => ({ id: randomUUID(), schoolId: actor.schoolId, studentId: s.id, feeStructureId: plan.feeStructureId, title: data.feeName, period: month, dueDate: new Date(data.dueDate), amount: data.amount, discount: s.discount, fine: 0, total: s.total }));
  await tx.feeBill.createMany({ data: rows, skipDuplicates: true });
  const created = await tx.feeBill.findMany({ where: { schoolId: actor.schoolId, id: { in: rows.map((r) => r.id) } }, select: { id: true, total: true } });
  const run = await tx.feeRecurringRun.create({ data: { schoolId: actor.schoolId, planId: id, month, issuedBy: actor.userId, source, created: created.length, skipped: rows.length - created.length, total: created.reduce((n, b) => n + b.total, 0), billIds: created.map((b) => b.id) } });
  await recordAudit(actor, { action: "fees.recurring.issue", entityType: "FeeRecurringRun", entityId: run.id, newValue: { planId: id, month, source, created: run.created, skipped: run.skipped } }, tx);
  return totalDto(run);
}
export async function issuePlan(actor: Actor, id: string, month: string, fingerprint: string) {
  return prisma.$transaction((tx) => issuePlanInTransaction(actor, id, month, fingerprint, tx), { timeout: 15000 });
}
