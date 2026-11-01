import { z } from "zod";
import { defineModule, route } from "../../http/route.js";
import { idParam, pagination } from "../../http/schemas.js";
import { setAutomation, runScheduledPlan, schedulerAlerts } from "./scheduler.service.js";
import { env } from "../../config/env.js";
import * as recurring from "./recurring.service.js";
import { reversePayment } from "./reversal.service.js";
import * as reports from "./collection-reports.service.js";
import * as reminders from "./reminder.service.js";
import * as bulk from "./bulk.service.js";
import * as receipts from "./receipt.service.js";
import * as fees from "./fees.service.js";

const read = ["fees.view", "fees.manage", "fees.collect", "fees.report", "fees.reverse"] as const;
const money = z.number().int().min(0).max(fees.MAX_MONEY);
const date = z.iso.date();
const recurringMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const reportFilter = z.object({ start: z.iso.date(), end: z.iso.date(), classId: z.uuid().optional(), sectionId: z.uuid().optional(), method: z.enum(["CASH", "BANK", "OTHER"]).optional(), collectorId: z.uuid().optional() });
const bulkBody = z.object({ classId: z.uuid(), sectionId: z.uuid().optional(), feeStructureId: z.uuid(), period: z.string().trim().min(1).max(50), dueDate: date, fine: money.default(0) });
export const feesModule = defineModule("/fees", "Fees & payments", [
  route({ method: "get", path: "/recurring/scheduler-status", summary: "Whether the automatic billing worker is enabled", module: "fees", permission: "fees.manage", handler: () => ({ enabled: env.FEE_SCHEDULER_ENABLED, intervalSeconds: 60 }) }),
  route({ method: "get", path: "/recurring/alerts", summary: "My unread automatic billing failure alerts", module: "fees", permission: "fees.manage", handler: ({ schoolId, auth }) => schedulerAlerts(schoolId, auth.userId) }),
  route({ method: "post", path: "/recurring/:id/automation", summary: "Opt into or out of automatic billing with explicit fee approval", module: "fees", permission: "fees.manage", params: idParam,
    body: z.object({ enabled: z.boolean(), expectedVersion: z.number().int().min(1).optional(), expectedAmount: money.min(1).optional() }),
    handler: ({ actor, params, body }) => setAutomation(actor, params.id, body.enabled, body.expectedVersion !== undefined && body.expectedAmount !== undefined ? { expectedVersion: body.expectedVersion, expectedAmount: body.expectedAmount } : undefined) }),
  route({ method: "post", path: "/recurring/:id/retry", summary: "Retry the current month's opted-in scheduled billing safely", module: "fees", permission: "fees.manage", params: idParam,
    handler: ({ schoolId, params }) => runScheduledPlan(schoolId, params.id, undefined, true) }),
  route({ method: "get", path: "/recurring", summary: "Recurring fee plans and latest monthly runs", module: "fees", permission: "fees.manage", handler: ({ schoolId }) => recurring.listPlans(schoolId) }),
  route({ method: "post", path: "/recurring", summary: "Create an accountant-reviewed recurring fee plan for the current academic year", module: "fees", permission: "fees.manage", status: 201,
    body: z.object({ name: z.string().trim().min(2).max(150), classId: z.uuid(), sectionId: z.uuid().optional(), feeStructureId: z.uuid(), calendar: z.enum(["BS", "AD"]), billingDay: z.number().int().min(1).max(28), dueDay: z.number().int().min(1).max(28) }), handler: ({ actor, body }) => recurring.createPlan(actor, body) }),
  route({ method: "patch", path: "/recurring/:id", summary: "Pause or resume a recurring fee plan", module: "fees", permission: "fees.manage", params: idParam, body: z.object({ active: z.boolean() }), handler: ({ actor, params, body }) => recurring.setPlanActive(actor, params.id, body.active) }),
  route({ method: "post", path: "/recurring/:id/preview", summary: "Preview a monthly run with saved discounts and existing bills", module: "fees", permission: "fees.manage", params: idParam, body: z.object({ month: recurringMonth }), handler: ({ schoolId, params, body }) => recurring.previewPlan(schoolId, params.id, body.month) }),
  route({ method: "put", path: "/recurring/:id/discounts", summary: "Replace saved student discounts for a recurring plan", module: "fees", permission: "fees.manage", params: idParam,
    body: z.object({ version: z.number().int().min(1), expectedAmount: money.min(1), students: z.array(z.object({ studentId: z.uuid(), discount: money })).max(500) }), handler: ({ actor, params, body }) => recurring.saveDiscounts(actor, params.id, body) }),
  route({ method: "post", path: "/recurring/:id/issue", summary: "Confirm a previewed monthly run atomically, skipping existing bills", module: "fees", permission: "fees.manage", params: idParam,
    body: z.object({ month: recurringMonth, fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }), handler: ({ actor, params, body }) => recurring.issuePlan(actor, params.id, body.month, body.fingerprint) }),
  route({ method: "post", path: "/payments/:id/reverse", summary: "Reverse a recorded payment without deleting the original receipt", module: "fees", permission: "fees.reverse", params: idParam,
    body: z.object({ reason: z.string().trim().min(5).max(500) }), handler: ({ actor, params, body }) => reversePayment(actor, params.id, body.reason) }),
  route({ method: "get", path: "/reports/options", summary: "Classes and recorded collectors for fee reports", module: "fees", permission: "fees.report", handler: ({ schoolId }) => reports.reportOptions(schoolId) }),
  route({ method: "get", path: "/reports/collections", summary: "Collections and daily totals by Nepal payment date", module: "fees", permission: "fees.report", query: reportFilter.extend(pagination.shape), handler: ({ schoolId, query }) => reports.collectionReport(schoolId, query) }),
  route({ method: "get", path: "/reports/unpaid", summary: "Current unpaid balances by bill due-date range", module: "fees", permission: "fees.report", query: reportFilter.pick({ start: true, end: true, classId: true, sectionId: true }).extend(pagination.shape), handler: ({ schoolId, query }) => reports.unpaidReport(schoolId, query) }),
  route({ method: "get", path: "/reports/export", summary: "Export filtered collections or unpaid bills to Excel (up to 10,000 rows)", module: "fees", permission: "fees.report", query: reportFilter.extend({ mode: z.enum(["payments", "unpaid"]) }),
    handler: async ({ schoolId, query, res }) => {
      const file = await reports.reportXlsx(schoolId, query, query.mode);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Content-Disposition", `attachment; filename="fees-${query.mode}-${query.start}-${query.end}.xlsx"`);
      res.send(file);
    } }),
  route({ method: "get", path: "/options", summary: "Class and section filters for fees", module: "fees", permission: [...read], handler: ({ schoolId }) => bulk.bulkOptions(schoolId) }),
  route({ method: "post", path: "/reminders/preview", summary: "Preview active linked parents and reminder history", module: "fees", permission: "fees.manage",
    body: z.object({ billIds: z.array(z.uuid()).min(1).max(100), channel: z.enum(["IN_APP", "SMS"]).default("IN_APP") }), handler: ({ schoolId, body }) => reminders.previewReminders(schoolId, body.billIds, body.channel) }),
  route({ method: "post", path: "/reminders/send", summary: "Create in-app reminders, once per bill/parent/Nepal day", module: "fees", permission: "fees.manage",
    body: z.object({ items: z.array(z.object({ billId: z.uuid(), expectedBalance: money.min(1), userIds: z.array(z.uuid()).min(1).max(20), expectedPhones: z.record(z.uuid(), z.string().regex(/^9[678]\d{8}$/)).optional() })).min(1).max(100), channel: z.enum(["IN_APP", "SMS"]).default("IN_APP") }), handler: ({ actor, body }) => reminders.sendReminders(actor, body.items, body.channel) }),
  route({ method: "get", path: "/bills/:id/reminders", summary: "Latest 50 reminder recipients for a bill", module: "fees", permission: [...read], params: idParam, handler: ({ schoolId, params }) => reminders.reminderHistory(schoolId, params.id) }),
  route({ method: "get", path: "/bulk/options", summary: "Current year, classes and sections for bulk billing", module: "fees", permission: "fees.manage", handler: ({ schoolId }) => bulk.bulkOptions(schoolId) }),
  route({ method: "post", path: "/bulk/preview", summary: "Preview active students and existing bills for a class or section", module: "fees", permission: "fees.manage", body: bulkBody, handler: ({ schoolId, body }) => bulk.previewBulk(schoolId, body) }),
  route({ method: "post", path: "/bulk/issue", summary: "Issue selected student bills, skipping duplicates atomically", module: "fees", permission: "fees.manage",
    body: bulkBody.extend({ academicYearId: z.uuid(), expectedAmount: money.min(1), students: z.array(z.object({ studentId: z.uuid(), discount: money.default(0) })).min(1).max(500) }),
    handler: ({ actor, body }) => bulk.issueBulk(actor, body) }),
  route({ method: "get", path: "/payments/:id/receipt", summary: "Download a payment receipt PDF", module: "fees", permission: [...read], params: idParam,
    handler: async ({ schoolId, params, res }) => {
      const pdf = await receipts.receiptPdf(schoolId, params.id);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Content-Disposition", `attachment; filename="receipt-${params.id}.pdf"`);
      res.send(pdf);
    } }),
  route({ method: "get", path: "/structures", summary: "School fee structures", module: "fees", permission: [...read], handler: ({ schoolId }) => fees.listStructures(schoolId) }),
  route({ method: "post", path: "/structures", summary: "Create a reusable fee structure (amount in paisa)", module: "fees", permission: "fees.manage", status: 201,
    body: z.object({ name: z.string().trim().min(2).max(150), amount: money.min(1) }), handler: ({ actor, body }) => fees.createStructure(actor, body) }),
  route({ method: "get", path: "/students", summary: "Search students for billing", module: "fees", permission: "fees.manage",
    query: z.object({ search: z.string().trim().max(100).default("") }), handler: ({ schoolId, query }) => fees.studentOptions(schoolId, query.search) }),
  route({ method: "get", path: "/summary", summary: "All-time fee collection totals (paisa)", module: "fees", permission: "fees.report", handler: ({ schoolId }) => fees.summary(schoolId) }),
  route({ method: "get", path: "/bills", summary: "Student bills and balances", module: "fees", permission: [...read],
    query: pagination.extend({ studentId: z.uuid().optional(), classId: z.uuid().optional(), sectionId: z.uuid().optional(), status: z.enum(["all", "outstanding", "overdue", "paid"]).default("all") }), handler: ({ schoolId, query }) => fees.listBills(schoolId, query) }),
  route({ method: "post", path: "/bills", summary: "Issue a student bill; the same fee and period cannot be billed twice", module: "fees", permission: "fees.manage", status: 201,
    body: z.object({ studentId: z.uuid(), feeStructureId: z.uuid(), period: z.string().trim().min(1).max(50), dueDate: date, discount: money.default(0), fine: money.default(0) }),
    handler: ({ actor, body }) => fees.createBill(actor, body) }),
  route({ method: "get", path: "/bills/:id", summary: "Bill details and payment receipts", module: "fees", permission: [...read], params: idParam, handler: ({ schoolId, params }) => fees.billDetail(schoolId, params.id) }),
  route({ method: "post", path: "/bills/:id/payments", summary: "Record a partial or full payment; reuse requestId when retrying", module: "fees", permission: "fees.collect", status: 201, params: idParam,
    body: z.object({ requestId: z.uuid(), amount: money.min(1), method: z.enum(["CASH", "BANK", "OTHER"]), reference: z.string().trim().min(1).max(150).optional() }),
    handler: ({ actor, params, body }) => fees.collectPayment(actor, params.id, body) }),
]);

export const parentFeesModule = defineModule("/my/children", "Parent app", [
  route({ method: "post", path: "/:id/fees/:billId/payments/:paymentId/receipt-link", summary: "Create a private payment receipt download link for a guardian", module: "fees",
    params: z.object({ id: z.uuid(), billId: z.uuid(), paymentId: z.uuid() }),
    handler: ({ actor, params, res }) => {
      res.setHeader("Cache-Control", "no-store");
      return receipts.parentReceiptLink(actor, params.id, params.billId, params.paymentId);
    } }),
  route({ method: "get", path: "/:id/fees/:billId", summary: "A guardian's own child's bill and payment history", module: "fees",
    params: z.object({ id: z.uuid(), billId: z.uuid() }),
    handler: ({ auth, schoolId, params }) => fees.childBillDetail(schoolId, auth.userId, params.id, params.billId) }),
  route({ method: "get", path: "/:id/fees", summary: "A guardian's own child's bills and balances", module: "fees", params: idParam, query: pagination,
    handler: async ({ auth, schoolId, params, query }) => {
      return fees.childBills(schoolId, auth.userId, params.id, query);
    } }),
]);
