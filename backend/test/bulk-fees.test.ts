import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { buildRouter } from "../src/http/router.js";
import { errorHandler } from "../src/http/error-handler.js";
import { signAccessToken } from "../src/lib/tokens.js";
import { feesModule } from "../src/modules/fees/fees.routes.js";
import * as bulk from "../src/modules/fees/bulk.service.js";

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
const setup = (period = randomUUID()) => ({ classId, feeStructureId: feeId, period, dueDate: "2026-11-30", fine: 100 });
const issue = (period: string, studentIds = [a, b]) => ({ ...setup(period), academicYearId: yearId, expectedAmount: 100_000, students: studentIds.map((studentId) => ({ studentId, discount: studentId === a ? 10_000 : 0 })) });
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

describe("bulk fee billing", () => {
  it("previews classes or sections without writing bills and excludes inactive students/enrollments", async () => {
    const period = randomUUID();
    expect((await bulk.previewBulk(schoolId, setup(period))).students).toHaveLength(3);
    expect((await bulk.previewBulk(schoolId, { ...setup(period), sectionId: sectionB })).students.map((s) => s.id)).toEqual([c]);
    await prisma.enrollment.updateMany({ where: { studentId: b }, data: { status: "LEFT" } });
    expect((await bulk.previewBulk(schoolId, setup(period))).students.map((s) => s.id)).not.toContain(b);
    await prisma.enrollment.updateMany({ where: { studentId: b }, data: { status: "ACTIVE" } });
    await prisma.student.update({ where: { id: b }, data: { status: "LEFT" } });
    expect((await bulk.previewBulk(schoolId, setup(period))).students.map((s) => s.id)).not.toContain(b);
    await prisma.student.update({ where: { id: b }, data: { status: "ACTIVE" } });
    expect(await prisma.feeBill.count({ where: { schoolId, period } })).toBe(0);
  });
  it("issues selected students with individual discounts, previews duplicates, and makes retries safe", async () => {
    const period = randomUUID();
    expect(await bulk.issueBulk(actor(), issue(period))).toEqual({ created: 2, skipped: 0, total: 190_200 });
    expect(await bulk.issueBulk(actor(), issue(period))).toEqual({ created: 0, skipped: 2, total: 0 });
    const preview = await bulk.previewBulk(schoolId, setup(period));
    expect(preview.students.filter((s) => s.existingBillId)).toHaveLength(2);
    expect(preview.students.find((s) => s.id === c)?.existingBillId).toBeNull();
    const bill = await prisma.feeBill.findFirstOrThrow({ where: { schoolId, period, studentId: a } });
    expect(bill).toMatchObject({ amount: 100_000, discount: 10_000, fine: 100, total: 90_100 });
    expect(await prisma.auditLog.count({ where: { schoolId, action: "fees.bulk.issue" } })).toBe(2);
  });
  it("rejects invalid discounts, duplicated selections, stale prices/years and out-of-section students atomically", async () => {
    const period = randomUUID();
    const body = issue(period);
    await expect(bulk.issueBulk(actor(), { ...body, students: [{ studentId: a, discount: 0 }, { studentId: b, discount: 100_001 }] })).rejects.toMatchObject({ status: 400 });
    await expect(bulk.issueBulk(actor(), issue(period, [a, a]))).rejects.toMatchObject({ status: 400 });
    await expect(bulk.issueBulk(actor(), { ...body, expectedAmount: 1 })).rejects.toMatchObject({ status: 409 });
    await expect(bulk.issueBulk(actor(), { ...body, academicYearId: randomUUID() })).rejects.toMatchObject({ status: 409 });
    await expect(bulk.issueBulk(actor(), { ...body, sectionId: sectionB })).rejects.toMatchObject({ status: 409 });
    await prisma.student.update({ where: { id: b }, data: { status: "LEFT" } });
    await expect(bulk.issueBulk(actor(), body)).rejects.toMatchObject({ status: 409 });
    await prisma.student.update({ where: { id: b }, data: { status: "ACTIVE" } });
    expect(await prisma.feeBill.count({ where: { schoolId, period } })).toBe(0);
  });
  it("isolates school data and validates class/section relationships", async () => {
    expect((await bulk.bulkOptions(foreignSchoolId)).classes).toEqual([]);
    await expect(bulk.previewBulk(foreignSchoolId, setup())).rejects.toMatchObject({ status: 400 });
    await expect(bulk.previewBulk(schoolId, { ...setup(), classId: randomUUID() })).rejects.toMatchObject({ status: 404 });
    await expect(bulk.previewBulk(schoolId, { ...setup(), sectionId: randomUUID() })).rejects.toMatchObject({ status: 404 });
    const foreignFee = await prisma.feeStructure.create({ data: { schoolId: foreignSchoolId, name: "Other fee", amount: 100 } });
    await expect(bulk.previewBulk(schoolId, { ...setup(), feeStructureId: foreignFee.id })).rejects.toMatchObject({ status: 404 });
  });
  it("skips overlapping concurrent batches without duplicating a student bill", async () => {
    const period = randomUUID();
    const results = await Promise.all([bulk.issueBulk(actor(), issue(period)), bulk.issueBulk(actor(), issue(period, [b, a]))]);
    expect(results.reduce((sum, r) => sum + r.created, 0)).toBe(2);
    expect(results.reduce((sum, r) => sum + r.skipped, 0)).toBe(2);
    expect(await prisma.feeBill.count({ where: { schoolId, period } })).toBe(2);
  });
  it("requires fee management permission, validates HTTP input, and respects the module switch", async () => {
    expect((await post("/fees/bulk/preview", setup())).status).toBe(403);
    await prisma.userPermissionOverride.create({ data: { userId, permission: "fees.manage", effect: "GRANT" } });
    expect((await post("/fees/bulk/preview", setup())).status).toBe(200);
    expect((await post("/fees/bulk/issue", { ...issue(randomUUID()), students: [] })).status).toBe(400);
    expect((await post("/fees/bulk/issue", { ...issue(randomUUID()), dueDate: "2026-02-30" })).status).toBe(400);
    const result = await post("/fees/bulk/issue", issue(randomUUID()));
    expect(result.status).toBe(200);
    expect(result.body.created).toBe(2);
    await prisma.school.update({ where: { id: schoolId }, data: { settings: { "modules.fees": false } } });
    expect((await post("/fees/bulk/preview", setup())).status).toBe(403);
    expect((await post("/fees/bulk/issue", issue(randomUUID()))).status).toBe(403);
    await prisma.school.update({ where: { id: schoolId }, data: { settings: {} } });
  });
});
