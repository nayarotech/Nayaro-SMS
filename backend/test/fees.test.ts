import express from "express";
import request from "supertest";
import { buildRouter } from "../src/http/router.js";
import { errorHandler } from "../src/http/error-handler.js";
import { signAccessToken } from "../src/lib/tokens.js";
import { feesModule, parentFeesModule } from "../src/modules/fees/fees.routes.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import * as pdf from "../src/lib/pdf.js";
import * as receipts from "../src/modules/fees/receipt.service.js";
import { storage } from "../src/lib/storage/index.js";
import { verifyLocalSignature } from "../src/lib/storage/local.driver.js";
import { filesModule } from "../src/modules/files/file.routes.js";
import * as fees from "../src/modules/fees/fees.service.js";

let actor: { schoolId: string; userId: string };
let other: { schoolId: string; userId: string };
let studentId: string;
let structureId: string;
const billIds: string[] = [];

async function school() {
  const row = await prisma.school.create({ data: { name: "Fee test", code: randomUUID(), settings: {} } });
  const user = await prisma.user.create({ data: { schoolId: row.id, fullName: "Collector" } });
  return { schoolId: row.id, userId: user.id };
}
beforeAll(async () => {
  actor = await school();
  other = await school();
  const student = await prisma.student.create({ data: { schoolId: actor.schoolId, firstName: "Asha", lastName: "Test", admissionNo: "001", gender: "FEMALE", dateOfBirth: new Date("2018-01-01"), admissionDate: new Date("2026-04-14") } });
  studentId = student.id;
  structureId = (await fees.createStructure(actor, { name: "Tuition", amount: 100_000 })).id;
});
afterAll(async () => {
  if (actor && other) {
    const schoolId = { in: [actor.schoolId, other.schoolId] };
    const files = await prisma.storedFile.findMany({ where: { schoolId }, select: { key: true } });
    await Promise.all(files.map((file) => storage.remove(file.key)));
    await prisma.storedFile.deleteMany({ where: { schoolId } });
    await prisma.feePayment.deleteMany({ where: { schoolId } });
    await prisma.feeBill.deleteMany({ where: { schoolId } });
    await prisma.feeStructure.deleteMany({ where: { schoolId } });
    await prisma.auditLog.deleteMany({ where: { schoolId } });
    await prisma.student.deleteMany({ where: { schoolId } });
    await prisma.guardian.deleteMany({ where: { schoolId } });
    await prisma.user.deleteMany({ where: { schoolId } });
    await prisma.school.deleteMany({ where: { id: schoolId } });
  }
  await prisma.$disconnect();
});
const issue = async (period = randomUUID()) => {
  const bill = await fees.createBill(actor, { studentId, feeStructureId: structureId, period, dueDate: "2026-11-30", discount: 10_000, fine: 500 });
  billIds.push(bill.id);
  return bill;
};
const payment = (amount: number) => ({ requestId: randomUUID(), amount, method: "CASH" });

describe("fee billing and collection", () => {
  it("calculates exact paisa and rejects invalid discounts or overflowing totals", () => {
    expect(fees.billTotal(100_001, 10_000, 50)).toBe(90_051);
    for (const values of [[100, 101, 0], [100, 100, 0], [0, 0, 1], [1.1, 0, 0], [100, -1, 0], [fees.MAX_MONEY, 0, 1]]) {
      expect(() => fees.billTotal(...values as [number, number, number])).toThrow();
    }
  });
  it("snapshots fee amounts and prevents duplicate billing for the same period", async () => {
    const bill = await issue("2083-07");
    expect(bill).toMatchObject({ amount: 100_000, discount: 10_000, fine: 500, total: 90_500, paid: 0 });
    await expect(issue("2083-07")).rejects.toMatchObject({ code: "P2002" });
    await prisma.feeStructure.update({ where: { id: structureId }, data: { amount: 200_000 } });
    expect((await fees.billDetail(actor.schoolId, bill.id)).total).toBe(90_500);
    await prisma.feeStructure.update({ where: { id: structureId }, data: { amount: 100_000 } });
  });
  it("isolates fee structures, student search, bills, and totals by school", async () => {
    expect(await fees.listStructures(other.schoolId)).toEqual([]);
    expect(await fees.studentOptions(other.schoolId, "Asha")).toEqual([]);
    expect((await fees.listBills(other.schoolId, { page: 1, pageSize: 20 })).total).toBe(0);
    expect((await fees.summary(other.schoolId)).outstanding).toBe(0);
    await expect(fees.billDetail(other.schoolId, billIds[0])).rejects.toMatchObject({ status: 404 });
    await expect(fees.collectPayment(other, billIds[0], payment(1))).rejects.toMatchObject({ status: 404 });
    await expect(fees.createBill(other, { studentId, feeStructureId: structureId, period: "2083-07", dueDate: "2026-11-30", discount: 0, fine: 0 })).rejects.toMatchObject({ status: 404 });
    const ownStudent = await prisma.student.create({ data: { schoolId: other.schoolId, firstName: "Other", lastName: "Student", admissionNo: "002", gender: "MALE", dateOfBirth: new Date("2018-01-01"), admissionDate: new Date("2026-04-14") } });
    await expect(fees.createBill(other, { studentId: ownStudent.id, feeStructureId: structureId, period: "2083-07", dueDate: "2026-11-30", discount: 0, fine: 0 })).rejects.toMatchObject({ status: 404 });
  });
  it("records partial and full payments with audit logs; replaying a request is safe", async () => {
    const bill = await issue();
    const body = payment(30_000);
    const first = await fees.collectPayment(actor, bill.id, body);
    expect((await fees.collectPayment(actor, bill.id, body)).id).toBe(first.id);
    expect((await fees.billDetail(actor.schoolId, bill.id)).balance).toBe(60_500);
    await expect(fees.collectPayment(actor, bill.id, { ...body, amount: 10_000 })).rejects.toMatchObject({ status: 409 });
    await expect(fees.collectPayment(actor, bill.id, payment(60_501))).rejects.toMatchObject({ status: 400 });
    await fees.collectPayment(actor, bill.id, payment(60_500));
    expect((await fees.billDetail(actor.schoolId, bill.id)).balance).toBe(0);
    expect(await prisma.feePayment.count({ where: { billId: bill.id } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { schoolId: actor.schoolId, action: "fees.payment.collect", entityId: first.id } })).toBe(1);
    await expect(fees.collectPayment(actor, bill.id, payment(1))).rejects.toMatchObject({ status: 400 });
  });
  it("rejects nonpositive and noninteger payments even outside HTTP", async () => {
    const bill = await issue();
    for (const amount of [0, -1, 0.1, NaN, fees.MAX_MONEY + 1]) {
      await expect(fees.collectPayment(actor, bill.id, payment(amount))).rejects.toMatchObject({ status: 400 });
    }
  });
  it("prevents concurrent collectors from overpaying a bill", async () => {
    const bill = await issue();
    const results = await Promise.allSettled([fees.collectPayment(actor, bill.id, payment(60_000)), fees.collectPayment(actor, bill.id, payment(60_000))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const detail = await fees.billDetail(actor.schoolId, bill.id);
    expect(detail.paid).toBe(60_000);
    expect(detail.payments).toHaveLength(1);
    expect(detail.balance).toBe(30_500);
  });
  it("paginates bills and reconciles totals against the payment ledger", async () => {
    const first = await fees.listBills(actor.schoolId, { page: 1, pageSize: 2, studentId });
    const second = await fees.listBills(actor.schoolId, { page: 2, pageSize: 2, studentId });
    expect(first.items).toHaveLength(2);
    expect(new Set([...first.items, ...second.items].map((b) => b.id)).size).toBe(4);
    const totals = await fees.summary(actor.schoolId);
    const ledger = await prisma.feePayment.aggregate({ where: { schoolId: actor.schoolId }, _sum: { amount: true } });
    expect(totals.collected).toBe(ledger._sum.amount);
    expect(totals.outstanding).toBe(totals.billed - totals.collected);
  });
});


// Exercise the normal auth/permission/module middleware with the fee modules.
const app = express();
app.use(express.json(), buildRouter([feesModule, parentFeesModule, filesModule]), errorHandler);
const get = (who: typeof actor, path: string) => request(app).get(path).set("Authorization", `Bearer ${signAccessToken({ sub: who.userId, schoolId: who.schoolId })}`);
const post = (who: typeof actor, path: string, body: object) => request(app).post(path).set("Authorization", `Bearer ${signAccessToken({ sub: who.userId, schoolId: who.schoolId })}`).send(body);

describe("fee API access and validation", () => {
  it("requires authentication and enforces distinct view, management, report, and collection permissions", async () => {
    expect((await request(app).get("/fees/bills")).status).toBe(401);
    expect((await get(actor, "/fees/bills")).status).toBe(403);
    await prisma.userPermissionOverride.create({ data: { userId: actor.userId, permission: "fees.view", effect: "GRANT" } });
    expect((await get(actor, "/fees/bills")).status).toBe(200);
    expect((await get(actor, "/fees/summary")).status).toBe(403);
    expect((await post(actor, "/fees/structures", { name: "Bus", amount: 100 })).status).toBe(403);
    expect((await post(actor, `/fees/bills/${billIds[0]}/payments`, payment(1))).status).toBe(403);
    await prisma.userPermissionOverride.createMany({ data: ["fees.manage", "fees.collect", "fees.report"].map((permission) => ({ userId: actor.userId, permission, effect: "GRANT" as const })) });
  });
  it("validates money, dates and payment methods before writes", async () => {
    for (const amount of [0, -1, 1.5, fees.MAX_MONEY + 1]) {
      expect((await post(actor, "/fees/structures", { name: "Invalid", amount })).status).toBe(400);
    }
    expect((await post(actor, "/fees/bills", { studentId, feeStructureId: structureId, period: "invalid-date", dueDate: "2026-02-30" })).status).toBe(400);
    expect((await post(actor, `/fees/bills/${billIds[0]}/payments`, { ...payment(1), method: "UNKNOWN" })).status).toBe(400);
    const response = await get(actor, "/fees/summary");
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("outstanding");
  });
  it("lets parents see only linked children and respects the fees module switch", async () => {
    const guardian = await prisma.guardian.create({ data: { schoolId: actor.schoolId, userId: actor.userId } });
    await prisma.studentGuardian.create({ data: { studentId, guardianId: guardian.id, relation: "MOTHER" } });
    const parent = await prisma.user.create({ data: { schoolId: actor.schoolId, fullName: "Unrelated parent" } });
    const unrelated = { schoolId: actor.schoolId, userId: parent.id };
    expect((await get(unrelated, `/my/children/${studentId}/fees`)).status).toBe(404);
    expect((await get(other, `/my/children/${studentId}/fees`)).status).toBe(404);
    const own = await get(actor, `/my/children/${studentId}/fees`);
    expect(own.status).toBe(200);
    expect(own.body.total).toBeGreaterThan(0);
    await prisma.school.update({ where: { id: actor.schoolId }, data: { settings: { "modules.fees": false } } });
    try {
      expect((await get(actor, "/fees/bills")).status).toBe(403);
      expect((await get(actor, `/my/children/${studentId}/fees`)).status).toBe(403);
    } finally {
      await prisma.school.update({ where: { id: actor.schoolId }, data: { settings: {} } });
    }
  });
  it("gives a parent without staff permissions scoped totals and receipt history", async () => {
    const user = await prisma.user.create({ data: { schoolId: actor.schoolId, fullName: "Linked parent" } });
    const parent = { schoolId: actor.schoolId, userId: user.id };
    const guardian = await prisma.guardian.create({ data: { schoolId: actor.schoolId, userId: user.id } });
    const sibling = await prisma.student.create({ data: { schoolId: actor.schoolId, firstName: "Sibling", lastName: "Test", admissionNo: "003", gender: "MALE", dateOfBirth: new Date("2018-01-01"), admissionDate: new Date("2026-04-14") } });
    await prisma.studentGuardian.createMany({ data: [studentId, sibling.id].map((id) => ({ studentId: id, guardianId: guardian.id, relation: "FATHER" as const })) });
    const empty = await get(parent, `/my/children/${sibling.id}/fees`);
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({ items: [], total: 0, summary: { billed: 0, paid: 0, outstanding: 0 } });
    const siblingBill = await fees.createBill(actor, { studentId: sibling.id, feeStructureId: structureId, period: "2083-08", dueDate: "2026-12-01", discount: 0, fine: 0 });
    const list = await get(parent, `/my/children/${studentId}/fees?pageSize=1`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    const totals = await prisma.feeBill.aggregate({ where: { schoolId: actor.schoolId, studentId }, _sum: { total: true, paid: true } });
    expect(list.body.summary).toEqual({ billed: totals._sum.total, paid: totals._sum.paid, outstanding: totals._sum.total! - totals._sum.paid! });
    expect(list.body.summary.billed).toBeGreaterThan(list.body.items[0].total);
    const detail = await get(parent, `/my/children/${studentId}/fees/${billIds[1]}`);
    expect(detail.status).toBe(200);
    expect(detail.body.balance).toBe(0);
    expect(detail.body.payments).toHaveLength(2);
    expect(detail.body.payments[0]).toHaveProperty("id");
    expect(detail.body.payments[0]).not.toHaveProperty("collectedBy");
    expect(detail.body.payments[0]).not.toHaveProperty("requestId");
    expect((await get(parent, "/fees/bills")).status).toBe(403);
    expect((await get(parent, `/my/children/${studentId}/fees/${siblingBill.id}`)).status).toBe(404);
    expect((await get(other, `/my/children/${studentId}/fees/${billIds[1]}`)).status).toBe(404);
    const stranger = await prisma.user.create({ data: { schoolId: actor.schoolId, fullName: "Unlinked parent" } });
    expect((await get({ schoolId: actor.schoolId, userId: stranger.id }, `/my/children/${studentId}/fees/${billIds[1]}`)).status).toBe(404);
    await prisma.school.update({ where: { id: actor.schoolId }, data: { settings: { "modules.fees": false } } });
    try {
      expect((await get(parent, `/my/children/${studentId}/fees/${billIds[1]}`)).status).toBe(403);
    } finally {
      await prisma.school.update({ where: { id: actor.schoolId }, data: { settings: {} } });
    }
  });

  it("renders escaped receipt HTML and keeps payment amounts separate from current balances", async () => {
    const payment = await prisma.feePayment.findFirstOrThrow({ where: { billId: billIds[1] } });
    const data = await receipts.receiptData(actor.schoolId, payment.id);
    const document = receipts.receiptHtml({ name: "School <script>", address: "Kathmandu", phone: null, email: null, logoUrl: null, color: "#2563eb" }, { ...data, reference: "<img src=x onerror=alert(1)>" });
    expect(document).toContain("School &lt;script&gt;");
    expect(document).not.toContain("<img src=x onerror");
    expect(document).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(document).toContain(payment.id);
    expect(document).toContain("Asha Test");
    expect(document).toContain("001");
    expect(document).toContain("Amount received for this receipt");
    expect(document).toContain("Current outstanding balance");
    expect(document).toContain("including any later payments");
    expect(document).toContain("Payment method");
  });
  it("enforces receipt permissions and issues private expiring parent downloads", async () => {
    const payment = await prisma.feePayment.findFirstOrThrow({ where: { billId: billIds[1] } });
    const render = vi.spyOn(pdf, "htmlToPdf").mockResolvedValue(Buffer.from("%PDF-1.7\nreceipt-test"));
    try {
      const staff = await get(actor, `/fees/payments/${payment.id}/receipt`);
      expect(staff.status).toBe(200);
      expect(staff.headers["content-type"]).toContain("application/pdf");
      expect(staff.headers["content-disposition"]).toContain(`receipt-${payment.id}.pdf`);
      expect(staff.body.toString()).toContain("%PDF-");
      expect((await request(app).get(`/fees/payments/${payment.id}/receipt`)).status).toBe(401);
      expect((await get(other, `/fees/payments/${payment.id}/receipt`)).status).toBe(403);
      await expect(receipts.receiptData(other.schoolId, payment.id)).rejects.toMatchObject({ status: 404 });
      const parentUser = await prisma.user.findFirstOrThrow({ where: { schoolId: actor.schoolId, fullName: "Linked parent" } });
      const parent = { schoolId: actor.schoolId, userId: parentUser.id };
      expect((await get(parent, `/fees/payments/${payment.id}/receipt`)).status).toBe(403);
      const path = `/my/children/${studentId}/fees/${billIds[1]}/payments/${payment.id}/receipt-link`;
      const link = await post(parent, path, {});
      expect(link.status).toBe(200);
      const url = new URL(link.body.url);
      const key = url.searchParams.get("key")!;
      expect(verifyLocalSignature(key, Number(url.searchParams.get("exp")), url.searchParams.get("sig")!)).toBe(true);
      expect((await prisma.storedFile.findUniqueOrThrow({ where: { key } })).isPublic).toBe(false);
      const download = await request(app).get(url.pathname.replace(/^\/api/, "") + url.search);
      expect(download.status).toBe(200);
      expect(download.body.toString()).toContain("%PDF-");
      expect((await request(app).get(`/files/public/${key}`)).status).toBe(404);
      expect((await post(other, path, {})).status).toBe(404);
      expect((await post(parent, `/my/children/${studentId}/fees/${billIds[0]}/payments/${payment.id}/receipt-link`, {})).status).toBe(404);
      const stranger = await prisma.user.findFirstOrThrow({ where: { schoolId: actor.schoolId, fullName: "Unlinked parent" } });
      expect((await post({ schoolId: actor.schoolId, userId: stranger.id }, path, {})).status).toBe(404);
      await prisma.school.update({ where: { id: actor.schoolId }, data: { settings: { "modules.fees": false } } });
      expect((await post(parent, path, {})).status).toBe(403);
      expect((await get(actor, `/fees/payments/${payment.id}/receipt`)).status).toBe(403);
    } finally {
      render.mockRestore();
      await prisma.school.update({ where: { id: actor.schoolId }, data: { settings: {} } });
    }
  });

});
