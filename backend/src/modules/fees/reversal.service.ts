import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { storage } from "../../lib/storage/index.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";

/** Corrects a recorded payment; keeps its original amount, timestamp and receipt ID. */
export async function reversePayment(actor: Actor, paymentId: string, reason: string) {
  reason = reason.trim();
  if (reason.length < 5 || reason.length > 500) throw badRequest("Enter a reversal reason between 5 and 500 characters");
  const target = await prisma.feePayment.findFirst({ where: { id: paymentId, schoolId: actor.schoolId }, select: { billId: true } });
  if (!target) throw notFound("Payment");
  const result = await prisma.$transaction(async (tx) => {
    // Same bill-first lock order as reminders and receipt-file creation.
    await tx.$queryRaw(Prisma.sql`SELECT id FROM FeeBill WHERE id = ${target.billId} AND schoolId = ${actor.schoolId} FOR UPDATE`);
    const payment = await tx.feePayment.findFirst({ where: { id: paymentId, schoolId: actor.schoolId, billId: target.billId } });
    if (!payment) throw notFound("Payment");
    if (payment.reversedAt) {
      if (payment.reversalReason !== reason) throw conflict("Payment was already reversed. The original reversal reason is preserved");
      return { payment, files: [] as { key: string }[] };
    }
    const changed = await tx.feeBill.updateMany({ where: { id: payment.billId, schoolId: actor.schoolId, paid: { gte: payment.amount } }, data: { paid: { decrement: payment.amount } } });
    if (changed.count !== 1) throw conflict("The bill balance does not reconcile with this payment. Review it before reversing");
    const reversed = await tx.feePayment.update({ where: { id: paymentId }, data: { reversedAt: new Date(), reversedBy: actor.userId, reversalReason: reason } });
    // Revoke old generated copies so an existing signed link cannot serve an unmarked receipt.
    const where = { schoolId: actor.schoolId, originalName: `receipt-${paymentId}.pdf`, key: { startsWith: `schools/${actor.schoolId}/receipts/` } };
    const files = await tx.storedFile.findMany({ where, select: { key: true } });
    await tx.storedFile.deleteMany({ where });
    await recordAudit(actor, { action: "fees.payment.reverse", entityType: "FeePayment", entityId: paymentId, oldValue: { amount: payment.amount, billId: payment.billId }, newValue: { reversedAt: reversed.reversedAt, reversedBy: actor.userId, reason } }, tx);
    return { payment: reversed, files };
  });
  await Promise.all(result.files.map((file) => storage.remove(file.key).catch(() => undefined)));
  return result.payment;
}
