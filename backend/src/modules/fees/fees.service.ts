import { prisma } from "../../lib/prisma.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { todayInNepal } from "../../lib/nepali-date.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";

// Keep bill totals below MySQL's signed INT limit; never calculate money with floats.
export const MAX_MONEY = 1_000_000_000;
export function billTotal(amount: number, discount: number, fine: number) {
  if (![amount, discount, fine].every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_MONEY) || amount === 0)
    throw badRequest("Enter valid amounts in paisa");
  if (discount > amount) throw badRequest("Discount cannot exceed the fee amount");
  const total = amount - discount + fine;
  if (total <= 0 || total > MAX_MONEY) throw badRequest("Bill total must be positive and within the supported limit");
  return total;
}

export function listStructures(schoolId: string) {
  return prisma.feeStructure.findMany({ where: { schoolId }, orderBy: { name: "asc" } });
}

export async function createStructure(actor: Actor, input: { name: string; amount: number }) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.feeStructure.create({ data: { schoolId: actor.schoolId, ...input } });
    await recordAudit(actor, { action: "fees.structure.create", entityType: "FeeStructure", entityId: item.id, newValue: item }, tx);
    return item;
  });
}

export async function studentOptions(schoolId: string, search: string) {
  return prisma.student.findMany({
    where: { schoolId, status: "ACTIVE", ...(search ? { OR: [{ firstName: { contains: search } }, { lastName: { contains: search } }, { admissionNo: { contains: search } }] } : {}) },
    select: { id: true, firstName: true, lastName: true, admissionNo: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }], take: 50,
  });
}

export async function createBill(actor: Actor, input: { studentId: string; feeStructureId: string; period: string; dueDate: string; discount: number; fine: number }) {
  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findFirst({ where: { id: input.studentId, schoolId: actor.schoolId } });
    if (!student) throw notFound("Student");
    const structure = await tx.feeStructure.findFirst({ where: { id: input.feeStructureId, schoolId: actor.schoolId } });
    if (!structure) throw notFound("Fee structure");
    const item = await tx.feeBill.create({ data: {
      schoolId: actor.schoolId, ...input, dueDate: new Date(input.dueDate), title: structure.name,
      amount: structure.amount, total: billTotal(structure.amount, input.discount, input.fine),
    } });
    await recordAudit(actor, { action: "fees.bill.create", entityType: "FeeBill", entityId: item.id, newValue: item }, tx);
    return item;
  });
}

export async function listBills(schoolId: string, query: { page: number; pageSize: number; studentId?: string; classId?: string; sectionId?: string; status?: "all" | "outstanding" | "overdue" | "paid" }) {
  const currentYear = query.classId || query.sectionId ? await prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true } }) : null;
  const where: Prisma.FeeBillWhereInput = {
    schoolId, ...(query.studentId ? { studentId: query.studentId } : {}),
    ...(query.classId || query.sectionId ? { student: { enrollments: { some: { schoolId, academicYearId: currentYear?.id ?? "", status: "ACTIVE", ...(query.classId ? { classId: query.classId } : {}), ...(query.sectionId ? { sectionId: query.sectionId } : {}) } } } } : {}),
    ...(query.status === "outstanding" || query.status === "overdue" ? { paid: { lt: prisma.feeBill.fields.total } } : {}),
    ...(query.status === "paid" ? { paid: { equals: prisma.feeBill.fields.total } } : {}),
    ...(query.status === "overdue" ? { dueDate: { lt: new Date(`${todayInNepal()}T00:00:00Z`) } } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.feeBill.findMany({ where, include: { student: { select: { firstName: true, lastName: true, admissionNo: true } } }, orderBy: [{ dueDate: "desc" }, { id: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    prisma.feeBill.count({ where }),
  ]);
  return { items: items.map((bill) => ({ ...bill, balance: bill.total - bill.paid })), total, page: query.page, pageSize: query.pageSize };
}

export async function billDetail(schoolId: string, id: string) {
  const bill = await prisma.feeBill.findFirst({ where: { id, schoolId }, include: { student: { select: { firstName: true, lastName: true, admissionNo: true } }, payments: { orderBy: { createdAt: "desc" } } } });
  if (!bill) throw notFound("Bill");
  return { ...bill, balance: bill.total - bill.paid };
}

export async function summary(schoolId: string) {
  const { _sum, _count } = await prisma.feeBill.aggregate({ where: { schoolId }, _sum: { total: true, paid: true }, _count: true });
  return { billed: _sum.total ?? 0, collected: _sum.paid ?? 0, outstanding: (_sum.total ?? 0) - (_sum.paid ?? 0), bills: _count };
}

export async function collectPayment(actor: Actor, billId: string, input: { requestId: string; amount: number; method: string; reference?: string }) {
  if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount > MAX_MONEY) throw badRequest("Enter a positive payment amount in paisa");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.feePayment.findUnique({ where: { schoolId_requestId: { schoolId: actor.schoolId, requestId: input.requestId } } });
    if (existing) {
      if (existing.reversedAt) throw conflict("This payment was reversed. Use a new payment request for a new collection");
      if (existing.billId !== billId || existing.amount !== input.amount || existing.method !== input.method || existing.reference !== (input.reference ?? null))
        throw conflict("This payment request was already used with different details");
      return existing;
    }
    const bill = await tx.feeBill.findFirst({ where: { id: billId, schoolId: actor.schoolId } });
    if (!bill) throw notFound("Bill");
    if (input.amount > bill.total - bill.paid) throw badRequest("Payment exceeds the outstanding balance");
    // Compare-and-swap prevents two collectors from spending the same balance.
    const updated = await tx.feeBill.updateMany({ where: { id: billId, schoolId: actor.schoolId, paid: bill.paid }, data: { paid: { increment: input.amount } } });
    if (updated.count !== 1) throw conflict("The balance changed. Refresh and try again");
    const payment = await tx.feePayment.create({ data: { schoolId: actor.schoolId, billId, collectedBy: actor.userId, ...input } });
    await recordAudit(actor, { action: "fees.payment.collect", entityType: "FeePayment", entityId: payment.id, newValue: payment }, tx);
    return payment;
  });
}

/** Parent access is by guardian relationship within the current school. */
async function assertChild(schoolId: string, userId: string, studentId: string) {
  const child = await prisma.student.findFirst({ where: { id: studentId, schoolId, guardians: { some: { guardian: { userId, schoolId } } } }, select: { id: true } });
  if (!child) throw notFound("Student");
}

export async function childBills(schoolId: string, userId: string, studentId: string, query: { page: number; pageSize: number }) {
  await assertChild(schoolId, userId, studentId);
  const [bills, totals] = await Promise.all([
    listBills(schoolId, { ...query, studentId }),
    prisma.feeBill.aggregate({ where: { schoolId, studentId }, _sum: { total: true, paid: true } }),
  ]);
  const billed = totals._sum.total ?? 0;
  const paid = totals._sum.paid ?? 0;
  return { ...bills, summary: { billed, paid, outstanding: billed - paid } };
}

export async function childBillDetail(schoolId: string, userId: string, studentId: string, billId: string) {
  await assertChild(schoolId, userId, studentId);
  const bill = await prisma.feeBill.findFirst({
    where: { id: billId, schoolId, studentId },
    select: {
      id: true, title: true, period: true, dueDate: true, amount: true, discount: true,
      fine: true, total: true, paid: true,
      payments: { orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true, amount: true, method: true, reference: true, createdAt: true, reversedAt: true, reversalReason: true } },
    },
  });
  if (!bill) throw notFound("Bill");
  return { ...bill, balance: bill.total - bill.paid };
}
