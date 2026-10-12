import ExcelJS from "exceljs";
import { forbidden, notFound } from "../../lib/errors.js";
import { adToBs, BS_MONTHS, bsMonthDates, formatBsLong, fromDateString, toDateString, todayInNepal } from "../../lib/nepali-date.js";
import { htmlToPdf } from "../../lib/pdf.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthContext } from "../../http/auth-context.js";
import { findSection } from "../academic/class.service.js";
import { getLetterhead, letterheadHtml, printDocument } from "../reports/print.js";
import { getSchoolSettings } from "../settings/settings.service.js";
import { html } from "../website/renderer/html.js";
import type { AttendanceStatus } from "../../generated/prisma/client.js";
import { getAccess, sectionStudents, yearForDate } from "./attendance.service.js";

const LETTER: Record<AttendanceStatus, string> = { PRESENT: "P", ABSENT: "A", LATE: "L", LEAVE: "Lv" };

interface Counts {
  present: number;
  absent: number;
  late: number;
  leave: number;
  total: number;
}

/** Attendance % = (present [+ late]) ÷ days attendance was taken. */
export function attendancePercent(counts: Counts, lateCountsAsPresent: boolean): number | null {
  if (counts.total === 0) return null;
  const present = counts.present + (lateCountsAsPresent ? counts.late : 0);
  return Math.round((present / counts.total) * 1000) / 10;
}

function count(statuses: AttendanceStatus[]): Counts {
  return {
    present: statuses.filter((s) => s === "PRESENT").length,
    absent: statuses.filter((s) => s === "ABSENT").length,
    late: statuses.filter((s) => s === "LATE").length,
    leave: statuses.filter((s) => s === "LEAVE").length,
    total: statuses.length,
  };
}

// ─── Daily overview (whole school) ───────────────────────────

export async function dailyOverview(schoolId: string, date: string) {
  const year = await yearForDate(schoolId, date);
  const settings = await getSchoolSettings(schoolId);
  const sections = await prisma.section.findMany({
    where: { schoolId },
    include: {
      class: true,
      attendanceDays: { where: { date: fromDateString(date) }, include: { records: { select: { status: true } } } },
      classTeachers: { where: { academicYearId: year.id }, include: { teacher: { select: { fullName: true } } } },
      _count: { select: { enrollments: { where: { academicYearId: year.id, status: { notIn: ["LEFT", "TRANSFERRED"] } } } } },
    },
    orderBy: [{ class: { order: "asc" } }, { name: "asc" }],
  });

  const takers = await prisma.user.findMany({
    where: { id: { in: sections.flatMap((s) => s.attendanceDays.map((d) => d.takenById)) } },
    select: { id: true, fullName: true },
  });
  const late = Boolean(settings["attendance.lateCountsAsPresent"]);

  const rows = sections.map((s) => {
    const day = s.attendanceDays[0];
    const counts = day ? count(day.records.map((r) => r.status)) : null;
    return {
      sectionId: s.id,
      label: `${s.class.name} ${s.name}`,
      classTeacher: s.classTeachers[0]?.teacher.fullName ?? null,
      students: s._count.enrollments,
      taken: Boolean(day),
      takenBy: day ? (takers.find((t) => t.id === day.takenById)?.fullName ?? null) : null,
      takenAsProxy: day?.takenAsProxy ?? false,
      counts,
      percent: counts ? attendancePercent(counts, late) : null,
    };
  });

  const all = rows.filter((r) => r.counts).map((r) => r.counts!);
  const totals = all.reduce((sum, c) => ({ present: sum.present + c.present, absent: sum.absent + c.absent, late: sum.late + c.late, leave: sum.leave + c.leave, total: sum.total + c.total }), {
    present: 0,
    absent: 0,
    late: 0,
    leave: 0,
    total: 0,
  });

  return {
    date,
    dateBs: formatBsLong(date),
    sectionsTaken: rows.filter((r) => r.taken).length,
    sectionsTotal: rows.length,
    totals,
    percent: attendancePercent(totals, late),
    rows,
  };
}

// ─── Monthly register (one section, one BS month) ────────────

export async function monthlyRegister(auth: AuthContext, schoolId: string, sectionId: string, bsYear: number, bsMonth: number) {
  const section = await findSection(schoolId, sectionId);
  const dates = bsMonthDates(bsYear, bsMonth);
  const first = dates[0].ad;
  const last = dates[dates.length - 1].ad;

  const access = await getAccess(auth, schoolId, sectionId, todayInNepal(), true);
  if (!access.canView) throw forbidden("You can't see this section's attendance");

  const year = await yearForDate(schoolId, first);
  const [students, days, settings] = await Promise.all([
    sectionStudents(sectionId, year.id),
    prisma.attendanceDay.findMany({
      where: { sectionId, date: { gte: fromDateString(first), lte: fromDateString(last) } },
      include: { records: { select: { studentId: true, status: true } } },
    }),
    getSchoolSettings(schoolId),
  ]);
  const late = Boolean(settings["attendance.lateCountsAsPresent"]);
  const workingDays = (settings["academic.workingDays"] as string[]).map(Number);

  const statusOn = new Map<string, AttendanceStatus>();
  for (const day of days) for (const r of day.records) statusOn.set(`${r.studentId}:${toDateString(day.date)}`, r.status);
  const takenDates = new Set(days.map((d) => toDateString(d.date)));

  return {
    section: { id: section.id, label: `${section.class.name} ${section.name}` },
    month: { bsYear, bsMonth, name: `${BS_MONTHS[bsMonth - 1]} ${bsYear}` },
    days: dates.map((d) => {
      const weekday = new Date(`${d.ad}T00:00:00Z`).getUTCDay();
      return { ad: d.ad, bsDay: d.bsDay, weekday, isWorkingDay: workingDays.includes(weekday), taken: takenDates.has(d.ad) };
    }),
    daysTaken: takenDates.size,
    students: students.map((s) => {
      const statuses = dates.map((d) => statusOn.get(`${s.studentId}:${d.ad}`) ?? null);
      const counts = count(statuses.filter((x): x is AttendanceStatus => x !== null));
      return { studentId: s.studentId, name: s.name, rollNo: s.rollNo, statuses, counts, percent: attendancePercent(counts, late) };
    }),
  };
}

type Register = Awaited<ReturnType<typeof monthlyRegister>>;

export async function monthlyRegisterXlsx(register: Register): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(register.month.name);
  sheet.addRow([`${register.section.label} — Attendance ${register.month.name}`]).font = { bold: true, size: 14 };
  sheet.addRow([]);
  const header = sheet.addRow(["Roll", "Student", ...register.days.map((d) => d.bsDay), "P", "A", "L", "Lv", "%"]);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  for (const s of register.students) {
    const row = sheet.addRow([s.rollNo ?? "", s.name, ...s.statuses.map((st) => (st ? LETTER[st] : "")), s.counts.present, s.counts.absent, s.counts.late, s.counts.leave, s.percent ?? ""]);
    s.statuses.forEach((st, i) => {
      if (st === "ABSENT") row.getCell(3 + i).font = { color: { argb: "FFDC2626" }, bold: true };
    });
  }
  sheet.getColumn(1).width = 6;
  sheet.getColumn(2).width = 28;
  register.days.forEach((_, i) => (sheet.getColumn(3 + i).width = 4));
  sheet.views = [{ state: "frozen", xSplit: 2, ySplit: 3 }];
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function monthlyRegisterPdf(schoolId: string, register: Register): Promise<Buffer> {
  const school = await getLetterhead(schoolId);
  const body = html`${letterheadHtml(school, "Attendance register", `${register.section.label} · ${register.month.name} · attendance taken on ${register.daysTaken} day${register.daysTaken === 1 ? "" : "s"}`)}
    <table class="reg">
      <thead><tr><th>Roll</th><th>Student</th>${register.days.map((d) => html`<th class="${d.isWorkingDay ? "center" : "center off"}">${d.bsDay}</th>`)}<th>P</th><th>A</th><th>L</th><th>Lv</th><th>%</th></tr></thead>
      <tbody>${register.students.map(
        (s) => html`<tr><td class="center">${s.rollNo ?? ""}</td><td>${s.name}</td>${s.statuses.map((st, i) => html`<td class="${["center", st === "ABSENT" ? "abs" : "", register.days[i].isWorkingDay ? "" : "off"].join(" ")}">${st ? LETTER[st] : ""}</td>`)}
          <td class="num">${s.counts.present}</td><td class="num">${s.counts.absent}</td><td class="num">${s.counts.late}</td><td class="num">${s.counts.leave}</td><td class="num">${s.percent ?? "—"}</td></tr>`,
      )}</tbody>
    </table>
    <p class="muted" style="margin-top:8px">P present · A absent · L late · Lv leave · shaded columns are holidays</p>`;
  return htmlToPdf(printDocument(school, `Attendance ${register.section.label} ${register.month.name}`, body, ".reg{table-layout:fixed}.reg th:nth-child(1){width:26px}.reg th:nth-child(2){width:130px}.reg th:nth-last-child(-n+5){width:24px}.reg th:last-child{width:32px}.reg th,.reg td{padding:2px 2px;font-size:9px;overflow:hidden;white-space:nowrap}.reg .abs{color:#dc2626;font-weight:700}.reg .off{background:#f1f5f9}"), { landscape: true });
}

// ─── One student's attendance for a year ─────────────────────

export async function studentAttendance(schoolId: string, studentId: string, academicYearId?: string) {
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId }, select: { id: true } });
  if (!student) throw notFound("Student");
  const year = academicYearId
    ? await prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId } })
    : await prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true } });
  if (!year) throw notFound("Academic year");

  const [records, settings] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { studentId, day: { academicYearId: year.id } },
      include: { day: { select: { date: true } } },
      orderBy: { day: { date: "asc" } },
    }),
    getSchoolSettings(schoolId),
  ]);
  const late = Boolean(settings["attendance.lateCountsAsPresent"]);

  // Group by BS month
  const months = new Map<string, AttendanceStatus[]>();
  for (const r of records) {
    const bs = adToBs(toDateString(r.day.date)).slice(0, 7);
    months.set(bs, [...(months.get(bs) ?? []), r.status]);
  }
  const totals = count(records.map((r) => r.status));

  return {
    academicYear: { id: year.id, name: year.name },
    totals,
    percent: attendancePercent(totals, late),
    months: [...months.entries()].map(([bs, statuses]) => {
      const [y, m] = bs.split("-").map(Number);
      const counts = count(statuses);
      return { bsYear: y, bsMonth: m, name: `${BS_MONTHS[m - 1]} ${y}`, counts, percent: attendancePercent(counts, late) };
    }),
    absences: records
      .filter((r) => r.status === "ABSENT" || r.status === "LEAVE")
      .map((r) => ({ date: toDateString(r.day.date), dateBs: formatBsLong(toDateString(r.day.date)), status: r.status, remark: r.remark })),
  };
}

/** Attendance between two dates (used on report cards). */
export async function attendanceBetween(studentIds: string[], from: Date, to: Date, lateCountsAsPresent: boolean) {
  const records = await prisma.attendanceRecord.findMany({
    where: { studentId: { in: studentIds }, day: { date: { gte: from, lte: to } } },
    select: { studentId: true, status: true },
  });
  const byStudent = new Map<string, AttendanceStatus[]>();
  for (const r of records) byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r.status]);
  return new Map(
    studentIds.map((id) => {
      const counts = count(byStudent.get(id) ?? []);
      return [id, { ...counts, percent: attendancePercent(counts, lateCountsAsPresent) }];
    }),
  );
}
