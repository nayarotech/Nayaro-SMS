import { findReminderBills } from "./reminder-bills.js";
import { env } from "../../config/env.js";
import { sendSmsReminders, smsPreviewDetails } from "./sms-reminder.service.js";
import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { todayInNepal } from "../../lib/nepali-date.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";

export async function previewReminders(schoolId: string, billIds: string[], channel: "IN_APP" | "SMS" = "IN_APP") {
  if (!billIds.length || billIds.length > 100 || new Set(billIds).size !== billIds.length) throw badRequest("Select 1–100 distinct bills");
  const bills = await findReminderBills(schoolId, billIds, prisma);
  const history = await prisma.feeReminder.groupBy({ by: ["billId", "recipientUserId"], where: { schoolId, billId: { in: billIds }, channel }, _max: { createdAt: true, reminderDay: true } });
  const previous = new Map(history.map((h) => [`${h.billId}/${h.recipientUserId}`, h._max]));
  const today = todayInNepal();
  return bills.map((bill) => ({
    channel, simulated: channel === "SMS" && env.SMS_PROVIDER === "console", smsConfigured: env.SMS_PROVIDER === "console" || !!(env.SPARROW_SMS_TOKEN && env.SPARROW_SMS_FROM),
    id: bill.id, title: bill.title, period: bill.period, dueDate: bill.dueDate, balance: bill.total - bill.paid,
    studentName: `${bill.student.firstName} ${bill.student.lastName}`,
    recipients: bill.student.guardians.map(({ guardian: { user } }) => {
      const last = previous.get(`${bill.id}/${user.id}`);
      return { userId: user.id, name: user.fullName, lastSentAt: last?.createdAt ?? null, sentToday: last?.reminderDay?.toISOString().slice(0, 10) === today, ...(channel === "SMS" ? smsPreviewDetails(bill, user) : {}) };
    }),
  }));
}

export async function sendReminders(actor: Actor, items: { billId: string; expectedBalance: number; userIds: string[]; expectedPhones?: Record<string, string> }[], channel: "IN_APP" | "SMS" = "IN_APP") {
  if (channel === "SMS") return sendSmsReminders(actor, items);
  const ids = items.map((i) => i.billId);
  if (!ids.length || ids.length > 100 || new Set(ids).size !== ids.length) throw badRequest("Select 1–100 distinct bills");
  return prisma.$transaction(async (tx) => {
    // Serialize reminders with payment collection so paid bills aren't notified from stale data.
    await tx.$queryRaw(Prisma.sql`SELECT id FROM FeeBill WHERE schoolId = ${actor.schoolId} AND id IN (${Prisma.join([...ids].sort())}) ORDER BY id FOR UPDATE`);
    const bills = await findReminderBills(actor.schoolId, ids, tx);
    const requested = new Map(items.map((i) => [i.billId, i]));
    const reminderDay = new Date(`${todayInNepal()}T00:00:00Z`);
    const candidates = bills.flatMap((bill) => {
      const input = requested.get(bill.id)!;
      const balance = bill.total - bill.paid;
      if (balance <= 0 || balance !== input.expectedBalance) return [];
      return bill.student.guardians.filter(({ guardian }) => input.userIds.includes(guardian.user.id)).map(({ guardian: { user } }) => ({
        id: randomUUID(), schoolId: actor.schoolId, billId: bill.id, recipientUserId: user.id,
        recipientName: user.fullName, channel: "IN_APP", reminderDay, balance, sentBy: actor.userId,
        user, bill,
      }));
    });
    if (candidates.length) await tx.feeReminder.createMany({ data: candidates.map(({ user: _user, bill: _bill, ...row }) => row), skipDuplicates: true });
    const created = candidates.length ? await tx.feeReminder.findMany({ where: { schoolId: actor.schoolId, id: { in: candidates.map((r) => r.id) } }, select: { id: true, billId: true } }) : [];
    const inserted = new Set(created.map((r) => r.id));
    const sent = candidates.filter((r) => inserted.has(r.id));
    if (sent.length) await tx.notification.createMany({ data: sent.map((r) => {
      const amount = new Intl.NumberFormat(r.user.preferredLanguage === "ne" ? "ne-NP" : "en-NP", { style: "currency", currency: "NPR" }).format(r.balance / 100);
      const name = `${r.bill.student.firstName} ${r.bill.student.lastName}`;
      return {
        schoolId: actor.schoolId, userId: r.recipientUserId, type: "fees.reminder",
        title: r.user.preferredLanguage === "ne" ? "शुल्क भुक्तानी सम्झना" : "Fee payment reminder",
        body: r.user.preferredLanguage === "ne" ? `${name}: ${r.bill.title} (${r.bill.period}) को ${amount} बाँकी छ। हालको बक्यौता हेर्न बिल खोल्नुहोस्।` : `${name}: ${amount} is outstanding for ${r.bill.title} (${r.bill.period}). Open the bill for the current balance.`,
        data: { studentId: r.bill.studentId, billId: r.billId, balance: r.balance },
      };
    }) });
    const result = { sent: sent.length, remindedBills: new Set(created.map((r) => r.billId)).size, skippedRecipients: items.reduce((sum, item) => sum + new Set(item.userIds).size, 0) - sent.length };
    await recordAudit(actor, { action: "fees.reminders.send", entityType: "FeeReminder", newValue: { ...result, billIds: ids } }, tx);
    return result;
  }, { timeout: 15_000 });
}

export async function reminderHistory(schoolId: string, billId: string) {
  if (!await prisma.feeBill.findFirst({ where: { id: billId, schoolId }, select: { id: true } })) throw notFound("Bill");
  return prisma.feeReminder.findMany({ where: { schoolId, billId }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 50,
    select: { id: true, recipientName: true, balance: true, createdAt: true, channel: true, deliveryStatus: true, errorCode: true, phone: true } });
}
