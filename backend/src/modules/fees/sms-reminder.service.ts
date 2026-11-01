import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { badRequest } from "../../lib/errors.js";
import { todayInNepal } from "../../lib/nepali-date.js";
import { sms, SmsDeliveryError } from "../../lib/sms/index.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { findReminderBills } from "./reminder-bills.js";

type Bill = Awaited<ReturnType<typeof findReminderBills>>[number];
type User = Bill["student"]["guardians"][number]["guardian"]["user"];
export interface ReminderItem { billId: string; expectedBalance: number; userIds: string[]; expectedPhones?: Record<string, string> }

export function smsPreviewDetails(bill: Bill, user: User) {
  const phone = user.phone && /^9[678]\d{8}$/.test(user.phone) ? user.phone : null;
  const amount = `NPR ${((bill.total - bill.paid) / 100).toFixed(2)}`;
  const name = `${bill.student.firstName} ${bill.student.lastName}`;
  const message = `${bill.school.name}: ${name}, ${amount} outstanding for ${bill.title} (${bill.period}). Please contact the school for payment. Balance as of ${todayInNepal()}.`;
  return { phone, message };
}

export async function sendSmsReminders(actor: Actor, items: ReminderItem[]) {
  if (env.SMS_PROVIDER === "sparrow" && (!env.SPARROW_SMS_TOKEN || !env.SPARROW_SMS_FROM)) throw badRequest("Configure SPARROW_SMS_TOKEN and SPARROW_SMS_FROM before sending SMS reminders");
  const ids = items.map((i) => i.billId);
  if (!ids.length || ids.length > 100 || new Set(ids).size !== ids.length) throw badRequest("Select 1–100 distinct bills");
  const reserved = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM FeeBill WHERE schoolId = ${actor.schoolId} AND id IN (${Prisma.join([...ids].sort())}) ORDER BY id FOR UPDATE`);
    const bills = await findReminderBills(actor.schoolId, ids, tx);
    const inputs = new Map(items.map((i) => [i.billId, i]));
    const rows = bills.flatMap((bill) => {
      const input = inputs.get(bill.id)!;
      if (bill.total - bill.paid <= 0 || bill.total - bill.paid !== input.expectedBalance) return [];
      return bill.student.guardians.flatMap(({ guardian: { user } }) => {
        const { phone, message } = smsPreviewDetails(bill, user);
        if (!input.userIds.includes(user.id) || !phone || input.expectedPhones?.[user.id] !== phone) return [];
        return [{ id: randomUUID(), schoolId: actor.schoolId, billId: bill.id, recipientUserId: user.id, recipientName: user.fullName,
          reminderDay: new Date(`${todayInNepal()}T00:00:00Z`), balance: input.expectedBalance, sentBy: actor.userId,
          channel: "SMS", deliveryStatus: "PENDING", phone, message }];
      });
    });
    if (rows.length > 50) throw badRequest("Send at most 50 SMS reminders per batch");
    if (rows.length) await tx.feeReminder.createMany({ data: rows, skipDuplicates: true });
    const inserted = rows.length ? await tx.feeReminder.findMany({ where: { schoolId: actor.schoolId, id: { in: rows.map((r) => r.id) } } }) : [];
    await recordAudit(actor, { action: "fees.sms.reserve", entityType: "FeeReminder", newValue: { billIds: ids, reserved: inserted.length } }, tx);
    return inserted;
  });
  // Reserve durably before contacting the provider; retries never replay an ambiguous submission.
  const results: { billId: string; status: string }[] = [];
  for (let offset = 0; offset < reserved.length; offset += 4) {
    await Promise.all(reserved.slice(offset, offset + 4).map(async (row) => {
      let status = "UNKNOWN";
      let errorCode: string | null = null;
      const claim = await prisma.feeReminder.updateMany({ where: { id: row.id, schoolId: actor.schoolId, deliveryStatus: "PENDING" }, data: { deliveryStatus: "SENDING" } });
      if (!claim.count) return;
      // Recheck state immediately before the external side effect.
      const bill = await prisma.feeBill.findFirst({ where: { id: row.billId, schoolId: actor.schoolId }, select: { total: true, paid: true, studentId: true } });
      const link = bill && await prisma.studentGuardian.findFirst({ where: { studentId: bill.studentId, guardian: { schoolId: actor.schoolId, userId: row.recipientUserId, user: { isActive: true, phone: row.phone } } } });
      if (!bill || bill.total - bill.paid !== row.balance || !link) { status = "SKIPPED"; errorCode = "RECIPIENT_OR_BALANCE_CHANGED"; }
      else {
        try { await sms.send(row.phone!, row.message!); status = env.SMS_PROVIDER === "console" ? "SIMULATED" : "ACCEPTED"; }
        catch (error) { status = error instanceof SmsDeliveryError && error.outcome === "REJECTED" ? "FAILED" : "UNKNOWN"; errorCode = error instanceof SmsDeliveryError ? error.code : "UNCONFIRMED_SUBMISSION"; }
      }
      await prisma.feeReminder.update({ where: { id: row.id }, data: { deliveryStatus: status, errorCode } });
      results.push({ billId: row.billId, status });
    }));
  }
  const sent = results.filter((r) => r.status === "ACCEPTED" || r.status === "SIMULATED");
  return { sent: sent.length, remindedBills: new Set(sent.map((r) => r.billId)).size,
    skippedRecipients: items.reduce((sum, i) => sum + new Set(i.userIds).size, 0) - reserved.length + results.filter((r) => r.status === "SKIPPED").length,
    accepted: results.filter((r) => r.status === "ACCEPTED").length, simulated: results.filter((r) => r.status === "SIMULATED").length,
    failed: results.filter((r) => r.status === "FAILED").length, unknown: results.filter((r) => r.status === "UNKNOWN").length };
}
