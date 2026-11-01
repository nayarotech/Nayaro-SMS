import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { conflict, notFound } from "../../lib/errors.js";
import { htmlToPdf } from "../../lib/pdf.js";
import { formatBsLong } from "../../lib/nepali-date.js";
import { storage } from "../../lib/storage/index.js";
import type { Actor } from "../audit/audit.service.js";
import { getLetterhead, letterheadHtml, printDocument, type SchoolLetterhead } from "../reports/print.js";
import { html } from "../website/renderer/html.js";
import { childBillDetail } from "./fees.service.js";

export async function receiptData(schoolId: string, paymentId: string, billId?: string, studentId?: string) {
  const payment = await prisma.feePayment.findFirst({
    where: { id: paymentId, schoolId, ...(billId ? { billId } : {}), bill: { schoolId, ...(studentId ? { studentId } : {}) } },
    include: { bill: { include: { student: { select: { firstName: true, middleName: true, lastName: true, admissionNo: true } } } } },
  });
  if (!payment) throw notFound("Payment");
  return payment;
}

type Receipt = Awaited<ReturnType<typeof receiptData>>;
const money = (value: number) => new Intl.NumberFormat("en-NP", { style: "currency", currency: "NPR" }).format(value / 100);
const date = (value: Date) => `${formatBsLong(value)} BS (${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu", year: "numeric", month: "2-digit", day: "2-digit" }).format(value)} AD)`;

export function receiptHtml(school: SchoolLetterhead, payment: Receipt, generatedAt = new Date()): string {
  const bill = payment.bill;
  const student = bill.student;
  const body = html`${letterheadHtml(school, "Payment receipt")}
    ${payment.reversedAt ? html`<section class="reversed"><h2>REVERSED PAYMENT</h2><p>This receipt is retained for history and is excluded from current collected totals.</p><p>Reversed ${date(payment.reversedAt)} · ${payment.reversalReason}</p></section>` : ""}
    <dl>
      <dt>Receipt ID</dt><dd class="receipt-id">${payment.id}</dd>
      <dt>Payment date</dt><dd>${date(payment.createdAt)}</dd>
      <dt>Student</dt><dd>${[student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ")}</dd>
      <dt>Admission number</dt><dd>${student.admissionNo}</dd>
      <dt>Fee / billing period</dt><dd>${bill.title} / ${bill.period}</dd>
      <dt>Payment method</dt><dd>${({ CASH: "Cash", BANK: "Bank transfer", OTHER: "Other" } as Record<string, string>)[payment.method] ?? payment.method}</dd>
      ${payment.reference ? html`<dt>Reference</dt><dd>${payment.reference}</dd>` : ""}
    </dl>
    <table><thead><tr><th>Description</th><th class="num">Amount (NPR)</th></tr></thead><tbody>
      <tr><td>Fee amount</td><td class="num">${money(bill.amount)}</td></tr>
      <tr><td>Discount</td><td class="num">${money(bill.discount)}</td></tr>
      <tr><td>Fine</td><td class="num">${money(bill.fine)}</td></tr>
      <tr><td>Bill total</td><td class="num">${money(bill.total)}</td></tr>
      <tr class="payment"><td>${payment.reversedAt ? "Original payment amount (reversed)" : "Amount received for this receipt"}</td><td class="num">${money(payment.amount)}</td></tr>
      <tr><td>Total paid to date</td><td class="num">${money(bill.paid)}</td></tr>
      <tr><td>Current outstanding balance</td><td class="num">${money(bill.total - bill.paid)}</td></tr>
    </tbody></table>
    <p class="muted">Generated ${date(generatedAt)}. Total paid and outstanding balance reflect the bill at generation time, including any later payments.</p>
    <p class="thanks">${payment.reversedAt ? "Original payment record preserved." : "Thank you for your payment."}</p>`;
  return printDocument(school, "Payment receipt", body, ".reversed{border:2px solid #b91c1c;color:#991b1b;padding:12px;margin:12px 0}.reversed h2{margin:0}dl{display:grid;grid-template-columns:150px 1fr;gap:7px 12px}dt{color:#64748b}dd{margin:0;overflow-wrap:anywhere}.receipt-id{font-size:10px}.payment{font-weight:700;background:#eff6ff}.thanks{margin-top:24px;text-align:center}");
}

export async function receiptPdf(schoolId: string, paymentId: string): Promise<Buffer> {
  const payment = await receiptData(schoolId, paymentId);
  return htmlToPdf(receiptHtml(await getLetterhead(schoolId), payment));
}

/** Create a private, expiring download link that native viewers can open without auth headers. */
export async function parentReceiptLink(actor: Actor, studentId: string, billId: string, paymentId: string) {
  await childBillDetail(actor.schoolId, actor.userId, studentId, billId);
  const payment = await receiptData(actor.schoolId, paymentId, billId, studentId);
  const pdf = await htmlToPdf(receiptHtml(await getLetterhead(actor.schoolId), payment));
  const key = `schools/${actor.schoolId}/receipts/${randomUUID()}.pdf`;
  await storage.save(key, pdf, "application/pdf");
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM FeeBill WHERE id = ${billId} AND schoolId = ${actor.schoolId} FOR UPDATE`);
      const current = await tx.feePayment.findFirst({ where: { id: payment.id, billId, schoolId: actor.schoolId }, select: { reversedAt: true } });
      if (!current || (current.reversedAt?.getTime() ?? null) !== (payment.reversedAt?.getTime() ?? null)) throw conflict("Payment changed while generating the receipt. Please try again");
      await tx.storedFile.create({ data: {
        schoolId: actor.schoolId, key, originalName: `receipt-${payment.id}.pdf`,
        mimeType: "application/pdf", sizeBytes: pdf.length, isPublic: false, uploadedById: actor.userId,
      } });
    });
  } catch (error) {
    await storage.remove(key).catch(() => undefined);
    throw error;
  }
  return { url: storage.getUrl(key) };
}
