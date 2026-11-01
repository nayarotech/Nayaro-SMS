import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma, type Db } from "../../lib/prisma.js";
import { AppError, conflict, notFound } from "../../lib/errors.js";
import { adToBs, todayInNepal } from "../../lib/nepali-date.js";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { resolvePermissions } from "../permissions/permission.resolver.js";
import { mergeWithDefaults } from "../settings/settings.service.js";
import { issuePlanInTransaction, monthlyDates } from "./recurring.service.js";

const userAccess = { id: true, schoolId: true, isActive: true, isSuperAdmin: true,
  roles: { select: { role: { select: { permissions: { select: { permission: true } } } } } },
  permissionOverrides: { select: { permission: true, effect: true } },
} as const;
function canManage(user: NonNullable<Awaited<ReturnType<typeof accessUser>>>, schoolId: string) {
  return user.isActive && (user.isSuperAdmin || user.schoolId === schoolId && resolvePermissions(user.roles.map((r) => r.role.permissions.map((p) => p.permission)), user.permissionOverrides).has("fees.manage"));
}
const accessUser = (db: Db, id: string) => db.user.findUnique({ where: { id }, select: userAccess });
async function lockedPlan(db: Db, schoolId: string, id: string) {
  await db.$queryRaw(Prisma.sql`SELECT id FROM FeeRecurringPlan WHERE id = ${id} AND schoolId = ${schoolId} FOR UPDATE`);
  const plan = await db.feeRecurringPlan.findFirst({ where: { id, schoolId }, include: { school: true, academicYear: true, feeStructure: true } });
  if (!plan) throw notFound("Recurring plan");
  return plan;
}
type Plan = Awaited<ReturnType<typeof lockedPlan>>;
function monthFor(plan: Plan, today: string) { return (plan.calendar === "BS" ? adToBs(today) : today).slice(0, 7); }
function nextMonth(month: string) { const [y, m] = month.split("-").map(Number); return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`; }
function schoolEnabled(plan: Plan) { return plan.school.isActive && mergeWithDefaults(plan.school.settings)["modules.fees"] !== false; }
function eligibleMonth(plan: Plan, today: string) {
  if (!plan.active || !plan.automationEnabled || !plan.automationStartDate || !schoolEnabled(plan) || !plan.academicYear.isCurrent) return null;
  const month = monthFor(plan, today);
  const dates = monthlyDates(plan.calendar, month, plan.billingDay, plan.dueDay);
  if (dates.billingDate > today || new Date(dates.billingDate) < plan.automationStartDate || new Date(dates.billingDate) < plan.academicYear.startDate || new Date(dates.dueDate) > plan.academicYear.endDate || new Date(today) > plan.academicYear.endDate) return null;
  return month;
}
export async function setAutomation(actor: Actor, id: string, enabled: boolean, approval?: { expectedVersion: number; expectedAmount: number }, today = todayInNepal()) {
  return prisma.$transaction(async (tx) => {
    const plan = await lockedPlan(tx, actor.schoolId, id);
    const user = await accessUser(tx, actor.userId);
    if (!user || !canManage(user, actor.schoolId)) throw conflict("Fee management permission is required to authorize automatic billing");
    let start: Date | undefined;
    if (enabled) {
      if (!plan.active || !schoolEnabled(plan) || !plan.academicYear.isCurrent) throw conflict("Enable an active plan in the current academic year with fees turned on");
      if (!approval || approval.expectedVersion !== plan.version || approval.expectedAmount !== plan.feeStructure.amount) throw conflict("The plan or fee changed. Refresh and review before enabling automation");
      if (plan.automationEnabled && plan.automationStartDate) start = plan.automationStartDate;
      let month = monthFor(plan, today);
      for (let i = 0; !start && i < 14; i++) {
        const dates = monthlyDates(plan.calendar, month, plan.billingDay, plan.dueDay);
        if (dates.billingDate >= today && new Date(dates.billingDate) >= plan.academicYear.startDate) {
          if (new Date(dates.dueDate) > plan.academicYear.endDate) break;
          start = new Date(dates.billingDate); break;
        }
        month = nextMonth(month);
      }
      if (!start) throw conflict("No future billing date remains in this academic year. Create a plan for the next year");
    }
    const updated = await tx.feeRecurringPlan.update({ where: { id }, data: {
      automationEnabled: enabled, version: { increment: 1 },
      ...(enabled ? { automationEnabledBy: actor.userId, automationAmount: plan.feeStructure.amount, automationStartDate: start } : {}),
    } });
    await recordAudit(actor, { action: "fees.automation.configure", entityType: "FeeRecurringPlan", entityId: id, newValue: { enabled, approvedAmount: updated.automationAmount, startDate: updated.automationStartDate } }, tx);
    return updated;
  });
}
async function failureAlert(db: Db, plan: Plan, stateId: string, month: string, message: string) {
  const state = await db.feeScheduleState.findUniqueOrThrow({ where: { id: stateId } });
  if (state.failureAlertAt) return;
  const users = await db.user.findMany({ where: { schoolId: plan.schoolId, isActive: true, OR: [
    { roles: { some: { role: { permissions: { some: { permission: { in: ["fees.manage", "*"] } } } } } } },
    { permissionOverrides: { some: { permission: "fees.manage", effect: "GRANT" } } },
  ] }, select: userAccess });
  const recipients = users.filter((u) => canManage(u, plan.schoolId));
  if (recipients.length) await db.notification.createMany({ data: recipients.map((u) => ({ schoolId: plan.schoolId, userId: u.id,
    type: "fees.scheduler_failed", title: "Automatic fee billing needs attention", body: `${plan.name} (${month} ${plan.calendar}): ${message}`, data: { planId: plan.id, month },
  })) });
  await db.feeScheduleState.update({ where: { id: stateId }, data: { failureAlertAt: new Date() } });
}
export async function runScheduledPlan(schoolId: string, id: string, today = todayInNepal(), forceRetry = false) {
  const claim = await prisma.$transaction(async (tx) => {
    const plan = await lockedPlan(tx, schoolId, id);
    const month = eligibleMonth(plan, today);
    if (!month) return null;
    const state = await tx.feeScheduleState.upsert({ where: { planId_month: { planId: id, month } }, create: { schoolId, planId: id, month }, update: {} });
    const now = new Date();
    if (state.status === "SUCCEEDED" || state.status === "RUNNING" && state.leaseUntil && state.leaseUntil > now) return null;
    if (!forceRetry && (state.attempts >= 3 || state.nextAttemptAt && state.nextAttemptAt > now)) {
      if (state.status === "RUNNING") {
        await tx.feeScheduleState.update({ where: { id: state.id }, data: { status: "FAILED", errorCode: "LEASE_EXPIRED", errorMessage: "A billing attempt was interrupted. Review and retry the current month", leaseUntil: null, leaseToken: null } });
        await failureAlert(tx, plan, state.id, month, "A billing attempt was interrupted. Review and retry the current month");
      }
      return null;
    }
    const token = randomUUID();
    const updated = await tx.feeScheduleState.update({ where: { id: state.id }, data: { status: "RUNNING", attempts: { increment: 1 }, leaseToken: token, leaseUntil: new Date(now.getTime() + 60000), nextAttemptAt: null } });
    return { month, token, stateId: state.id, attempts: updated.attempts };
  });
  if (!claim) return { status: "SKIPPED" };
  try {
    return await prisma.$transaction(async (tx) => {
      const plan = await lockedPlan(tx, schoolId, id);
      const state = await tx.feeScheduleState.findUniqueOrThrow({ where: { id: claim.stateId } });
      if (state.leaseToken !== claim.token) return { status: "SKIPPED" };
      if (eligibleMonth(plan, today) !== claim.month) throw new AppError(409, "PLAN_CHANGED", "Plan was paused, disabled, or moved outside the current billing window");
      let run = await tx.feeRecurringRun.findUnique({ where: { planId_month: { planId: id, month: claim.month } } });
      if (!run) {
        const authorizer = plan.automationEnabledBy && await accessUser(tx, plan.automationEnabledBy);
        if (!authorizer || !canManage(authorizer, schoolId)) throw new AppError(409, "AUTHORIZATION_CHANGED", "The authorizing user no longer has fee management access. Review and re-enable automation");
        if (plan.feeStructure.amount !== plan.automationAmount) throw new AppError(409, "FEE_AMOUNT_CHANGED", "The fee amount changed. Review and re-enable automation to approve the new amount");
        const issued = await issuePlanInTransaction({ schoolId, userId: authorizer.id }, id, claim.month, undefined, tx, "AUTOMATIC");
        run = await tx.feeRecurringRun.findUniqueOrThrow({ where: { id: issued.id } });
      }
      await tx.feeScheduleState.update({ where: { id: state.id }, data: { status: "SUCCEEDED", runId: run.id, leaseToken: null, leaseUntil: null, nextAttemptAt: null } });
      return { status: "SUCCEEDED", runId: run.id };
    }, { timeout: 15000 });
  } catch (error) {
    const code = error instanceof AppError ? error.code : "ISSUE_FAILED";
    const message = error instanceof AppError ? error.message.slice(0, 500) : "Automatic billing could not complete. Review the plan and retry";
    await prisma.$transaction(async (tx) => {
      const plan = await lockedPlan(tx, schoolId, id);
      const state = await tx.feeScheduleState.findUniqueOrThrow({ where: { id: claim.stateId } });
      if (state.leaseToken !== claim.token) return;
      await tx.feeScheduleState.update({ where: { id: state.id }, data: { status: "FAILED", errorCode: code, errorMessage: message, leaseToken: null, leaseUntil: null, nextAttemptAt: claim.attempts < 3 ? new Date(Date.now() + 5 * 3 ** (claim.attempts - 1) * 60000) : null } });
      await failureAlert(tx, plan, state.id, claim.month, message);
      await recordAudit({ schoolId, userId: plan.automationEnabledBy ?? "scheduler" }, { action: "fees.automation.failed", entityType: "FeeScheduleState", entityId: state.id, newValue: { month: claim.month, code, attempts: claim.attempts } }, tx);
    });
    return { status: "FAILED", errorCode: code };
  }
}
export async function runFeeScheduler(today = todayInNepal(), stopping = () => false) {
  let cursor: string | undefined;
  while (!stopping()) {
    const plans = await prisma.feeRecurringPlan.findMany({ where: { active: true, automationEnabled: true, school: { isActive: true } }, select: { id: true, schoolId: true }, orderBy: { id: "asc" }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (!plans.length) break;
    for (const plan of plans) { if (stopping()) return; try { await runScheduledPlan(plan.schoolId, plan.id, today); } catch { logger.warn({ planId: plan.id }, "Automatic fee billing could not be checked; next poll will retry"); } }
    cursor = plans.at(-1)!.id;
  }
}
export function startFeeScheduler() {
  let stopped = false;
  let running: Promise<void> | null = null;
  const tick = () => {
    if (stopped || running || !env.FEE_SCHEDULER_ENABLED) return;
    running = runFeeScheduler(todayInNepal(), () => stopped).catch(() => logger.warn("Fee scheduler poll failed; next poll will retry")).finally(() => { running = null; });
  };
  const timer = setInterval(tick, 60000); timer.unref(); tick();
  return async () => { stopped = true; clearInterval(timer); await running; };
}
export function schedulerAlerts(schoolId: string, userId: string) {
  return prisma.notification.findMany({ where: { schoolId, userId, type: "fees.scheduler_failed", readAt: null }, orderBy: { createdAt: "desc" }, take: 20 });
}
