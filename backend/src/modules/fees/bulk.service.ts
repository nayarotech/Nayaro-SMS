import { randomUUID } from "node:crypto";
import { prisma, type Db } from "../../lib/prisma.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { billTotal } from "./fees.service.js";

export interface BulkInput {
  classId: string;
  sectionId?: string;
  feeStructureId: string;
  period: string;
  dueDate: string;
  fine: number;
}

export async function bulkOptions(schoolId: string) {
  const [year, classes] = await Promise.all([
    prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true, name: true } }),
    prisma.schoolClass.findMany({ where: { schoolId }, orderBy: { order: "asc" }, select: { id: true, name: true, sections: { orderBy: { name: "asc" }, select: { id: true, name: true } } } }),
  ]);
  return { year, classes };
}

export async function billingRoster(schoolId: string, input: BulkInput, db: Db) {
  const year = await db.academicYear.findFirst({ where: { schoolId, isCurrent: true } });
  if (!year) throw badRequest("Set a current academic year before bulk billing");
  const schoolClass = await db.schoolClass.findFirst({ where: { id: input.classId, schoolId } });
  if (!schoolClass) throw notFound("Class");
  if (input.sectionId && !await db.section.findFirst({ where: { id: input.sectionId, classId: input.classId, schoolId } })) throw notFound("Section");
  const structure = await db.feeStructure.findFirst({ where: { id: input.feeStructureId, schoolId } });
  if (!structure) throw notFound("Fee structure");
  billTotal(structure.amount, 0, input.fine);
  const enrollments = await db.enrollment.findMany({
    where: { schoolId, academicYearId: year.id, classId: input.classId, ...(input.sectionId ? { sectionId: input.sectionId } : {}), status: "ACTIVE", student: { schoolId, status: "ACTIVE" } },
    include: { student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } }, section: { select: { name: true } } },
    orderBy: [{ section: { name: "asc" } }, { rollNo: "asc" }, { studentId: "asc" }], take: 501,
  });
  if (enrollments.length > 500) throw badRequest("Select a section to bill at most 500 students at a time");
  return { year, structure, enrollments };
}

export async function previewBulk(schoolId: string, input: BulkInput) {
  const { year, structure, enrollments } = await billingRoster(schoolId, input, prisma);
  const existing = await prisma.feeBill.findMany({ where: { schoolId, feeStructureId: structure.id, period: input.period, studentId: { in: enrollments.map((e) => e.studentId) } }, select: { studentId: true, id: true } });
  const billed = new Map(existing.map((b) => [b.studentId, b.id]));
  return {
    year: { id: year.id, name: year.name }, amount: structure.amount,
    students: enrollments.map((e) => ({ ...e.student, section: e.section.name, rollNo: e.rollNo, existingBillId: billed.get(e.studentId) ?? null })),
  };
}

export async function issueBulk(actor: Actor, input: BulkInput & { expectedAmount: number; academicYearId: string; students: { studentId: string; discount: number }[] }) {
  if (!input.students.length || input.students.length > 500) throw badRequest("Select between 1 and 500 students");
  if (new Set(input.students.map((s) => s.studentId)).size !== input.students.length) throw badRequest("Select each student only once");
  return prisma.$transaction(async (tx) => {
    const { year, structure, enrollments } = await billingRoster(actor.schoolId, input, tx);
    if (year.id !== input.academicYearId || structure.amount !== input.expectedAmount) throw conflict("The academic year or fee amount changed. Preview again before issuing bills");
    const eligible = new Set(enrollments.map((e) => e.studentId));
    if (input.students.some((s) => !eligible.has(s.studentId))) throw conflict("A selected student is no longer active in this class/section. Preview again");
    const rows = [...input.students].sort((a, b) => a.studentId.localeCompare(b.studentId)).map((s) => ({
      id: randomUUID(), schoolId: actor.schoolId, studentId: s.studentId, feeStructureId: structure.id,
      title: structure.name, period: input.period, dueDate: new Date(input.dueDate), amount: structure.amount,
      discount: s.discount, fine: input.fine, total: billTotal(structure.amount, s.discount, input.fine),
    }));
    // The database unique key also protects overlapping/concurrent batches and retries.
    await tx.feeBill.createMany({ data: rows, skipDuplicates: true });
    const created = await tx.feeBill.findMany({ where: { schoolId: actor.schoolId, id: { in: rows.map((r) => r.id) } }, select: { id: true, total: true } });
    const result = { created: created.length, skipped: rows.length - created.length, total: created.reduce((sum, row) => sum + row.total, 0) };
    await recordAudit(actor, { action: "fees.bulk.issue", entityType: "FeeBill", newValue: { ...result, billIds: created.map((r) => r.id), classId: input.classId, sectionId: input.sectionId, academicYearId: year.id, feeStructureId: structure.id, period: input.period } }, tx);
    return result;
  }, { timeout: 15_000 }).catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") {
      throw conflict("Another billing batch is running. Try again; existing bills will be skipped");
    }
    throw error;
  });
}
