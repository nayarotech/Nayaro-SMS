import ExcelJS from "exceljs";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { badRequest } from "../../lib/errors.js";
import { bulkOptions } from "./bulk.service.js";

export interface ReportFilter {
  start: string; end: string; classId?: string; sectionId?: string;
  method?: "CASH" | "BANK" | "OTHER"; collectorId?: string;
}
const DAY = 86400000;
const NEPAL = 345 * 60000;
function range(q: ReportFilter) {
  const start = Date.parse(`${q.start}T00:00:00Z`);
  const end = Date.parse(`${q.end}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start >= 366 * DAY) throw badRequest("Choose a valid date range of up to 366 days");
  return { gte: new Date(start - NEPAL), lt: new Date(end + DAY - NEPAL) };
}
function billWhere(schoolId: string, q: ReportFilter): Prisma.FeeBillWhereInput {
  return { schoolId, ...(q.classId || q.sectionId ? { student: { enrollments: { some: {
    schoolId, status: "ACTIVE", academicYear: { schoolId, isCurrent: true },
    ...(q.classId ? { classId: q.classId } : {}), ...(q.sectionId ? { sectionId: q.sectionId } : {}),
  } } } } : {}) };
}
function paymentWhere(schoolId: string, q: ReportFilter): Prisma.FeePaymentWhereInput {
  return { schoolId, createdAt: range(q), bill: billWhere(schoolId, q), ...(q.method ? { method: q.method } : {}), ...(q.collectorId ? { collectedBy: q.collectorId } : {}) };
}
function unpaidWhere(schoolId: string, q: ReportFilter): Prisma.FeeBillWhereInput {
  range(q);
  return { ...billWhere(schoolId, q), dueDate: { gte: new Date(`${q.start}T00:00:00Z`), lte: new Date(`${q.end}T00:00:00Z`) }, paid: { lt: prisma.feeBill.fields.total } };
}
const student = (schoolId: string) => ({ select: {
  firstName: true, middleName: true, lastName: true, admissionNo: true,
  enrollments: { where: { schoolId, status: "ACTIVE" as const, academicYear: { isCurrent: true, schoolId } }, take: 1, select: { class: { select: { name: true } }, section: { select: { name: true } } } },
} });
type Student = { firstName: string; middleName: string | null; lastName: string; admissionNo: string; enrollments: { class: { name: string }; section: { name: string } }[] };
function studentDto(s: Student) {
  return { name: [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" "), admissionNo: s.admissionNo, classSection: s.enrollments[0] ? `${s.enrollments[0].class.name} ${s.enrollments[0].section.name}` : null };
}
async function collectors(schoolId: string) {
  const ids = await prisma.feePayment.findMany({ where: { schoolId }, distinct: ["collectedBy"], select: { collectedBy: true } });
  const users = await prisma.user.findMany({ where: { id: { in: ids.map((p) => p.collectedBy) } }, select: { id: true, fullName: true } });
  const names = new Map(users.map((u) => [u.id, u.fullName]));
  return ids.map((p) => ({ id: p.collectedBy, name: names.get(p.collectedBy) ?? "Former staff" })).sort((a, b) => a.name.localeCompare(b.name));
}
export async function reportOptions(schoolId: string) {
  const [options, people] = await Promise.all([bulkOptions(schoolId), collectors(schoolId)]);
  return { ...options, collectors: people };
}
function dailySql(schoolId: string, q: ReportFilter) {
  const dates = range(q);
  return Prisma.sql`SELECT DATE_FORMAT(DATE_ADD(p.createdAt, INTERVAL 345 MINUTE), '%Y-%m-%d') AS day, SUM(CASE WHEN p.reversedAt IS NULL THEN p.amount ELSE 0 END) AS total, COUNT(*) AS count
    FROM FeePayment p JOIN FeeBill b ON b.id = p.billId AND b.schoolId = p.schoolId
    WHERE p.schoolId = ${schoolId} AND p.createdAt >= ${dates.gte} AND p.createdAt < ${dates.lt}
    ${q.method ? Prisma.sql`AND p.method = ${q.method}` : Prisma.empty}
    ${q.collectorId ? Prisma.sql`AND p.collectedBy = ${q.collectorId}` : Prisma.empty}
    ${q.classId || q.sectionId ? Prisma.sql`AND EXISTS (SELECT 1 FROM Enrollment e JOIN AcademicYear y ON y.id = e.academicYearId AND y.schoolId = e.schoolId WHERE e.schoolId = ${schoolId} AND e.studentId = b.studentId AND e.status = 'ACTIVE' AND y.isCurrent = true
      ${q.classId ? Prisma.sql`AND e.classId = ${q.classId}` : Prisma.empty}
      ${q.sectionId ? Prisma.sql`AND e.sectionId = ${q.sectionId}` : Prisma.empty})` : Prisma.empty}
    GROUP BY day ORDER BY day DESC`;
}
export async function collectionReport(schoolId: string, q: ReportFilter & { page: number; pageSize: number }) {
  const where = paymentWhere(schoolId, q);
  const [rows, total, sums, activeSums, daily] = await prisma.$transaction([
    prisma.feePayment.findMany({ where, include: { bill: { include: { student: student(schoolId) } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.feePayment.count({ where }),
    prisma.feePayment.aggregate({ where, _sum: { amount: true } }),
    prisma.feePayment.aggregate({ where: { ...where, reversedAt: null }, _sum: { amount: true } }),
    prisma.$queryRaw<{ day: string; total: unknown; count: unknown }[]>(dailySql(schoolId, q)),
  ]);
  const names = new Map((await collectors(schoolId)).map((c) => [c.id, c.name]));
  return { items: rows.map((p) => ({ id: p.id, createdAt: p.createdAt, amount: p.amount, method: p.method, reference: p.reference, reversedAt: p.reversedAt, reversalReason: p.reversalReason, effectiveAmount: p.reversedAt ? 0 : p.amount, collector: names.get(p.collectedBy) ?? "Former staff", ...studentDto(p.bill.student), fee: p.bill.title, period: p.bill.period })),
    total, page: q.page, pageSize: q.pageSize, collected: activeSums._sum.amount ?? 0, grossCollected: sums._sum.amount ?? 0, reversedAmount: (sums._sum.amount ?? 0) - (activeSums._sum.amount ?? 0),
    daily: daily.map((d) => ({ day: d.day, total: Number(d.total), count: Number(d.count) })),
  };
}
export async function unpaidReport(schoolId: string, q: ReportFilter & { page: number; pageSize: number }) {
  const where = unpaidWhere(schoolId, q);
  const [rows, total, sums] = await prisma.$transaction([
    prisma.feeBill.findMany({ where, include: { student: student(schoolId) }, orderBy: [{ dueDate: "asc" }, { id: "asc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.feeBill.count({ where }), prisma.feeBill.aggregate({ where, _sum: { total: true, paid: true } }),
  ]);
  return { items: rows.map((b) => ({ id: b.id, ...studentDto(b.student), fee: b.title, period: b.period, dueDate: b.dueDate, total: b.total, paid: b.paid, balance: b.total - b.paid })), total, page: q.page, pageSize: q.pageSize, outstanding: (sums._sum.total ?? 0) - (sums._sum.paid ?? 0) };
}
export async function reportXlsx(schoolId: string, q: ReportFilter, mode: "payments" | "unpaid") {
  const workbook = new ExcelJS.Workbook();
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { name: true } });
  workbook.creator = school.name;
  const info = workbook.addWorksheet("Report info");
  info.addRows([["School", school.name], ["Report", mode], ["Start (AD, inclusive)", q.start], ["End (AD, inclusive)", q.end], ["Timezone", "Asia/Kathmandu"], ["Class ID (current year)", q.classId ?? "All"], ["Section ID", q.sectionId ?? "All"], ["Payment method", mode === "payments" ? q.method ?? "All" : "Not applicable"], ["Collector ID", mode === "payments" ? q.collectorId ?? "All" : "Not applicable"], ["Date meaning", mode === "payments" ? "Original payment date in Nepal time; net totals exclude reversed payments as of export time, not a refund cash-flow report" : "Bill due date; balances are current, not historical"], ["Generated (UTC)", new Date().toISOString()]]);
  const sheet = workbook.addWorksheet(mode === "payments" ? "Collections" : "Unpaid bills");
  if (mode === "payments") {
    const rows = await prisma.feePayment.findMany({ where: paymentWhere(schoolId, q), include: { bill: { include: { student: student(schoolId) } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 10001 });
    if (rows.length > 10000) throw badRequest("Export limited to 10,000 rows. Narrow the filters");
    const names = new Map((await collectors(schoolId)).map((c) => [c.id, c.name]));
    sheet.addRow(["Receipt ID", "Payment time (Nepal)", "Admission no.", "Student", "Current class/section", "Fee", "Period", "Method", "Collector", "Reference", "Original amount (NPR)", "Status", "Reversed time (Nepal)", "Reversal reason", "Reversed by (user ID)", "Net collected (NPR)"]);
    const daily = new Map<string, { total: number; count: number }>();
    for (const p of rows) {
      const s = studentDto(p.bill.student);
      const time = new Date(p.createdAt.getTime() + NEPAL).toISOString().slice(0, 19).replace("T", " ");
      sheet.addRow([p.id, time, s.admissionNo, s.name, s.classSection ?? "", p.bill.title, p.bill.period, p.method, names.get(p.collectedBy) ?? "Former staff", p.reference ?? "", p.amount / 100, p.reversedAt ? "REVERSED" : "ACTIVE", p.reversedAt ? new Date(p.reversedAt.getTime() + NEPAL).toISOString().slice(0, 19).replace("T", " ") : "", p.reversalReason ?? "", p.reversedBy ?? "", p.reversedAt ? 0 : p.amount / 100]);
      const day = time.slice(0, 10); const sum = daily.get(day) ?? { total: 0, count: 0 }; sum.total += p.reversedAt ? 0 : p.amount; sum.count++; daily.set(day, sum);
    }
    sheet.getColumn(16).numFmt = '#,##0.00';
    sheet.getColumn(11).numFmt = '#,##0.00';
    const summary = workbook.addWorksheet("Daily totals"); summary.addRow(["Date (Nepal AD)", "Payments", "Net collected (NPR)"]);
    for (const [day, sum] of daily) summary.addRow([day, sum.count, sum.total / 100]);
    summary.getColumn(3).numFmt = '#,##0.00';
  } else {
    const rows = await prisma.feeBill.findMany({ where: unpaidWhere(schoolId, q), include: { student: student(schoolId) }, orderBy: [{ dueDate: "asc" }, { id: "asc" }], take: 10001 });
    if (rows.length > 10000) throw badRequest("Export limited to 10,000 rows. Narrow the filters");
    sheet.addRow(["Bill ID", "Admission no.", "Student", "Current class/section", "Fee", "Period", "Due date (AD)", "Total (NPR)", "Paid (NPR)", "Outstanding (NPR)"]);
    for (const b of rows) { const s = studentDto(b.student); sheet.addRow([b.id, s.admissionNo, s.name, s.classSection ?? "", b.title, b.period, b.dueDate.toISOString().slice(0, 10), b.total / 100, b.paid / 100, (b.total - b.paid) / 100]); }
    for (const column of [8, 9, 10]) sheet.getColumn(column).numFmt = '#,##0.00';
  }
  for (const tab of workbook.worksheets) {
    tab.getRow(1).font = { bold: true };
    tab.views = [{ state: "frozen", ySplit: 1 }];
    if (tab !== info) tab.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, tab.rowCount), column: tab.columnCount } };
    tab.columns.forEach((c) => { c.width = c.number === 1 ? 40 : 25; });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
