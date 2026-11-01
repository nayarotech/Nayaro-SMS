import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { buildRouter } from "../src/http/router.js";
import { errorHandler } from "../src/http/error-handler.js";
import { signAccessToken } from "../src/lib/tokens.js";
import { feesModule } from "../src/modules/fees/fees.routes.js";
import * as recurring from "../src/modules/fees/recurring.service.js";
import { createBill } from "../src/modules/fees/fees.service.js";
import { bsToAd } from "../src/lib/nepali-date.js";

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
app.use(express.json(), buildRouter([feesModule]), errorHandler);
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
    await prisma.feeRecurringRun.deleteMany({ where: { schoolId: schools } });
    await prisma.feeRecurringDiscount.deleteMany({ where: { schoolId: schools } });
    await prisma.feeRecurringPlan.deleteMany({ where: { schoolId: schools } });
    await prisma.feeBill.deleteMany({ where: { schoolId: schools } });
    await prisma.feeStructure.deleteMany({ where: { schoolId: schools } });
    await prisma.auditLog.deleteMany({ where: { schoolId: schools } });
    await prisma.student.deleteMany({ where: { schoolId: schools } });
    await prisma.section.deleteMany({ where: { schoolId: schools } });
    await prisma.schoolClass.deleteMany({ where: { schoolId: schools } });
    await prisma.academicYear.deleteMany({ where: { schoolId: schools } });
    await prisma.user.deleteMany({ where: { schoolId: schools } });
    await prisma.school.deleteMany({ where: { id: schools } });
  }
  await prisma.$disconnect();
});


const planInput = (sectionId?: string) => ({ name: `Monthly ${randomUUID()}`, classId, sectionId, feeStructureId: feeId, calendar: "AD" as const, billingDay: 1, dueDay: 10 });

describe("reviewed recurring fee plans", () => {
  it("calculates BS/AD schedules and rejects invalid months or day ordering", () => {
    expect(recurring.monthlyDates("AD", "2026-02", 1, 28)).toEqual({ billingDate: "2026-02-01", dueDate: "2026-02-28" });
    expect(recurring.monthlyDates("BS", "2083-07", 1, 10)).toEqual({ billingDate: bsToAd("2083-07-01"), dueDate: bsToAd("2083-07-10") });
    for (const [month, billing, due] of [["2026-13", 1, 10], ["2026-02", 0, 10], ["2026-02", 1, 29], ["2026-02", 10, 1]] as const) expect(() => recurring.monthlyDates("AD", month, billing, due)).toThrow();
    expect(() => recurring.monthlyDates("BS", "9000-01", 1, 10)).toThrow();
  });
  it("saves reusable student discounts and previews later months without creating bills", async () => {
    const plan = await recurring.createPlan(actor(), planInput());
    const first = await recurring.previewPlan(schoolId, plan.id, "2026-11");
    expect(first.students).toHaveLength(3);
    await recurring.saveDiscounts(actor(), plan.id, { version: first.version, expectedAmount: first.amount, students: [{ studentId: a, discount: 10000 }] });
    const updated = await recurring.previewPlan(schoolId, plan.id, "2026-11");
    expect(updated.students.find((s) => s.id === a)).toMatchObject({ discount: 10000, total: 90000 });
    expect((await recurring.previewPlan(schoolId, plan.id, "2026-12")).students.find((s) => s.id === a)?.discount).toBe(10000);
    expect(updated.fingerprint).not.toBe(first.fingerprint);
    expect(await prisma.feeBill.count({ where: { schoolId } })).toBe(0);
  });
  it("issues atomically, skips manual duplicates, and records exactly one run across concurrent retries", async () => {
    const plan = await recurring.createPlan(actor(), planInput());
    await createBill(actor(), { studentId: a, feeStructureId: feeId, period: "2026-12", dueDate: "2026-12-10", discount: 0, fine: 0 });
    const preview = await recurring.previewPlan(schoolId, plan.id, "2026-12");
    expect(preview.students.find((s) => s.id === a)?.existingBillId).toBeTruthy();
    const results = await Promise.all([recurring.issuePlan(actor(), plan.id, "2026-12", preview.fingerprint), recurring.issuePlan(actor(), plan.id, "2026-12", preview.fingerprint)]);
    expect(results[0]).toMatchObject({ created: 2, skipped: 1, total: 200000 });
    expect(results[1].id).toBe(results[0].id);
    expect(await prisma.feeRecurringRun.count({ where: { planId: plan.id } })).toBe(1);
    expect(await prisma.feeBill.count({ where: { schoolId, period: "2026-12" } })).toBe(3);
    const overlapping = await recurring.createPlan(actor(), planInput());
    const otherPreview = await recurring.previewPlan(schoolId, overlapping.id, "2026-12");
    expect(await recurring.issuePlan(actor(), overlapping.id, "2026-12", otherPreview.fingerprint)).toMatchObject({ created: 0, skipped: 3, total: 0 });
    expect((await recurring.previewPlan(schoolId, plan.id, "2026-12")).completedRun?.id).toBe(results[0].id);
    expect((await recurring.listPlans(schoolId)).find((p) => p.id === plan.id)?.runs[0].total).toBe(200000);
  });
  it("rejects stale fee amounts, rosters and saved discounts without issuing any bills", async () => {
    const plan = await recurring.createPlan(actor(), planInput(sectionA));
    const preview = await recurring.previewPlan(schoolId, plan.id, "2027-01");
    await prisma.feeStructure.update({ where: { id: feeId }, data: { amount: 110000 } });
    await expect(recurring.issuePlan(actor(), plan.id, "2027-01", preview.fingerprint)).rejects.toMatchObject({ status: 409 });
    await prisma.feeStructure.update({ where: { id: feeId }, data: { amount: 100000 } });
    await prisma.enrollment.updateMany({ where: { studentId: b }, data: { status: "LEFT" } });
    await expect(recurring.issuePlan(actor(), plan.id, "2027-01", preview.fingerprint)).rejects.toMatchObject({ status: 409 });
    await prisma.enrollment.updateMany({ where: { studentId: b }, data: { status: "ACTIVE" } });
    await recurring.saveDiscounts(actor(), plan.id, { version: preview.version, expectedAmount: preview.amount, students: [{ studentId: a, discount: 1 }] });
    await expect(recurring.issuePlan(actor(), plan.id, "2027-01", preview.fingerprint)).rejects.toMatchObject({ status: 409 });
    await expect(recurring.saveDiscounts(actor(), plan.id, { version: preview.version, expectedAmount: preview.amount, students: [] })).rejects.toMatchObject({ status: 409 });
    expect(await prisma.feeBill.count({ where: { schoolId, period: "2027-01" } })).toBe(0);
    const fresh = await recurring.previewPlan(schoolId, plan.id, "2027-01");
    expect((await recurring.issuePlan(actor(), plan.id, "2027-01", fresh.fingerprint)).total).toBe(199999);
  });
  it("validates student discounts, paused plans, academic-year boundaries and school isolation", async () => {
    const plan = await recurring.createPlan(actor(), planInput(sectionA));
    let preview = await recurring.previewPlan(schoolId, plan.id, "2027-02");
    const discount = { version: preview.version, expectedAmount: preview.amount };
    await expect(recurring.saveDiscounts(actor(), plan.id, { ...discount, students: [{ studentId: c, discount: 1 }] })).rejects.toMatchObject({ status: 400 });
    await expect(recurring.saveDiscounts(actor(), plan.id, { ...discount, students: [{ studentId: a, discount: 100000 }] })).rejects.toMatchObject({ status: 400 });
    await expect(recurring.saveDiscounts(actor(), plan.id, { ...discount, students: [{ studentId: a, discount: 1 }, { studentId: a, discount: 2 }] })).rejects.toMatchObject({ status: 400 });
    await recurring.setPlanActive(actor(), plan.id, false);
    await expect(recurring.previewPlan(schoolId, plan.id, "2027-02")).rejects.toMatchObject({ status: 409 });
    await expect(recurring.issuePlan(actor(), plan.id, "2027-02", preview.fingerprint)).rejects.toMatchObject({ status: 409 });
    await recurring.setPlanActive(actor(), plan.id, true);
    await expect(recurring.issuePlan(actor(), plan.id, "2027-02", preview.fingerprint)).rejects.toMatchObject({ status: 409 });
    await expect(recurring.previewPlan(schoolId, plan.id, "2025-11")).rejects.toMatchObject({ status: 400 });
    await expect(recurring.previewPlan(foreignSchoolId, plan.id, "2027-02")).rejects.toMatchObject({ status: 404 });
    await expect(recurring.setPlanActive({ schoolId: foreignSchoolId, userId }, plan.id, false)).rejects.toMatchObject({ status: 404 });
    preview = await recurring.previewPlan(schoolId, plan.id, "2027-02");
    await prisma.academicYear.update({ where: { id: yearId }, data: { isCurrent: false } });
    const next = await prisma.academicYear.create({ data: { schoolId, name: "2084", startDate: new Date("2027-04-14"), endDate: new Date("2028-04-13"), isCurrent: true } });
    try { await expect(recurring.issuePlan(actor(), plan.id, "2027-02", preview.fingerprint)).rejects.toMatchObject({ status: 409 }); }
    finally { await prisma.academicYear.update({ where: { id: next.id }, data: { isCurrent: false } }); await prisma.academicYear.update({ where: { id: yearId }, data: { isCurrent: true } }); }
  });
  it("requires fee management, validates calendar input, serializes run totals, and respects module settings", async () => {
    expect((await post("/fees/recurring", planInput())).status).toBe(403);
    await prisma.userPermissionOverride.create({ data: { userId, permission: "fees.manage", effect: "GRANT" } });
    expect((await post("/fees/recurring", { ...planInput(), calendar: "INVALID" })).status).toBe(400);
    expect((await post("/fees/recurring", { ...planInput(), billingDay: 20, dueDay: 1 })).status).toBe(400);
    const created = await post("/fees/recurring", planInput()); expect(created.status).toBe(201);
    const list = await request(app).get("/fees/recurring").set("Authorization", `Bearer ${signAccessToken({ sub: userId, schoolId })}`);
    expect(list.status).toBe(200);
    expect(list.body.some((p: { runs: unknown[] }) => p.runs.length > 0)).toBe(true);
    expect((await post(`/fees/recurring/${created.body.id}/preview`, { month: "2026-13" })).status).toBe(400);
    await prisma.school.update({ where: { id: schoolId }, data: { settings: { "modules.fees": false } } });
    expect((await post(`/fees/recurring/${created.body.id}/preview`, { month: "2027-03" })).status).toBe(403);
  });
  it("prevents deleting a section from silently expanding a section-specific plan", async () => {
    await prisma.school.update({ where: { id: schoolId }, data: { settings: {} } });
    const section = await prisma.section.create({ data: { schoolId, classId, name: "Empty recurring section" } });
    const plan = await recurring.createPlan(actor(), planInput(section.id));
    await expect(prisma.section.delete({ where: { id: section.id } })).rejects.toMatchObject({ code: "P2003" });
    expect((await prisma.feeRecurringPlan.findUniqueOrThrow({ where: { id: plan.id } })).sectionId).toBe(section.id);
  });

});
