import ExcelJS from "exceljs";
import { badRequest, forbidden, notFound } from "../../lib/errors.js";
import { formatBsLong, toDateString } from "../../lib/nepali-date.js";
import { htmlToPdf } from "../../lib/pdf.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthContext } from "../../http/auth-context.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { attendanceBetween } from "../attendance/attendance-reports.service.js";
import { getLetterhead, letterheadHtml, printDocument, type SchoolLetterhead } from "../reports/print.js";
import { getSchoolSettings } from "../settings/settings.service.js";
import { html, type SafeHtml } from "../website/renderer/html.js";
import { subjectTakers } from "../academic/subject-choices.service.js";
import { findExam, getGradingScale } from "./exam.service.js";
import { rankResults, studentResult, type GradeBand, type MarkInput, type StudentResult, type SubjectConfig } from "./grading.js";

/** Results for a class (or one section / some students) in an exam, with ranks. */
export async function computeResults(
  schoolId: string,
  examId: string,
  classId: string,
  options: { sectionId?: string; studentIds?: string[]; publishedOnly?: boolean } = {},
) {
  const exam = await findExam(schoolId, examId);
  const schoolClass = await prisma.schoolClass.findFirst({ where: { id: classId, schoolId } });
  if (!schoolClass) throw notFound("Class");

  const [examSubjects, enrollments, bands, remarks, takes] = await Promise.all([
    prisma.examSubject.findMany({ where: { examId, classId }, include: { subject: true }, orderBy: { subject: { name: "asc" } } }),
    prisma.enrollment.findMany({
      where: { classId, academicYearId: exam.academicYearId, status: { notIn: ["LEFT", "TRANSFERRED"] } },
      include: { section: true, student: true },
      orderBy: [{ section: { name: "asc" } }, { rollNo: "asc" }],
    }),
    getGradingScale(schoolId),
    prisma.reportCardRemark.findMany({ where: { examId } }),
    subjectTakers(classId, exam.academicYearId),
  ]);
  const configs: SubjectConfig[] = examSubjects.map((es) => ({
    subjectId: es.subjectId,
    subjectName: es.subject.name,
    theoryFullMarks: es.theoryFullMarks,
    theoryPassMarks: es.theoryPassMarks,
    practicalFullMarks: es.practicalFullMarks,
    practicalPassMarks: es.practicalPassMarks,
    creditHours: es.creditHours,
  }));

  const marks = await prisma.mark.findMany({
    where: {
      markSheet: { examId, section: { classId }, ...(options.publishedOnly && { status: "PUBLISHED" }) },
    },
    include: { markSheet: { select: { subjectId: true } } },
  });
  const marksByStudent = new Map<string, Map<string, MarkInput>>();
  for (const m of marks) {
    const map = marksByStudent.get(m.studentId) ?? new Map<string, MarkInput>();
    map.set(m.markSheet.subjectId, { theory: m.theory, practical: m.practical, status: m.status });
    marksByStudent.set(m.studentId, map);
  }

  const rows = enrollments.map((e) => ({
    studentId: e.studentId,
    name: [e.student.firstName, e.student.middleName, e.student.lastName].filter(Boolean).join(" "),
    admissionNo: e.student.admissionNo,
    dateOfBirth: toDateString(e.student.dateOfBirth),
    gender: e.student.gender,
    rollNo: e.rollNo,
    sectionId: e.sectionId,
    sectionName: e.section.name,
    remark: remarks.find((r) => r.studentId === e.studentId)?.remark ?? null,
    // Only the subjects this student takes (compulsory + their optional choices)
    result: studentResult(configs.filter((c) => takes(e.studentId, c.subjectId)), marksByStudent.get(e.studentId) ?? new Map(), bands),
  }));

  // Ranks across the whole class and within each section
  const classRanks = rankResults(rows);
  const sectionRanks = new Map<(typeof rows)[number], number | null>();
  for (const sectionId of new Set(rows.map((r) => r.sectionId))) {
    for (const [row, rank] of rankResults(rows.filter((r) => r.sectionId === sectionId))) sectionRanks.set(row, rank);
  }

  const students = rows
    .map((row) => ({ ...row, classRank: classRanks.get(row) ?? null, sectionRank: sectionRanks.get(row) ?? null }))
    .filter((row) => (!options.sectionId || row.sectionId === options.sectionId) && (!options.studentIds || options.studentIds.includes(row.studentId)));

  return {
    exam: { id: exam.id, name: exam.name, academicYear: exam.academicYear.name, startDate: toDateString(exam.startDate), endDate: toDateString(exam.endDate) },
    examDates: { yearStart: exam.academicYear.startDate, end: exam.endDate ?? exam.academicYear.endDate },
    class: { id: schoolClass.id, name: schoolClass.name, studentsInClass: rows.length },
    subjects: configs,
    bands,
    students,
  };
}

export type ResultSet = Awaited<ReturnType<typeof computeResults>>;

/** Whether results for this class have been published (all its mark sheets). */
export async function isPublished(examId: string, classId: string): Promise<boolean> {
  const [subjects, sections] = await Promise.all([prisma.examSubject.count({ where: { examId, classId } }), prisma.section.count({ where: { classId } })]);
  const published = await prisma.markSheet.count({ where: { examId, status: "PUBLISHED", section: { classId } } });
  return subjects > 0 && published >= subjects * sections;
}

/** Staff can see results for classes they teach or manage. */
export async function assertCanViewResults(auth: AuthContext, academicYearId: string, classId: string, sectionId?: string) {
  if (["exam.manage", "marks.verify", "marks.publish", "reportcard.generate", "student.record.view"].some((p) => auth.permissions.has(p))) return;
  const teaches = await prisma.classTeacherAssignment.findFirst({
    where: { academicYearId, teacherId: auth.userId, section: { classId, ...(sectionId && { id: sectionId }) } },
  });
  if (!teaches) throw forbidden("You can only see results for your own class");
}

// ─── Remarks ─────────────────────────────────────────────────

export async function setRemark(auth: AuthContext, actor: Actor, examId: string, studentId: string, remark: string) {
  const exam = await findExam(actor.schoolId, examId);
  const enrollment = await prisma.enrollment.findFirst({ where: { studentId, academicYearId: exam.academicYearId, schoolId: actor.schoolId } });
  if (!enrollment) throw notFound("Student");
  const classTeacher = await prisma.classTeacherAssignment.findFirst({ where: { academicYearId: exam.academicYearId, sectionId: enrollment.sectionId, teacherId: actor.userId } });
  if (!classTeacher && !auth.permissions.has("exam.manage")) throw forbidden("Only the class teacher can write remarks");

  await prisma.reportCardRemark.upsert({
    where: { examId_studentId: { examId, studentId } },
    create: { schoolId: actor.schoolId, examId, studentId, remark, authorId: actor.userId },
    update: { remark, authorId: actor.userId },
  });
  await recordAudit(actor, { action: "reportcard.remark", entityType: "ReportCardRemark", entityId: studentId, newValue: { examId, remark } });
}

// ─── Ledger (marks of the whole section) ─────────────────────

const RESULT_LABEL = { PASS: "Pass", FAIL: "Fail", INCOMPLETE: "Incomplete" };

export async function ledgerXlsx(results: ResultSet): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Ledger");
  sheet.addRow([`${results.exam.name} ${results.exam.academicYear} — ${results.class.name}`]).font = { bold: true, size: 14 };
  sheet.addRow([]);
  const header = sheet.addRow(["Roll", "Student", "Section", ...results.subjects.flatMap((s) => [`${s.subjectName}`, "Grade"]), "Total", "%", "GPA", "Grade", "Result", "Rank"]);
  header.font = { bold: true };
  for (const s of results.students) {
    sheet.addRow([
      s.rollNo ?? "",
      s.name,
      s.sectionName,
      ...results.subjects.flatMap((config) => {
        const r = s.result.subjects.find((x) => x.subjectId === config.subjectId);
        return r ? [r.obtained ?? r.grade, r.grade] : ["", ""];
      }),
      s.result.totalObtained,
      s.result.percentage,
      s.result.gpa ?? "",
      s.result.grade,
      RESULT_LABEL[s.result.result],
      s.sectionRank ?? "",
    ]);
  }
  sheet.getColumn(2).width = 26;
  sheet.views = [{ state: "frozen", xSplit: 2, ySplit: 3 }];
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function ledgerPdf(schoolId: string, results: ResultSet): Promise<Buffer> {
  const school = await getLetterhead(schoolId);
  const sectionLabel = [...new Set(results.students.map((s) => s.sectionName))].join(", ");
  const body = html`${letterheadHtml(school, "Marks ledger", `${results.exam.name} ${results.exam.academicYear} · ${results.class.name} ${sectionLabel}`)}
    <table class="ledger">
      <thead><tr><th>Roll</th><th>Student</th>${results.subjects.map((s) => html`<th class="center">${s.subjectName}<br><span class="muted">${s.theoryFullMarks + s.practicalFullMarks}</span></th>`)}<th class="center">Total</th><th class="center">%</th><th class="center">GPA</th><th class="center">Grade</th><th class="center">Result</th><th class="center">Rank</th></tr></thead>
      <tbody>${results.students.map(
        (s) => html`<tr><td class="center">${s.rollNo ?? ""}</td><td>${s.name}</td>
          ${results.subjects.map((config) => {
            const r = s.result.subjects.find((x) => x.subjectId === config.subjectId);
            return r ? html`<td class="center ${r.outcome === "FAIL" || r.outcome === "ABSENT" ? "fail" : ""}">${r.obtained ?? ""} <span class="muted">${r.grade}</span></td>` : html`<td class="center muted">–</td>`;
          })}
          <td class="num">${s.result.totalObtained}</td><td class="num">${s.result.percentage}</td><td class="num">${s.result.gpa ?? "—"}</td>
          <td class="center">${s.result.grade}</td><td class="center">${RESULT_LABEL[s.result.result]}</td><td class="center">${s.sectionRank ?? "—"}</td></tr>`,
      )}</tbody>
    </table>`;
  return htmlToPdf(printDocument(school, `Ledger ${results.class.name}`, body, ".ledger th,.ledger td{font-size:9px;padding:3px}.ledger .fail{color:#dc2626;font-weight:600}"), { landscape: true });
}

// ─── Report cards ────────────────────────────────────────────

export async function reportCardsPdf(schoolId: string, results: ResultSet): Promise<Buffer> {
  if (!results.students.length) throw badRequest("No students to print");
  const [school, settings] = await Promise.all([getLetterhead(schoolId), getSchoolSettings(schoolId)]);
  const attendance = settings["exams.showAttendance"]
    ? await attendanceBetween(results.students.map((s) => s.studentId), results.examDates.yearStart, results.examDates.end, Boolean(settings["attendance.lateCountsAsPresent"]))
    : null;

  const pages = results.students.map((student, index) =>
    reportCardPage(school, results, student, {
      attendance: attendance?.get(student.studentId) ?? null,
      showRank: Boolean(settings["exams.showRank"]),
      showPercentage: Boolean(settings["exams.showPercentage"]),
      signatures: String(settings["exams.signatures"] ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      note: String(settings["exams.reportCardNote"] ?? ""),
      last: index === results.students.length - 1,
    }),
  );
  return htmlToPdf(printDocument(school, `Report cards — ${results.exam.name}`, html`${pages}`, REPORT_CARD_CSS));
}

interface CardOptions {
  attendance: { present: number; late: number; total: number; percent: number | null } | null;
  showRank: boolean;
  showPercentage: boolean;
  signatures: string[];
  note: string;
  last: boolean;
}

function reportCardPage(school: SchoolLetterhead, results: ResultSet, student: ResultSet["students"][number], options: CardOptions): SafeHtml {
  const r: StudentResult = student.result;
  const resultClass = r.result === "PASS" ? "pass" : r.result === "FAIL" ? "fail" : "";
  return html`<section class="card ${options.last ? "" : "page-break"}">
    ${letterheadHtml(school, "Progress report", `${results.exam.name} · Academic year ${results.exam.academicYear}`)}
    <table class="info">
      <tr><th>Student</th><td><b>${student.name}</b></td><th>Admission no.</th><td>${student.admissionNo}</td></tr>
      <tr><th>Class</th><td>${results.class.name} ${student.sectionName}</td><th>Roll no.</th><td>${student.rollNo ?? "—"}</td></tr>
      <tr><th>Date of birth</th><td>${student.dateOfBirth ? `${formatBsLong(student.dateOfBirth)} BS` : "—"}</td><th>Issued on</th><td>${formatBsLong(new Date())} BS</td></tr>
    </table>

    <table class="marks">
      <thead><tr><th>Subject</th><th class="center">Credit hour</th><th class="center">Full marks</th><th class="center">Pass marks</th><th class="center">Theory</th><th class="center">Practical</th><th class="center">Total</th><th class="center">Grade</th><th class="center">Grade point</th></tr></thead>
      <tbody>${r.subjects.map((s) => {
        const config = results.subjects.find((c) => c.subjectId === s.subjectId)!;
        const special = s.outcome === "ABSENT" ? "Absent" : s.outcome === "MEDICAL" ? "Medical" : null;
        return html`<tr class="${s.outcome === "FAIL" || s.outcome === "ABSENT" ? "fail" : ""}">
          <td>${s.subjectName}</td><td class="center">${s.creditHours}</td><td class="center">${s.fullMarks}</td>
          <td class="center">${config.theoryPassMarks + config.practicalPassMarks}</td>
          <td class="center">${special ?? s.theory ?? "—"}${s.theoryGrade ? html` <span class="muted">(${s.theoryGrade})</span>` : ""}</td>
          <td class="center">${config.practicalFullMarks ? html`${s.practical ?? "—"}${s.practicalGrade ? html` <span class="muted">(${s.practicalGrade})</span>` : ""}` : "—"}</td>
          <td class="center"><b>${s.obtained ?? "—"}</b></td><td class="center"><b>${s.grade}</b></td><td class="center">${s.gradePoint ?? "—"}</td>
        </tr>`;
      })}</tbody>
    </table>

    <div class="summary">
      <div><span>Total</span><b>${r.totalObtained} / ${r.totalFull}</b></div>
      ${options.showPercentage ? html`<div><span>Percentage</span><b>${r.percentage}%</b></div>` : ""}
      <div><span>GPA</span><b>${r.gpa ?? "—"}</b></div>
      <div><span>Grade</span><b>${r.grade}</b></div>
      <div class="${resultClass}"><span>Result</span><b>${RESULT_LABEL[r.result]}</b></div>
      ${options.showRank ? html`<div><span>Rank in section</span><b>${student.sectionRank ?? "—"}</b></div>` : ""}
      ${options.attendance ? html`<div><span>Attendance</span><b>${options.attendance.present + options.attendance.late}/${options.attendance.total}${options.attendance.percent !== null ? ` (${options.attendance.percent}%)` : ""}</b></div>` : ""}
    </div>

    <div class="remark"><b>Class teacher's remark:</b> ${student.remark ?? ""}</div>

    <table class="legend">
      <tr><th>Percentage</th>${results.bands.map((b: GradeBand, i: number) => html`<td>${i === 0 ? `${b.min}+` : `${b.min}–<${results.bands[i - 1].min}`}</td>`)}</tr>
      <tr><th>Grade</th>${results.bands.map((b) => html`<td><b>${b.grade}</b></td>`)}</tr>
      <tr><th>Grade point</th>${results.bands.map((b) => html`<td>${b.gradePoint}</td>`)}</tr>
    </table>

    <div class="signatures">${options.signatures.map((name) => html`<div><span></span>${name}</div>`)}</div>
    ${options.note ? html`<p class="note">${options.note}</p>` : ""}
  </section>`;
}

const REPORT_CARD_CSS = `
.card{min-height:270mm;display:flex;flex-direction:column}
.info{margin-bottom:12px}.info th{width:16%;background:#f8fafc}
.marks th{background:var(--brand);color:#fff;border-color:var(--brand)}
.marks tr.fail td{color:#dc2626}
.summary{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.summary div{flex:1;min-width:90px;border:1px solid #cbd5e1;border-radius:6px;padding:6px 8px;display:flex;flex-direction:column}
.summary span{font-size:9.5px;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
.summary b{font-size:14px}
.summary .pass{border-color:#16a34a;background:#f0fdf4}.summary .fail{border-color:#dc2626;background:#fef2f2}
.remark{border:1px solid #cbd5e1;border-radius:6px;padding:8px;min-height:44px;margin-bottom:12px}
.legend{font-size:9.5px;margin-bottom:auto}.legend th{width:16%}.legend td{text-align:center}
.signatures{display:flex;justify-content:space-between;gap:24px;margin-top:48px}
.signatures div{flex:1;text-align:center;font-size:11px}
.signatures span{display:block;border-top:1px solid #0f172a;margin-bottom:4px}
.note{margin-top:10px;text-align:center;color:#64748b;font-size:10px}`;

// ─── Parent app (published results only) ─────────────────

/** For the parent app: published results only. */
export async function publishedResultsForStudent(schoolId: string, studentId: string) {
  const enrollments = await prisma.enrollment.findMany({ where: { studentId, schoolId }, include: { academicYear: true } });
  const items = [];
  for (const enrollment of enrollments) {
    const examList = await prisma.exam.findMany({ where: { academicYearId: enrollment.academicYearId }, orderBy: { order: "asc" } });
    for (const exam of examList) {
      if (!(await isPublished(exam.id, enrollment.classId))) continue;
      const data = await computeResults(schoolId, exam.id, enrollment.classId, { studentIds: [studentId], publishedOnly: true });
      const row = data.students[0];
      if (row) items.push({ examId: exam.id, examName: exam.name, academicYear: enrollment.academicYear.name, classId: enrollment.classId, gpa: row.result.gpa, grade: row.result.grade, result: row.result.result, percentage: row.result.percentage, sectionRank: row.sectionRank });
    }
  }
  return items.reverse();
}

export async function publishedResultDetail(schoolId: string, studentId: string, examId: string) {
  const exam = await findExam(schoolId, examId);
  const enrollment = await prisma.enrollment.findFirst({ where: { studentId, academicYearId: exam.academicYearId } });
  if (!enrollment || !(await isPublished(examId, enrollment.classId))) throw notFound("Results");
  const data = await computeResults(schoolId, examId, enrollment.classId, { studentIds: [studentId], publishedOnly: true });
  return data;
}
