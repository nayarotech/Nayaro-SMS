import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { toDateString } from "../../lib/nepali-date.js";
import { prisma } from "../../lib/prisma.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { resolveAcademicYear } from "../academic/academic-year.service.js";
import { attendanceBetween } from "../attendance/attendance-reports.service.js";
import { computeResults, isPublished } from "../exams/results.service.js";
import { guardianUserIds, notifyUsers } from "../notifications/notification.service.js";
import { getSchoolSettings } from "../settings/settings.service.js";
import type { EnrollmentStatus, StudentStatus } from "../../generated/prisma/client.js";
import { assignRollNumbers, suggestOutcome, type PromotionOutcome, type PromotionRule, type RollNumbering } from "./promotion-rules.js";

/**
 * Year-end promotion, one class at a time:
 * 1. preview — every student with their final result, attendance and a suggestion
 * 2. run — staff confirm an outcome per student; the year's enrollment is closed
 *    and the next year's enrollment created (Enrollment history is never overwritten)
 * 3. undo — while the new year has no attendance or marks for those students
 */

/** Enrollments that still count for their year (LEFT/TRANSFERRED left during the year). */
export const COUNTED_ENROLLMENT: { notIn: EnrollmentStatus[] } = { notIn: ["LEFT", "TRANSFERRED"] };

const CLOSED_STATUS: Record<PromotionOutcome, EnrollmentStatus> = {
  PROMOTE: "PROMOTED",
  DETAIN: "DETAINED",
  GRADUATE: "GRADUATED",
  LEAVE: "COMPLETED",
};

const STUDENT_STATUS: Partial<Record<PromotionOutcome, StudentStatus>> = { GRADUATE: "GRADUATED", LEAVE: "LEFT" };

interface YearPair {
  fromYearId?: string;
  toYearId?: string;
}

/** The year to promote from (current by default) and to (the next one by start date). */
async function resolveYears(schoolId: string, input: YearPair) {
  const fromYear = await resolveAcademicYear(schoolId, input.fromYearId);
  const toYear = input.toYearId
    ? await prisma.academicYear.findFirst({ where: { id: input.toYearId, schoolId } })
    : await prisma.academicYear.findFirst({ where: { schoolId, startDate: { gt: fromYear.startDate } }, orderBy: { startDate: "asc" } });
  if (input.toYearId && !toYear) throw notFound("Academic year");
  if (toYear && toYear.startDate <= fromYear.startDate) throw badRequest("Students can only be promoted into a later academic year");
  return { fromYear, toYear };
}

async function promotionRule(schoolId: string): Promise<PromotionRule> {
  const settings = await getSchoolSettings(schoolId);
  return {
    basis: settings["promotion.basis"] === "none" ? "none" : "finalExam",
    minAttendancePercent: Number(settings["promotion.minAttendancePercent"] ?? 0),
  };
}

// ─── Overview ────────────────────────────────────────────────

/** Every class with how many students have been decided, plus the runs made so far. */
export async function promotionOverview(schoolId: string, input: YearPair) {
  const { fromYear, toYear } = await resolveYears(schoolId, input);
  const [classes, counts, runs] = await Promise.all([
    prisma.schoolClass.findMany({ where: { schoolId }, orderBy: { order: "asc" }, select: { id: true, name: true, order: true } }),
    prisma.enrollment.groupBy({ by: ["classId", "status"], where: { schoolId, academicYearId: fromYear.id, status: COUNTED_ENROLLMENT }, _count: { _all: true } }),
    listRuns(schoolId, fromYear.id),
  ]);

  return {
    fromYear: { id: fromYear.id, name: fromYear.name, isCurrent: fromYear.isCurrent },
    toYear: toYear && { id: toYear.id, name: toYear.name, isCurrent: toYear.isCurrent },
    classes: classes.map((c) => {
      const rows = counts.filter((r) => r.classId === c.id);
      const by = (status: EnrollmentStatus) => rows.find((r) => r.status === status)?._count._all ?? 0;
      const total = rows.reduce((sum, r) => sum + r._count._all, 0);
      return {
        id: c.id,
        name: c.name,
        total,
        pending: by("ACTIVE"),
        promoted: by("PROMOTED"),
        detained: by("DETAINED"),
        graduated: by("GRADUATED"),
        left: by("COMPLETED"),
      };
    }),
    runs,
  };
}

async function listRuns(schoolId: string, fromYearId: string) {
  const runs = await prisma.promotionRun.findMany({
    where: { schoolId, fromYearId },
    include: { class: { select: { name: true } }, toYear: { select: { name: true } }, decisions: { select: { outcome: true } } },
    orderBy: { createdAt: "desc" },
  });
  const users = await prisma.user.findMany({ where: { id: { in: runs.map((r) => r.createdById) } }, select: { id: true, fullName: true } });
  return runs.map((run) => ({
    id: run.id,
    className: run.class.name,
    toYear: run.toYear.name,
    createdAt: run.createdAt,
    createdBy: users.find((u) => u.id === run.createdById)?.fullName ?? null,
    undoneAt: run.undoneAt,
    counts: Object.fromEntries((["PROMOTE", "DETAIN", "GRADUATE", "LEAVE"] as const).map((o) => [o, run.decisions.filter((d) => d.outcome === o).length])) as Record<PromotionOutcome, number>,
  }));
}

// ─── Preview ─────────────────────────────────────────────────

export interface PreviewInput extends YearPair {
  classId: string;
  /** Exam to base suggestions on; defaults to the year's last exam for this class */
  examId?: string;
}

export async function promotionPreview(schoolId: string, input: PreviewInput) {
  const { fromYear, toYear } = await resolveYears(schoolId, input);
  const schoolClass = await prisma.schoolClass.findFirst({ where: { id: input.classId, schoolId }, include: { sections: { orderBy: { name: "asc" } } } });
  if (!schoolClass) throw notFound("Class");
  const nextClass = await prisma.schoolClass.findFirst({
    where: { schoolId, order: { gt: schoolClass.order } },
    orderBy: { order: "asc" },
    include: { sections: { orderBy: { name: "asc" } } },
  });

  // Default: the year's last exam that has marks for this class (the final exam at year end)
  const latest = { orderBy: [{ order: "desc" as const }, { createdAt: "desc" as const }] };
  const forClass = { schoolId, academicYearId: fromYear.id, subjects: { some: { classId: schoolClass.id } } };
  const exam = input.examId
    ? await prisma.exam.findFirst({ where: { id: input.examId, schoolId, academicYearId: fromYear.id } })
    : ((await prisma.exam.findFirst({ where: { ...forClass, markSheets: { some: { section: { classId: schoolClass.id }, marks: { some: {} } } } }, ...latest })) ??
      (await prisma.exam.findFirst({ where: forClass, ...latest })));
  if (input.examId && !exam) throw notFound("Exam");

  const [rule, settings, enrollments] = await Promise.all([
    promotionRule(schoolId),
    getSchoolSettings(schoolId),
    prisma.enrollment.findMany({
      where: { schoolId, academicYearId: fromYear.id, classId: schoolClass.id, status: COUNTED_ENROLLMENT },
      include: { student: true, section: true },
      orderBy: [{ section: { name: "asc" } }, { rollNo: "asc" }],
    }),
  ]);
  const studentIds = enrollments.map((e) => e.studentId);

  const [results, published, attendance, targetEnrollments, decisions] = await Promise.all([
    exam ? computeResults(schoolId, exam.id, schoolClass.id) : null,
    exam ? isPublished(exam.id, schoolClass.id) : false,
    attendanceBetween(studentIds, fromYear.startDate, fromYear.endDate, Boolean(settings["attendance.lateCountsAsPresent"])),
    toYear
      ? prisma.enrollment.findMany({ where: { academicYearId: toYear.id, studentId: { in: studentIds } }, include: { class: true, section: true } })
      : [],
    prisma.promotionDecision.findMany({ where: { fromEnrollmentId: { in: enrollments.map((e) => e.id) }, run: { undoneAt: null } }, select: { fromEnrollmentId: true, outcome: true, runId: true, reason: true } }),
  ]);

  const students = enrollments.map((e) => {
    const row = results?.students.find((s) => s.studentId === e.studentId);
    const att = attendance.get(e.studentId);
    const decided = decisions.find((d) => d.fromEnrollmentId === e.id) ?? null;
    const target = targetEnrollments.find((t) => t.studentId === e.studentId);
    const suggestion = suggestOutcome(
      { isTopClass: !nextClass, examResult: row && row.result.subjects.length ? row.result.result : null, attendancePercent: att?.percent ?? null },
      rule,
    );
    return {
      studentId: e.studentId,
      enrollmentId: e.id,
      name: [e.student.firstName, e.student.middleName, e.student.lastName].filter(Boolean).join(" "),
      admissionNo: e.student.admissionNo,
      section: { id: e.section.id, name: e.section.name },
      rollNo: e.rollNo,
      enrollmentStatus: e.status,
      result: row
        ? { gpa: row.result.gpa, grade: row.result.grade, result: row.result.result, percentage: row.result.percentage, sectionRank: row.sectionRank, failedSubjects: row.result.subjects.filter((s) => s.outcome === "FAIL" || s.outcome === "ABSENT").map((s) => s.subjectName) }
        : null,
      attendancePercent: att?.percent ?? null,
      suggestion,
      decided: decided && { outcome: decided.outcome, runId: decided.runId, reason: decided.reason },
      /** Already enrolled in the target year (e.g. promoted by an earlier run or admitted directly) */
      inTargetYear: target ? { classSection: `${target.class.name} ${target.section.name}`, rollNo: target.rollNo } : null,
    };
  });

  return {
    fromYear: { id: fromYear.id, name: fromYear.name },
    toYear: toYear && { id: toYear.id, name: toYear.name },
    class: { id: schoolClass.id, name: schoolClass.name, sections: schoolClass.sections.map((s) => ({ id: s.id, name: s.name })) },
    nextClass: nextClass && { id: nextClass.id, name: nextClass.name, sections: nextClass.sections.map((s) => ({ id: s.id, name: s.name })) },
    exam: exam && { id: exam.id, name: exam.name, published },
    rule,
    students,
  };
}

// ─── Run ─────────────────────────────────────────────────────

export interface RunInput extends YearPair {
  classId: string;
  examId?: string;
  rollNumbers: RollNumbering;
  notifyParents: boolean;
  decisions: { studentId: string; outcome: PromotionOutcome; toSectionId?: string | null; reason?: string | null }[];
}

export async function runPromotion(actor: Actor, input: RunInput) {
  const preview = await promotionPreview(actor.schoolId, input);
  const { toYear, nextClass } = preview;
  if (!toYear) throw badRequest("Create the next academic year first (Academic setup → Academic years)");
  if (!input.decisions.length) throw badRequest("Choose an outcome for at least one student");

  const seen = new Set<string>();
  const problems: string[] = [];
  const planned = input.decisions.map((decision) => {
    const row = preview.students.find((s) => s.studentId === decision.studentId);
    if (!row) throw badRequest("A student isn't in this class for the year");
    if (seen.has(row.studentId)) throw badRequest(`${row.name} is listed twice`);
    seen.add(row.studentId);
    if (row.decided) problems.push(`${row.name} was already decided`);
    else if (row.inTargetYear) problems.push(`${row.name} is already enrolled in ${toYear.name} (${row.inTargetYear.classSection})`);

    let target: { classId: string; sectionId: string; className: string; sectionName: string } | null = null;
    if (decision.outcome === "PROMOTE" || decision.outcome === "DETAIN") {
      const targetClass = decision.outcome === "PROMOTE" ? nextClass : preview.class;
      if (!targetClass) throw badRequest(`${preview.class.name} is the highest class — choose Graduate or Left for ${row.name}`);
      if (!targetClass.sections.length) throw badRequest(`${targetClass.name} has no sections yet`);
      // Same section name if the class has one (A → A), otherwise the first section
      const section = decision.toSectionId
        ? targetClass.sections.find((s) => s.id === decision.toSectionId)
        : (targetClass.sections.find((s) => s.name === row.section.name) ?? targetClass.sections[0]);
      if (!section) throw badRequest(`That section isn't part of ${targetClass.name}`);
      target = { classId: targetClass.id, sectionId: section.id, className: targetClass.name, sectionName: section.name };
    }
    return { decision, row, target };
  });
  if (problems.length) throw conflict(problems.join("; "), { students: problems });

  // Roll numbers per target section, after the numbers already used there
  const rollNos = new Map<string, number>();
  for (const sectionId of new Set(planned.flatMap((p) => (p.target ? [p.target.sectionId] : [])))) {
    const taken = await prisma.enrollment.findMany({ where: { academicYearId: toYear.id, sectionId, rollNo: { not: null } }, select: { rollNo: true } });
    const candidates = planned
      .filter((p) => p.target?.sectionId === sectionId)
      .map((p) => ({ studentId: p.row.studentId, name: p.row.name, previousRollNo: p.row.rollNo, gpa: p.row.result?.gpa ?? null, percentage: p.row.result?.percentage ?? null }));
    for (const [studentId, rollNo] of assignRollNumbers(candidates, input.rollNumbers, taken.map((t) => t.rollNo!))) rollNos.set(studentId, rollNo);
  }

  const students = await prisma.student.findMany({ where: { id: { in: planned.map((p) => p.row.studentId) } }, select: { id: true, status: true } });

  const runId = await prisma.$transaction(async (tx) => {
    const run = await tx.promotionRun.create({
      data: { schoolId: actor.schoolId, fromYearId: preview.fromYear.id, toYearId: toYear.id, classId: preview.class.id, examId: preview.exam?.id, rollNumbers: input.rollNumbers, createdById: actor.userId },
    });
    for (const { decision, row, target } of planned) {
      const reason = decision.reason?.trim() || null;
      await tx.enrollment.update({ where: { id: row.enrollmentId }, data: { status: CLOSED_STATUS[decision.outcome], remarks: reason } });
      const created = target
        ? await tx.enrollment.create({
            data: { schoolId: actor.schoolId, studentId: row.studentId, academicYearId: toYear.id, classId: target.classId, sectionId: target.sectionId, rollNo: rollNos.get(row.studentId) ?? null },
          })
        : null;
      const previousStatus = students.find((s) => s.id === row.studentId)!.status;
      const newStatus = STUDENT_STATUS[decision.outcome];
      if (newStatus) await tx.student.update({ where: { id: row.studentId }, data: { status: newStatus } });
      await tx.promotionDecision.create({
        data: { runId: run.id, studentId: row.studentId, outcome: decision.outcome, fromEnrollmentId: row.enrollmentId, toEnrollmentId: created?.id, suggested: row.suggestion.outcome, reason, previousStudentStatus: previousStatus },
      });
    }
    await recordAudit(
      actor,
      {
        action: "promotion.run",
        entityType: "PromotionRun",
        entityId: run.id,
        newValue: {
          class: preview.class.name,
          from: preview.fromYear.name,
          to: toYear.name,
          decisions: planned.map((p) => ({ student: p.row.name, outcome: p.decision.outcome, suggested: p.row.suggestion.outcome, to: p.target ? `${p.target.className} ${p.target.sectionName}` : null })),
        },
      },
      tx,
    );
    return run.id;
  });

  if (input.notifyParents) await notifyParents(actor.schoolId, planned, toYear.name, rollNos);

  return {
    runId,
    counts: Object.fromEntries((["PROMOTE", "DETAIN", "GRADUATE", "LEAVE"] as const).map((o) => [o, planned.filter((p) => p.decision.outcome === o).length])),
  };
}

async function notifyParents(
  schoolId: string,
  planned: { decision: RunInput["decisions"][number]; row: { studentId: string; name: string }; target: { className: string; sectionName: string } | null }[],
  yearName: string,
  rollNos: Map<string, number>,
) {
  const parents = await guardianUserIds(planned.map((p) => p.row.studentId));
  for (const { decision, row, target } of planned) {
    const first = row.name.split(" ")[0];
    const placement = target ? `${target.className} ${target.sectionName}${rollNos.has(row.studentId) ? `, roll no. ${rollNos.get(row.studentId)}` : ""}` : "";
    const message =
      decision.outcome === "PROMOTE"
        ? { title: `${first} is promoted to ${target!.className}`, body: `Academic year ${yearName}: ${placement}.` }
        : decision.outcome === "DETAIN"
          ? { title: `${first} will repeat ${target!.className}`, body: `Academic year ${yearName}: ${placement}. Please contact the school to talk about support.` }
          : decision.outcome === "GRADUATE"
            ? { title: `Congratulations! ${first} has graduated`, body: "Thank you for being part of our school." }
            : null;
    if (message) await notifyUsers(schoolId, parents.get(row.studentId) ?? [], { type: `promotion.${decision.outcome.toLowerCase()}`, ...message, data: { studentId: row.studentId } });
  }
}

// ─── Undo ────────────────────────────────────────────────────

/** Undo a run: delete the new enrollments and reopen last year's. Refused once the new year has been used. */
export async function undoPromotion(actor: Actor, runId: string) {
  const run = await prisma.promotionRun.findFirst({
    where: { id: runId, schoolId: actor.schoolId },
    include: { decisions: { include: { student: { select: { firstName: true, lastName: true } } } }, class: true },
  });
  if (!run) throw notFound("Promotion");
  if (run.undoneAt) throw conflict("This promotion was already undone");

  const newEnrollmentIds = run.decisions.flatMap((d) => (d.toEnrollmentId ? [d.toEnrollmentId] : []));
  const newEnrollments = await prisma.enrollment.findMany({ where: { id: { in: newEnrollmentIds } }, select: { id: true, studentId: true, academicYearId: true } });

  // Anything recorded in the new year would be orphaned, so refuse instead
  const [attendance, marks, laterDecisions] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { studentId: { in: newEnrollments.map((e) => e.studentId) }, day: { academicYearId: run.toYearId } }, distinct: ["studentId"], select: { studentId: true } }),
    prisma.mark.findMany({ where: { studentId: { in: newEnrollments.map((e) => e.studentId) }, markSheet: { exam: { academicYearId: run.toYearId } } }, distinct: ["studentId"], select: { studentId: true } }),
    prisma.promotionDecision.findMany({ where: { fromEnrollmentId: { in: newEnrollmentIds }, run: { undoneAt: null } }, select: { studentId: true } }),
  ]);
  const blocked = new Set([...attendance, ...marks, ...laterDecisions].map((r) => r.studentId));
  if (blocked.size) {
    const names = run.decisions.filter((d) => blocked.has(d.studentId)).map((d) => `${d.student.firstName} ${d.student.lastName}`);
    throw conflict(`Can't undo: the new year already has attendance, marks or a later promotion for ${names.join(", ")}. Change those students one by one instead.`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.enrollment.deleteMany({ where: { id: { in: newEnrollmentIds } } });
    for (const d of run.decisions) {
      await tx.enrollment.update({ where: { id: d.fromEnrollmentId }, data: { status: "ACTIVE", remarks: null } });
      await tx.student.update({ where: { id: d.studentId }, data: { status: d.previousStudentStatus } });
    }
    await tx.promotionRun.update({ where: { id: run.id }, data: { undoneAt: new Date(), undoneById: actor.userId } });
    await recordAudit(actor, { action: "promotion.undo", entityType: "PromotionRun", entityId: run.id, oldValue: { class: run.class.name, students: run.decisions.length } }, tx);
  });
}

/** For the student profile: how each year ended. */
export async function promotionHistory(studentId: string) {
  const decisions = await prisma.promotionDecision.findMany({
    where: { studentId, run: { undoneAt: null } },
    include: { run: { select: { createdAt: true, fromYear: { select: { name: true } }, toYear: { select: { name: true } } } } },
    orderBy: { run: { createdAt: "asc" } },
  });
  return decisions.map((d) => ({ fromYear: d.run.fromYear.name, toYear: d.run.toYear.name, outcome: d.outcome, suggested: d.suggested, reason: d.reason, decidedOn: toDateString(d.run.createdAt) }));
}
