import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { buildRouter } from "../src/http/router.js";
import { errorHandler } from "../src/http/error-handler.js";
import { signAccessToken } from "../src/lib/tokens.js";
import { feesModule } from "../src/modules/fees/fees.routes.js";
import * as recurring from "../src/modules/fees/recurring.service.js";
import * as scheduler from "../src/modules/fees/scheduler.service.js";
import { env } from "../src/config/env.js";
import * as audit from "../src/modules/audit/audit.service.js";
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
    await prisma.feeScheduleState.deleteMany({ where: { schoolId: schools } });
    await prisma.notification.deleteMany({ where: { schoolId: schools } });
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



let managerId: string;
beforeAll(async () => {
  await prisma.userPermissionOverride.create({ data: { userId, permission: "fees.manage", effect: "GRANT" } });
  managerId = (await prisma.user.create({ data: { schoolId, fullName: "Other accountant" } })).id;
  await prisma.userPermissionOverride.create({ data: { userId: managerId, permission: "fees.manage", effect: "GRANT" } });
});
async function plan(calendar: "AD" | "BS" = "AD", billingDay = 1, dueDay = 10) {
  const fee = await prisma.feeStructure.create({ data: { schoolId, name: randomUUID(), amount: 100000 } });
  return recurring.createPlan(actor(), { name: randomUUID(), classId, feeStructureId: fee.id, calendar, billingDay, dueDay });
}
async function enable(id: string, today = "2026-11-01") {
  const p = await prisma.feeRecurringPlan.findUniqueOrThrow({ where: { id }, include: { feeStructure: true } });
  return scheduler.setAutomation(actor(), id, true, { expectedVersion: p.version, expectedAmount: p.feeStructure.amount }, today);
}

describe("opt-in recurring fee scheduling", () => {
  it("keeps plans reviewed by default, requires explicit current fee approval, and schedules future starts conservatively", async () => {
    const p = await plan();
    expect(p.automationEnabled).toBe(false);
    expect((await scheduler.runScheduledPlan(schoolId, p.id, "2026-11-01")).status).toBe("SKIPPED");
    await expect(scheduler.setAutomation(actor(), p.id, true, { expectedVersion: p.version, expectedAmount: 1 }, "2026-11-01")).rejects.toMatchObject({ status: 409 });
    const enabled = await enable(p.id, "2026-11-02");
    expect(enabled.automationStartDate?.toISOString().slice(0, 10)).toBe("2026-12-01");
    expect((await scheduler.runScheduledPlan(schoolId, p.id, "2026-11-30")).status).toBe("SKIPPED");
    expect((await scheduler.runScheduledPlan(schoolId, p.id, "2026-12-01")).status).toBe("SUCCEEDED");
  });
  it("issues on BS/AD billing days and safely handles overlapping workers and repeated polls", async () => {
    const p = await plan("AD", 10, 20);
    await enable(p.id);
    expect((await scheduler.runScheduledPlan(schoolId, p.id, "2026-11-09")).status).toBe("SKIPPED");
    const results = await Promise.all([scheduler.runScheduledPlan(schoolId, p.id, "2026-11-10"), scheduler.runScheduledPlan(schoolId, p.id, "2026-11-10")]);
    expect(results.filter((r) => r.status === "SUCCEEDED")).toHaveLength(1);
    expect(await prisma.feeBill.count({ where: { schoolId, feeStructureId: p.feeStructureId } })).toBe(3);
    expect((await scheduler.runScheduledPlan(schoolId, p.id, "2026-11-11")).status).toBe("SKIPPED");
    expect(await prisma.feeRecurringRun.findUniqueOrThrow({ where: { planId_month: { planId: p.id, month: "2026-11" } } })).toMatchObject({ source: "AUTOMATIC", created: 3 });
    const bs = await plan("BS");
    const date = bsToAd("2083-07-01"); await enable(bs.id, date);
    expect((await scheduler.runScheduledPlan(schoolId, bs.id, date)).status).toBe("SUCCEEDED");
    expect(await prisma.feeRecurringRun.findUnique({ where: { planId_month: { planId: bs.id, month: "2083-07" } } })).not.toBeNull();
  });
  it("catches up only the current month and reuses an already reviewed monthly run", async () => {
    const p = await plan(); await enable(p.id);
    expect((await scheduler.runScheduledPlan(schoolId, p.id, "2027-01-02")).status).toBe("SUCCEEDED");
    expect((await prisma.feeRecurringRun.findMany({ where: { planId: p.id } })).map((r) => r.month)).toEqual(["2027-01"]);
    const reviewed = await plan();
    const preview = await recurring.previewPlan(schoolId, reviewed.id, "2026-11");
    const run = await recurring.issuePlan(actor(), reviewed.id, "2026-11", preview.fingerprint);
    await enable(reviewed.id);
    expect(await scheduler.runScheduledPlan(schoolId, reviewed.id, "2026-11-01")).toMatchObject({ status: "SUCCEEDED", runId: run.id });
    expect(await prisma.feeBill.count({ where: { schoolId, feeStructureId: reviewed.feeStructureId } })).toBe(3);
  });
  it("honors school/module/plan/year stops without generating bills", async () => {
    const p = await plan(); await enable(p.id);
    await recurring.setPlanActive(actor(), p.id, false);
    expect((await scheduler.runScheduledPlan(schoolId, p.id, "2026-11-01")).status).toBe("SKIPPED");
    await recurring.setPlanActive(actor(), p.id, true);
    await prisma.school.update({ where: { id: schoolId }, data: { settings: { "modules.fees": false } } });
    expect((await scheduler.runScheduledPlan(schoolId, p.id, "2026-11-01")).status).toBe("SKIPPED");
    await prisma.school.update({ where: { id: schoolId }, data: { settings: {}, isActive: false } });
    expect((await scheduler.runScheduledPlan(schoolId, p.id, "2026-11-01")).status).toBe("SKIPPED");
    await prisma.school.update({ where: { id: schoolId }, data: { isActive: true } });
    expect((await scheduler.runScheduledPlan(schoolId, p.id, "2027-05-01")).status).toBe("SKIPPED");
    await scheduler.setAutomation(actor(), p.id, false);
    expect((await scheduler.runScheduledPlan(schoolId, p.id, "2026-11-01")).status).toBe("SKIPPED");
    expect(await prisma.feeBill.count({ where: { feeStructureId: p.feeStructureId } })).toBe(0);
  });
  it("rechecks authorizer access and alerts current accountants once on failure", async () => {
    const p = await plan(); await enable(p.id);
    await prisma.userPermissionOverride.update({ where: { userId_permission: { userId, permission: "fees.manage" } }, data: { effect: "DENY" } });
    try {
      expect(await scheduler.runScheduledPlan(schoolId, p.id, "2026-11-01")).toMatchObject({ status: "FAILED", errorCode: "AUTHORIZATION_CHANGED" });
      expect(await scheduler.runScheduledPlan(schoolId, p.id, "2026-11-01", true)).toMatchObject({ status: "FAILED" });
      const notices = await scheduler.schedulerAlerts(schoolId, managerId);
      expect(notices.filter((n) => (n.data as { planId?: string })?.planId === p.id)).toHaveLength(1);
      expect((await scheduler.schedulerAlerts(schoolId, userId)).filter((n) => (n.data as { planId?: string })?.planId === p.id)).toHaveLength(0);
      expect(await prisma.feeBill.count({ where: { feeStructureId: p.feeStructureId } })).toBe(0);
    } finally { await prisma.userPermissionOverride.update({ where: { userId_permission: { userId, permission: "fees.manage" } }, data: { effect: "GRANT" } }); }
  });
  it("backs off, caps automatic retries, and accepts explicit reapproval and retry after a fee change", async () => {
    const p = await plan(); await enable(p.id);
    await prisma.feeStructure.update({ where: { id: p.feeStructureId }, data: { amount: 120000 } });
    expect(await scheduler.runScheduledPlan(schoolId, p.id, "2026-11-01")).toMatchObject({ status: "FAILED", errorCode: "FEE_AMOUNT_CHANGED" });
    expect((await scheduler.runScheduledPlan(schoolId, p.id, "2026-11-01")).status).toBe("SKIPPED");
    for (let i = 0; i < 2; i++) {
      await prisma.feeScheduleState.update({ where: { planId_month: { planId: p.id, month: "2026-11" } }, data: { nextAttemptAt: new Date(0) } });
      expect((await scheduler.runScheduledPlan(schoolId, p.id, "2026-11-01")).status).toBe("FAILED");
    }
    expect((await scheduler.runScheduledPlan(schoolId, p.id, "2026-11-01")).status).toBe("SKIPPED");
    expect((await prisma.feeScheduleState.findUniqueOrThrow({ where: { planId_month: { planId: p.id, month: "2026-11" } } })).attempts).toBe(3);
    await enable(p.id, "2026-11-02"); // Reapproval preserves the original start and can repair this month.
    expect((await scheduler.runScheduledPlan(schoolId, p.id, "2026-11-02", true)).status).toBe("SUCCEEDED");
    expect((await prisma.feeRecurringRun.findUniqueOrThrow({ where: { planId_month: { planId: p.id, month: "2026-11" } } })).total).toBe(360000n);
  });
  it("does not steal a live lease and recovers interrupted work without duplicating bills", async () => {
    const p = await plan(); await enable(p.id);
    const state = await prisma.feeScheduleState.create({ data: { schoolId, planId: p.id, month: "2026-11", status: "RUNNING", attempts: 1, leaseToken: randomUUID(), leaseUntil: new Date(Date.now() + 60000) } });
    expect((await scheduler.runScheduledPlan(schoolId, p.id, "2026-11-01")).status).toBe("SKIPPED");
    await prisma.feeScheduleState.update({ where: { id: state.id }, data: { leaseUntil: new Date(0) } });
    expect((await scheduler.runScheduledPlan(schoolId, p.id, "2026-11-01")).status).toBe("SUCCEEDED");
    expect((await prisma.feeScheduleState.findUniqueOrThrow({ where: { id: state.id } })).attempts).toBe(2);
    expect(await prisma.feeBill.count({ where: { feeStructureId: p.feeStructureId } })).toBe(3);
  });
  it("rolls back partial issuance on failure and safely retries the complete month", async () => {
    const p = await plan(); await enable(p.id);
    const spy = vi.spyOn(audit, "recordAudit").mockRejectedValueOnce(new Error("simulated failure after bill inserts"));
    try { expect((await scheduler.runScheduledPlan(schoolId, p.id, "2026-11-01")).status).toBe("FAILED"); } finally { spy.mockRestore(); }
    expect(await prisma.feeBill.count({ where: { feeStructureId: p.feeStructureId } })).toBe(0);
    expect(await prisma.feeRecurringRun.count({ where: { planId: p.id } })).toBe(0);
    expect((await scheduler.runScheduledPlan(schoolId, p.id, "2026-11-01", true)).status).toBe("SUCCEEDED");
    expect(await prisma.feeRecurringRun.count({ where: { planId: p.id } })).toBe(1);
  });
  it("isolates schools and protects automation endpoints", async () => {
    const p = await plan();
    await expect(scheduler.setAutomation({ schoolId: foreignSchoolId, userId }, p.id, true, { expectedVersion: p.version, expectedAmount: 100000 }, "2026-11-01")).rejects.toMatchObject({ status: 404 });
    const parent = await prisma.user.create({ data: { schoolId, fullName: "No fee permissions" } });
    const token = signAccessToken({ sub: parent.id, schoolId });
    expect((await request(app).post(`/fees/recurring/${p.id}/automation`).set("Authorization", `Bearer ${token}`).send({ enabled: true })).status).toBe(403);
    expect((await post(`/fees/recurring/${p.id}/automation`, { enabled: true })).status).toBe(409);
    expect((await post(`/fees/recurring/${p.id}/automation`, { enabled: "yes" })).status).toBe(400);
    expect((await request(app).get("/fees/recurring/alerts").set("Authorization", `Bearer ${token}`)).status).toBe(403);
  });
  it("polls every minute, stops cleanly, and honors the global worker switch", async () => {
    const enabled = env.FEE_SCHEDULER_ENABLED;
    const find = vi.spyOn(prisma.feeRecurringPlan, "findMany").mockResolvedValue([]);
    vi.useFakeTimers();
    let stop: (() => Promise<void>) | undefined;
    try {
      env.FEE_SCHEDULER_ENABLED = true;
      stop = scheduler.startFeeScheduler();
      await vi.advanceTimersByTimeAsync(0);
      expect(find).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60000);
      expect(find).toHaveBeenCalledTimes(2);
      await stop(); stop = undefined;
      await vi.advanceTimersByTimeAsync(60000);
      expect(find).toHaveBeenCalledTimes(2);
      env.FEE_SCHEDULER_ENABLED = false;
      stop = scheduler.startFeeScheduler();
      await vi.advanceTimersByTimeAsync(60000);
      expect(find).toHaveBeenCalledTimes(2);
    } finally {
      await stop?.(); env.FEE_SCHEDULER_ENABLED = enabled; vi.useRealTimers(); find.mockRestore();
    }
  });

});
