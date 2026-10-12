/**
 * Demo attendance and exams: ~2 months of attendance, a proxy teacher,
 * and a First Terminal exam with marks in every workflow state.
 */
import { bsToAd, fromDateString, todayInNepal } from "../src/lib/nepali-date.js";
import { prisma } from "../src/lib/prisma.js";
import type { Actor } from "../src/modules/audit/audit.service.js";
import { publishClassResults } from "../src/modules/exams/marks.service.js";
import type { AttendanceStatus, MarkSheetStatus } from "../src/generated/prisma/client.js";

let seed = 42;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export async function buildDemoAcademics(actor: Actor): Promise<boolean> {
  const { schoolId } = actor;
  if (await prisma.exam.count({ where: { schoolId } })) return false;

  const year = await prisma.academicYear.findFirstOrThrow({ where: { schoolId, isCurrent: true } });
  const sections = await prisma.section.findMany({ where: { schoolId }, include: { class: true, classTeachers: { where: { academicYearId: year.id } } } });
  const enrollments = await prisma.enrollment.findMany({ where: { schoolId, academicYearId: year.id } });
  const today = todayInNepal();

  // ─── Attendance: last 60 days (Sunday–Friday), not today ───
  // Each student has their own "attendance habit" so percentages look realistic
  const habit = new Map(enrollments.map((e) => [e.studentId, 0.86 + random() * 0.13]));
  for (let offset = 60; offset >= 1; offset--) {
    const date = addDays(today, -offset);
    if (new Date(`${date}T00:00:00Z`).getUTCDay() === 6) continue;
    for (const section of sections) {
      const teacherId = section.classTeachers[0]?.teacherId ?? actor.userId;
      const day = await prisma.attendanceDay.create({
        data: { schoolId, academicYearId: year.id, sectionId: section.id, date: fromDateString(date), takenById: teacherId },
      });
      const records = enrollments
        .filter((e) => e.sectionId === section.id)
        .map((e) => {
          const r = random();
          const p = habit.get(e.studentId)!;
          const status: AttendanceStatus = r < p ? (random() < 0.05 ? "LATE" : "PRESENT") : random() < 0.3 ? "LEAVE" : "ABSENT";
          return { schoolId, dayId: day.id, studentId: e.studentId, status, updatedById: teacherId };
        });
      await prisma.attendanceRecord.createMany({ data: records });
    }
  }

  // ─── Proxy: the computer teacher covers Grade 3 A for three days ───
  const grade3A = sections.find((s) => s.class.name === "Grade 3" && s.name === "A");
  const computerTeacher = await prisma.user.findFirst({ where: { schoolId, staffProfile: { designation: "Computer Teacher" } } });
  if (grade3A && computerTeacher) {
    await prisma.proxyAssignment.create({
      data: {
        schoolId,
        sectionId: grade3A.id,
        teacherId: computerTeacher.id,
        startDate: fromDateString(today),
        endDate: fromDateString(addDays(today, 2)),
        reason: "Class teacher on leave",
        assignedById: actor.userId,
      },
    });
  }

  // ─── Exams ───
  const first = await prisma.exam.create({
    data: { schoolId, academicYearId: year.id, name: "First Terminal Examination", order: 1, startDate: fromDateString(bsToAd("2083-05-10")), endDate: fromDateString(bsToAd("2083-05-20")) },
  });
  const second = await prisma.exam.create({
    data: { schoolId, academicYearId: year.id, name: "Second Terminal Examination", order: 2, startDate: fromDateString(bsToAd("2083-08-15")), endDate: fromDateString(bsToAd("2083-08-25")) },
  });

  const classSubjects = await prisma.classSubject.findMany({ where: { schoolId }, include: { subject: true, class: true } });
  for (const exam of [first, second]) {
    await prisma.examSubject.createMany({
      data: classSubjects.map((cs) => {
        const preprimary = cs.class.order <= 3;
        const practical = cs.subject.hasPractical && !preprimary;
        return {
          schoolId,
          examId: exam.id,
          classId: cs.classId,
          subjectId: cs.subjectId,
          theoryFullMarks: preprimary ? 50 : practical ? 75 : 100,
          theoryPassMarks: preprimary ? 17.5 : practical ? 26.25 : 35,
          practicalFullMarks: practical ? 25 : 0,
          practicalPassMarks: practical ? 8.75 : 0,
          creditHours: cs.subject.name === "Health & Physical Education" || cs.isOptional ? 2 : 4,
        };
      }),
    });
  }

  // Marks for the First Terminal, in different states per class
  const STATE_BY_CLASS: Record<string, MarkSheetStatus | "PARTIAL" | "NONE"> = {
    "Grade 4": "PARTIAL",
    "Grade 5": "PUBLISHED",
    "Grade 6": "PUBLISHED",
    "Grade 7": "VERIFIED",
    "Grade 8": "SUBMITTED",
  };
  const examSubjects = await prisma.examSubject.findMany({ where: { examId: first.id } });
  const ability = new Map(enrollments.map((e) => [e.studentId, 0.45 + random() * 0.5]));

  for (const section of sections) {
    const state = STATE_BY_CLASS[section.class.name] ?? "NONE";
    if (state === "NONE") continue;
    const students = enrollments.filter((e) => e.sectionId === section.id);
    const subjects = examSubjects.filter((es) => es.classId === section.classId);
    for (const [index, es] of subjects.entries()) {
      if (state === "PARTIAL" && index > 1) continue;
      const status: MarkSheetStatus = state === "PARTIAL" ? "DRAFT" : state === "PUBLISHED" ? "VERIFIED" : state;
      const now = new Date();
      const sheet = await prisma.markSheet.create({
        data: {
          schoolId,
          examId: first.id,
          sectionId: section.id,
          subjectId: es.subjectId,
          status,
          ...(status !== "DRAFT" && { submittedAt: now, submittedById: actor.userId }),
          ...((status === "VERIFIED" || status === "PUBLISHED") && { verifiedAt: now, verifiedById: actor.userId }),
        },
      });
      await prisma.mark.createMany({
        data: students.map((e) => {
          const level = Math.min(0.99, Math.max(0.15, ability.get(e.studentId)! + (random() - 0.5) * 0.25));
          const absent = random() < 0.01;
          return {
            schoolId,
            markSheetId: sheet.id,
            studentId: e.studentId,
            status: absent ? ("ABSENT" as const) : ("PRESENT" as const),
            theory: absent ? null : Math.round(es.theoryFullMarks * level * 2) / 2,
            practical: absent || !es.practicalFullMarks ? null : Math.round(es.practicalFullMarks * Math.min(1, level + 0.1) * 2) / 2,
          };
        }),
      });
    }
  }

  for (const className of ["Grade 5", "Grade 6"]) {
    const schoolClass = sections.find((s) => s.class.name === className)!.class;
    await publishClassResults(actor, first.id, schoolClass.id);
  }
  return true;
}
