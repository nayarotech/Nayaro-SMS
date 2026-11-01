import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { buildRouter } from "../src/http/router.js";
import { errorHandler } from "../src/http/error-handler.js";
import { signAccessToken } from "../src/lib/tokens.js";
import { feesModule } from "../src/modules/fees/fees.routes.js";
import * as fees from "../src/modules/fees/fees.service.js";
import { reversePayment } from "../src/modules/fees/reversal.service.js";
import * as reports from "../src/modules/fees/collection-reports.service.js";
import * as receipts from "../src/modules/fees/receipt.service.js";
import * as pdf from "../src/lib/pdf.js";
import { storage } from "../src/lib/storage/index.js";
import { filesModule } from "../src/modules/files/file.routes.js";
import ExcelJS from "exceljs";

let schoolId: string;
let foreignSchoolId: string;
let userId: string;
let yearId: string;
let classId: string;
let sectionA: string;
let sectionB: string;
let feeId: string;
let a: string;
let b: string;
let c: string;
const app = express();
app.use(express.json(), buildRouter([feesModule, filesModule]), errorHandler);
const actor = () => ({ schoolId, userId });
const post = (path: string, body: object) => request(app).post(path).set("Authorization", `Bearer ${signAccessToken({ sub: userId, schoolId })}`).send(body);

beforeAll(async () => {
  schoolId = (await prisma.school.create({ data: { name: "Bulk test", code: randomUUID(), settings: {} } })).id;
  foreignSchoolId = (await prisma.school.create({ data: { name: "Other school", code: randomUUID(), settings: {} } })).id;
  userId = (await prisma.user.create({ data: { schoolId, fullName: "Accountant" } })).id;
  yearId = (await prisma.academicYear.create({ data: { schoolId, name: "2083", startDate: new Date("2026-04-14"), endDate: new Date("2027-04-13"), isCurrent: true } })).id;
  classId = (await prisma.schoolClass.create({ data: { schoolId, name: "Grade 1", order: 1 } })).id;
  sectionA = (await prisma.section.create({ data: { schoolId, classId, name: "A" } })).id;
  sectionB = (await prisma.section.create({ data: { schoolId, classId, name: "B" } })).id;
  feeId = (await prisma.feeStructure.create({ data: { schoolId, name: "Tuition", amount: 100_000 } })).id;
  for (const [index, sectionId] of [sectionA, sectionA, sectionB].entries()) {
    const student = await prisma.student.create({ data: { schoolId, admissionNo: `B${index}`, firstName: `Student ${index}`, lastName: "Test", gender: "FEMALE", dateOfBirth: new Date("2018-01-01"), admissionDate: new Date("2026-04-14") } });
    await prisma.enrollment.create({ data: { schoolId, academicYearId: yearId, classId, sectionId, studentId: student.id, rollNo: index + 1 } });
    if (index === 0) a = student.id;
    if (index === 1) b = student.id;
    if (index === 2) c = student.id;
  }
});
afterAll(async () => {
  if (schoolId && foreignSchoolId) {
    const schools = { in: [schoolId, foreignSchoolId] };
    const files = await prisma.storedFile.findMany({ where: { schoolId: schools }, select: { key: true } });
    await Promise.all(files.map((f) => storage.remove(f.key)));
    await prisma.storedFile.deleteMany({ where: { schoolId: schools } });
    await prisma.feePayment.deleteMany({ where: { schoolId: schools } });
    await prisma.feeBill.deleteMany({ where: { schoolId: schools } });
    await prisma.feeStructure.deleteMany({ where: { schoolId: schools } });
    await prisma.auditLog.deleteMany({ where: { schoolId: schools } });
    await prisma.student.deleteMany({ where: { schoolId: schools } });
    await prisma.section.deleteMany({ where: { schoolId: schools } });
    await prisma.schoolClass.deleteMany({ where: { schoolId: schools } });
    await prisma.academicYear.deleteMany({ where: { schoolId: schools } });
    await prisma.guardian.deleteMany({ where: { schoolId: schools } });
    await prisma.user.deleteMany({ where: { schoolId: schools } });
    await prisma.school.deleteMany({ where: { id: schools } });
  }
  await prisma.$disconnect();
});


beforeAll(async () => {
  const guardian = await prisma.guardian.create({ data: { schoolId, userId } });
  await prisma.studentGuardian.createMany({ data: [a, b, c].map((studentId) => ({ studentId, guardianId: guardian.id, relation: "FATHER" as const })) });
});
async function collected(studentId = a, method = "CASH", amount = 60000) {
  const bill = await fees.createBill(actor(), { studentId, feeStructureId: feeId, period: randomUUID(), dueDate: "2026-11-01", discount: 0, fine: 0 });
  const input = { requestId: randomUUID(), amount, method };
  const payment = await fees.collectPayment(actor(), bill.id, input);
  await prisma.feePayment.update({ where: { id: payment.id }, data: { createdAt: new Date("2026-11-01T00:00:00Z") } });
  return { bill, payment: await prisma.feePayment.findUniqueOrThrow({ where: { id: payment.id } }), input };
}

describe("payment reversals", () => {
  it("restores the balance once, preserves the original record and audit, and refuses reuse of its request ID", async () => {
    const { bill, payment, input } = await collected();
    const reversed = await reversePayment(actor(), payment.id, "Duplicate payment entered");
    expect(reversed).toMatchObject({ id: payment.id, amount: payment.amount, createdAt: payment.createdAt, requestId: input.requestId, collectedBy: userId, reversedBy: userId, reversalReason: "Duplicate payment entered" });
    expect(reversed.reversedAt).toBeInstanceOf(Date);
    expect((await fees.billDetail(schoolId, bill.id)).balance).toBe(100000);
    expect((await reversePayment(actor(), payment.id, "Duplicate payment entered")).reversedAt).toEqual(reversed.reversedAt);
    expect(await prisma.auditLog.count({ where: { schoolId, action: "fees.payment.reverse", entityId: payment.id } })).toBe(1);
    await expect(reversePayment(actor(), payment.id, "Replace previous reason")).rejects.toMatchObject({ status: 409 });
    await expect(fees.collectPayment(actor(), bill.id, input)).rejects.toMatchObject({ status: 409 });
    await fees.collectPayment(actor(), bill.id, { ...input, requestId: randomUUID(), amount: 40000 });
    expect((await fees.billDetail(schoolId, bill.id)).paid).toBe(40000);
    expect(await prisma.feePayment.count({ where: { billId: bill.id } })).toBe(2);
    const parent = await fees.childBillDetail(schoolId, userId, a, bill.id);
    expect(parent.payments.find((p) => p.id === payment.id)).toMatchObject({ reversalReason: "Duplicate payment entered", reversedAt: reversed.reversedAt });
  });
  it("serializes concurrent reversals and reconciles with a concurrent collection", async () => {
    const { bill, payment } = await collected();
    await Promise.all([reversePayment(actor(), payment.id, "Duplicate receipt recorded"), reversePayment(actor(), payment.id, "Duplicate receipt recorded")]);
    expect((await fees.billDetail(schoolId, bill.id)).paid).toBe(0);
    expect(await prisma.auditLog.count({ where: { entityId: payment.id, action: "fees.payment.reverse" } })).toBe(1);
    const another = await collected();
    const input = { requestId: randomUUID(), amount: 10000, method: "CASH" };
    const results = await Promise.allSettled([reversePayment(actor(), another.payment.id, "Incorrect receipt recorded"), fees.collectPayment(actor(), another.bill.id, input)]);
    expect(results[0].status).toBe("fulfilled");
    if (results[1].status === "rejected") await fees.collectPayment(actor(), another.bill.id, input);
    expect((await fees.billDetail(schoolId, another.bill.id)).paid).toBe(10000);
    const active = await prisma.feePayment.aggregate({ where: { billId: another.bill.id, reversedAt: null }, _sum: { amount: true } });
    expect(active._sum.amount).toBe(10000);
  });
  it("updates net reports, daily totals and Excel while retaining original payment amounts", async () => {
    const { bill, payment } = await collected(c, "OTHER");
    await reversePayment(actor(), payment.id, "Incorrect payment amount");
    const query = { start: "2026-11-01", end: "2026-11-01", sectionId: sectionB, method: "OTHER" as const, page: 1, pageSize: 20 };
    const data = await reports.collectionReport(schoolId, query);
    expect(data).toMatchObject({ total: 1, collected: 0, grossCollected: 60000, reversedAmount: 60000 });
    expect(data.items[0]).toMatchObject({ id: payment.id, amount: 60000, effectiveAmount: 0, reversalReason: "Incorrect payment amount" });
    expect(data.daily).toEqual([{ day: "2026-11-01", total: 0, count: 1 }]);
    expect((await reports.unpaidReport(schoolId, query)).items.find((b) => b.id === bill.id)?.balance).toBe(100000);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await reports.reportXlsx(schoolId, query, "payments"));
    expect(workbook.getWorksheet("Collections")!.getCell("K2").value).toBe(600);
    expect(workbook.getWorksheet("Collections")!.getCell("L2").value).toBe("REVERSED");
    expect(workbook.getWorksheet("Collections")!.getCell("P2").value).toBe(0);
    expect(workbook.getWorksheet("Daily totals")!.getCell("C2").value).toBe(0);
  });
  it("revokes old parent PDF links and marks regenerated receipts as reversed", async () => {
    const { bill, payment } = await collected();
    const render = vi.spyOn(pdf, "htmlToPdf").mockResolvedValue(Buffer.from("%PDF-1.7 receipt"));
    try {
      const old = new URL((await receipts.parentReceiptLink(actor(), a, bill.id, payment.id)).url);
      const original = await request(app).get(old.pathname.replace(/^\/api/, "") + old.search);
      expect(original.status).toBe(200);
      expect(original.headers["cache-control"]).toBe("private, no-store");
      await reversePayment(actor(), payment.id, "Wrong receipt <script> entered");
      expect((await request(app).get(old.pathname.replace(/^\/api/, "") + old.search)).status).toBe(404);
      await receipts.parentReceiptLink(actor(), a, bill.id, payment.id);
      const document = render.mock.calls.at(-1)![0];
      expect(document).toContain("REVERSED PAYMENT");
      expect(document).toContain("Wrong receipt &lt;script&gt; entered");
      expect(document).toContain(payment.id);
      expect(document).toContain("Original payment amount (reversed)");
    } finally { render.mockRestore(); }
  });
  it("does not publish a stale receipt generated concurrently with reversal", async () => {
    const { bill, payment } = await collected();
    const render = vi.spyOn(pdf, "htmlToPdf").mockImplementationOnce(async () => {
      await reversePayment(actor(), payment.id, "Concurrent receipt correction");
      return Buffer.from("%PDF-1.7 old receipt");
    });
    try {
      await expect(receipts.parentReceiptLink(actor(), a, bill.id, payment.id)).rejects.toMatchObject({ status: 409 });
      expect(await prisma.storedFile.count({ where: { schoolId, originalName: `receipt-${payment.id}.pdf` } })).toBe(0);
    } finally { render.mockRestore(); }
  });
  it("requires separate reversal permission, validates reasons, and isolates schools", async () => {
    const { bill, payment } = await collected();
    await prisma.userPermissionOverride.create({ data: { userId, permission: "fees.collect", effect: "GRANT" } });
    expect((await post(`/fees/payments/${payment.id}/reverse`, { reason: "Incorrect receipt" })).status).toBe(403);
    await prisma.userPermissionOverride.create({ data: { userId, permission: "fees.reverse", effect: "GRANT" } });
    expect((await post(`/fees/payments/${payment.id}/reverse`, { reason: "  " })).status).toBe(400);
    expect((await post(`/fees/payments/${payment.id}/reverse`, { reason: "x".repeat(501) })).status).toBe(400);
    await expect(reversePayment({ schoolId: foreignSchoolId, userId }, payment.id, "Foreign receipt correction")).rejects.toMatchObject({ status: 404 });
    await prisma.school.update({ where: { id: schoolId }, data: { settings: { "modules.fees": false } } });
    expect((await post(`/fees/payments/${payment.id}/reverse`, { reason: "Incorrect receipt" })).status).toBe(403);
    await prisma.school.update({ where: { id: schoolId }, data: { settings: {} } });
    expect((await post(`/fees/payments/${payment.id}/reverse`, { reason: "Incorrect receipt" })).status).toBe(200);
    expect((await fees.billDetail(schoolId, bill.id)).paid).toBe(0);
  });
});
