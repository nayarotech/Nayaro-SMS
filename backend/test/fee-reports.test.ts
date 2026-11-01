import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { buildRouter } from "../src/http/router.js";
import { errorHandler } from "../src/http/error-handler.js";
import { signAccessToken } from "../src/lib/tokens.js";
import { feesModule } from "../src/modules/fees/fees.routes.js";
import * as reports from "../src/modules/fees/collection-reports.service.js";
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
app.use(express.json(), buildRouter([feesModule]), errorHandler);
const actor = () => ({ schoolId, userId });

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
    await prisma.feePayment.deleteMany({ where: { schoolId: schools } });
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


let secondCollector: string;
let billId: string;
beforeAll(async () => {
  secondCollector = (await prisma.user.create({ data: { schoolId, fullName: "Second collector" } })).id;
  billId = (await prisma.feeBill.create({ data: { schoolId, studentId: a, feeStructureId: feeId, title: "Tuition", period: "2083-07", dueDate: new Date("2026-11-01"), amount: 100000, total: 100000, paid: 60106 } })).id;
  await prisma.feeBill.create({ data: { schoolId, studentId: b, feeStructureId: feeId, title: "Tuition", period: "2083-07", dueDate: new Date("2026-11-02"), amount: 30000, total: 30000 } });
  await prisma.feeBill.create({ data: { schoolId, studentId: c, feeStructureId: feeId, title: "Tuition", period: "2083-07", dueDate: new Date("2026-11-01"), amount: 100000, total: 100000, paid: 100000 } });
  await prisma.student.update({ where: { id: a }, data: { firstName: "=HYPERLINK(test)" } });
  await prisma.feePayment.createMany({ data: [
    { schoolId, billId, requestId: randomUUID(), amount: 100, method: "CASH", collectedBy: userId, createdAt: new Date("2026-10-31T18:14:59.999Z") },
    { schoolId, billId, requestId: randomUUID(), amount: 10001, method: "CASH", collectedBy: userId, createdAt: new Date("2026-10-31T18:15:00Z"), reference: "=HYPERLINK(test)" },
    { schoolId, billId, requestId: randomUUID(), amount: 20002, method: "BANK", collectedBy: secondCollector, createdAt: new Date("2026-11-01T18:14:59.999Z") },
    { schoolId, billId, requestId: randomUUID(), amount: 30003, method: "CASH", collectedBy: userId, createdAt: new Date("2026-11-01T18:15:00Z") },
  ] });
});
const filter = { start: "2026-11-01", end: "2026-11-01", page: 1, pageSize: 1 };
const get = (path: string) => request(app).get(path).set("Authorization", `Bearer ${signAccessToken({ sub: userId, schoolId })}`);

describe("collection reports and exports", () => {
  it("uses inclusive Nepal calendar dates and totals all matching rows across pages", async () => {
    const data = await reports.collectionReport(schoolId, filter);
    expect(data.total).toBe(2);
    expect(data.items).toHaveLength(1);
    expect(data.collected).toBe(30003);
    expect(data.daily).toEqual([{ day: "2026-11-01", total: 30003, count: 2 }]);
    const next = await reports.collectionReport(schoolId, { ...filter, page: 2 });
    expect(next.items[0].id).not.toBe(data.items[0].id);
    const wider = await reports.collectionReport(schoolId, { ...filter, end: "2026-11-02" });
    expect(wider.collected).toBe(60006);
    expect(wider.daily).toHaveLength(2);
  });
  it("applies class, section, method and collector filters consistently to rows and daily totals", async () => {
    const data = await reports.collectionReport(schoolId, { ...filter, classId, sectionId: sectionA, method: "BANK", collectorId: secondCollector });
    expect(data).toMatchObject({ total: 1, collected: 20002 });
    expect(data.daily).toEqual([{ day: "2026-11-01", total: 20002, count: 1 }]);
    expect(data.items[0]).toMatchObject({ collector: "Second collector", classSection: "Grade 1 A" });
    expect((await reports.collectionReport(schoolId, { ...filter, sectionId: sectionB })).total).toBe(0);
    expect((await reports.collectionReport(schoolId, { ...filter, collectorId: secondCollector, method: "CASH" })).daily).toEqual([]);
    expect((await reports.collectionReport(foreignSchoolId, filter)).collected).toBe(0);
    expect((await reports.reportOptions(foreignSchoolId)).collectors).toEqual([]);
  });
  it("reports current unpaid balances by due date, not payment date", async () => {
    const data = await reports.unpaidReport(schoolId, filter);
    expect(data.total).toBe(1);
    expect(data.outstanding).toBe(39894);
    expect(data.items[0]).toMatchObject({ id: billId, total: 100000, paid: 60106, balance: 39894 });
    expect((await reports.unpaidReport(schoolId, { ...filter, end: "2026-11-02" })).outstanding).toBe(69894);
    expect((await reports.unpaidReport(schoolId, { ...filter, sectionId: sectionB })).total).toBe(0);
    expect((await reports.unpaidReport(foreignSchoolId, filter)).total).toBe(0);
  });
  it("exports every matching payment with numeric NPR amounts, daily totals and literal user text", async () => {
    const file = await reports.reportXlsx(schoolId, filter, "payments");
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(file);
    const rows = workbook.getWorksheet("Collections")!;
    expect(rows.rowCount).toBe(3);
    expect(rows.getCell("K2").value).toBe(100.01);
    expect(rows.getCell("K3").value).toBe(200.02);
    expect(rows.getCell("B2").value).toBe("2026-11-01 00:00:00");
    expect(rows.getCell("J2").value).toBe("=HYPERLINK(test)");
    expect(rows.getCell("J2").type).toBe(ExcelJS.ValueType.String);
    expect(rows.getCell("D2").type).toBe(ExcelJS.ValueType.String);
    expect(workbook.getWorksheet("Daily totals")!.getCell("C2").value).toBe(300.03);
    expect(workbook.getWorksheet("Report info")!.getCell("B5").value).toBe("Asia/Kathmandu");
    const filtered = new ExcelJS.Workbook(); await filtered.xlsx.load(await reports.reportXlsx(schoolId, { ...filter, method: "BANK" }, "payments"));
    expect(filtered.getWorksheet("Collections")!.rowCount).toBe(2);
  });
  it("exports unpaid balances and rejects reversed, invalid or excessive date ranges", async () => {
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await reports.reportXlsx(schoolId, filter, "unpaid"));
    expect(workbook.getWorksheet("Unpaid bills")!.rowCount).toBe(2);
    expect(Math.round(Number(workbook.getWorksheet("Unpaid bills")!.getCell("J2").value) * 100)).toBe(39894);
    for (const dates of [{ start: "2026-11-02", end: "2026-11-01" }, { start: "2020-01-01", end: "2026-11-01" }]) {
      await expect(reports.collectionReport(schoolId, { ...filter, ...dates })).rejects.toMatchObject({ status: 400 });
      await expect(reports.unpaidReport(schoolId, { ...filter, ...dates })).rejects.toMatchObject({ status: 400 });
    }
  });
  it("requires report permission for options, data and files, validates dates, and respects module settings", async () => {
    const paths = ["/fees/reports/options", "/fees/reports/collections?start=2026-11-01&end=2026-11-01", "/fees/reports/unpaid?start=2026-11-01&end=2026-11-01", "/fees/reports/export?mode=payments&start=2026-11-01&end=2026-11-01"];
    for (const path of paths) expect((await get(path)).status).toBe(403);
    await prisma.userPermissionOverride.create({ data: { userId, permission: "fees.report", effect: "GRANT" } });
    const response = await get(paths[1]); expect(response.status).toBe(200); expect(response.body.collected).toBe(30003);
    const file = await get(paths[3]); expect(file.status).toBe(200); expect(file.headers["content-type"]).toContain("spreadsheetml");
    expect((await get("/fees/reports/collections?start=2026-02-30&end=2026-11-01")).status).toBe(400);
    expect((await get("/fees/reports/collections?start=2026-11-01&end=2026-11-01&collectorId=invalid")).status).toBe(400);
    await prisma.school.update({ where: { id: schoolId }, data: { settings: { "modules.fees": false } } });
    for (const path of paths) expect((await get(path)).status).toBe(403);
  });
});
