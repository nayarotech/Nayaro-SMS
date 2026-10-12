/**
 * Demo history: last year (2082) for current students — their class,
 * a published Final Examination and the promotion into 2083 — plus next year
 * (2084) to promote into, and a few notes on student profiles.
 */
import { bsToAd, fromDateString, todayInNepal } from "../src/lib/nepali-date.js";
import { prisma } from "../src/lib/prisma.js";
import type { Actor } from "../src/modules/audit/audit.service.js";
import { createAcademicYear } from "../src/modules/academic/academic-year.service.js";
import type { StudentNoteCategory } from "../src/generated/prisma/client.js";

let seed = 7;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

export async function buildDemoHistory(actor: Actor): Promise<boolean> {
  const { schoolId } = actor;
  const lastYear = await prisma.academicYear.findFirst({ where: { schoolId, name: "2082" } });
  const year = await prisma.academicYear.findFirstOrThrow({ where: { schoolId, isCurrent: true } });
  if (!lastYear || (await prisma.enrollment.count({ where: { academicYearId: lastYear.id } }))) return false;

  if (!(await prisma.academicYear.findFirst({ where: { schoolId, name: "2084" } }))) {
    await createAcademicYear(actor, { name: "2084", startDate: bsToAd("2084-01-01"), endDate: bsToAd("2084-12-30") });
  }

  // Principals can add notes to any student (permission added after the school was created)
  const principal = await prisma.role.findFirst({ where: { schoolId, key: "principal" } });
  if (principal) await prisma.rolePermission.upsert({ where: { roleId_permission: { roleId: principal.id, permission: "student.notes.manage" } }, create: { roleId: principal.id, permission: "student.notes.manage" }, update: {} });

  const classes = await prisma.schoolClass.findMany({ where: { schoolId }, orderBy: { order: "asc" }, include: { sections: true, subjects: { include: { subject: true } } } });
  const current = await prisma.enrollment.findMany({ where: { schoolId, academicYearId: year.id }, include: { student: true } });

  // ─── Last year's enrollments: one class lower, same section name ───
  const placements: { studentId: string; classId: string; sectionId: string; rollNo: number | null; toEnrollmentId: string }[] = [];
  for (const enrollment of current) {
    const index = classes.findIndex((c) => c.id === enrollment.classId);
    if (index <= 0) continue; // the youngest class joined this year
    const previous = classes[index - 1];
    const currentSection = classes[index].sections.find((s) => s.id === enrollment.sectionId);
    const section = previous.sections.find((s) => s.name === currentSection?.name) ?? previous.sections[0];
    if (!section) continue;
    placements.push({ studentId: enrollment.studentId, classId: previous.id, sectionId: section.id, rollNo: enrollment.rollNo, toEnrollmentId: enrollment.id });
  }
  await prisma.enrollment.createMany({
    data: placements.map((p) => ({ schoolId, studentId: p.studentId, academicYearId: lastYear.id, classId: p.classId, sectionId: p.sectionId, rollNo: p.rollNo, status: "PROMOTED" as const })),
  });
  await prisma.student.updateMany({ where: { id: { in: placements.map((p) => p.studentId) } }, data: { admissionDate: fromDateString(bsToAd("2082-01-10")) } });
  const lastEnrollments = await prisma.enrollment.findMany({ where: { academicYearId: lastYear.id } });

  // Last year's class teachers were the same people
  const classTeachers = await prisma.classTeacherAssignment.findMany({ where: { academicYearId: year.id } });
  await prisma.classTeacherAssignment.createMany({
    data: classTeachers.map((a) => ({ schoolId, academicYearId: lastYear.id, sectionId: a.sectionId, teacherId: a.teacherId })),
    skipDuplicates: true,
  });

  // ─── Final Examination 2082, published ───
  const exam = await prisma.exam.create({
    data: { schoolId, academicYearId: lastYear.id, name: "Final Examination", order: 3, startDate: fromDateString(bsToAd("2082-12-01")), endDate: fromDateString(bsToAd("2082-12-12")) },
  });
  const taughtClasses = classes.filter((c) => placements.some((p) => p.classId === c.id));
  for (const schoolClass of taughtClasses) {
    const preprimary = schoolClass.order <= 3;
    await prisma.examSubject.createMany({
      data: schoolClass.subjects.map((cs) => {
        const practical = cs.subject.hasPractical && !preprimary;
        return {
          schoolId,
          examId: exam.id,
          classId: schoolClass.id,
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

  const examSubjects = await prisma.examSubject.findMany({ where: { examId: exam.id } });
  const ability = new Map(lastEnrollments.map((e) => [e.studentId, 0.5 + random() * 0.45]));
  const now = new Date();
  for (const schoolClass of taughtClasses) {
    for (const section of schoolClass.sections) {
      const students = lastEnrollments.filter((e) => e.sectionId === section.id);
      for (const es of examSubjects.filter((x) => x.classId === schoolClass.id)) {
        const sheet = await prisma.markSheet.create({
          data: {
            schoolId,
            examId: exam.id,
            sectionId: section.id,
            subjectId: es.subjectId,
            status: "PUBLISHED",
            submittedAt: now,
            submittedById: actor.userId,
            verifiedAt: now,
            verifiedById: actor.userId,
            publishedAt: now,
            publishedById: actor.userId,
          },
        });
        await prisma.mark.createMany({
          data: students.map((e) => {
            const level = Math.min(0.99, Math.max(0.4, ability.get(e.studentId)! + (random() - 0.5) * 0.2));
            return {
              schoolId,
              markSheetId: sheet.id,
              studentId: e.studentId,
              theory: Math.round(es.theoryFullMarks * level * 2) / 2,
              practical: es.practicalFullMarks ? Math.round(es.practicalFullMarks * Math.min(1, level + 0.1) * 2) / 2 : null,
            };
          }),
        });
      }
    }
  }

  // ─── The promotion runs that moved them into 2083 ───
  for (const schoolClass of taughtClasses) {
    const run = await prisma.promotionRun.create({
      data: { schoolId, fromYearId: lastYear.id, toYearId: year.id, classId: schoolClass.id, examId: exam.id, rollNumbers: "keep", createdById: actor.userId, createdAt: fromDateString(bsToAd("2082-12-25")) },
    });
    const decisions = placements
      .filter((p) => p.classId === schoolClass.id)
      .map((p) => ({
        runId: run.id,
        studentId: p.studentId,
        outcome: "PROMOTE" as const,
        suggested: "PROMOTE" as const,
        fromEnrollmentId: lastEnrollments.find((e) => e.studentId === p.studentId)!.id,
        toEnrollmentId: p.toEnrollmentId,
        previousStudentStatus: "ACTIVE" as const,
      }));
    await prisma.promotionDecision.createMany({ data: decisions });
  }

  // ─── Notes on a few students (including the demo parents' children) ───
  const parentChildren = await prisma.studentGuardian.findMany({ where: { guardian: { user: { phone: { in: ["9811000099", "9811000145"] } } } }, select: { studentId: true } });
  const noted = [...new Set([...parentChildren.map((c) => c.studentId), ...current.slice(0, 12).map((e) => e.studentId)])];
  const teachers = new Map(classTeachers.map((a) => [a.sectionId, a.teacherId]));
  const NOTES: { category: StudentNoteCategory; title: string; body: string; shared: boolean; daysAgo: number }[] = [
    { category: "ACHIEVEMENT", title: "First place in the inter-school quiz", body: "Represented the school with two classmates and won the district round.", shared: true, daysAgo: 20 },
    { category: "GENERAL", title: "Very helpful in class", body: "Helps classmates with reading during free periods.", shared: true, daysAgo: 45 },
    { category: "DISCIPLINE", title: "Late three days in a row", body: "Talked with the student; the bus route changed. Will follow up with parents if it continues.", shared: false, daysAgo: 12 },
    { category: "HEALTH", title: "Needs to sit near the board", body: "Parents mentioned an eye check-up is due.", shared: false, daysAgo: 60 },
    { category: "COUNSELLING", title: "Exam anxiety", body: "Short session before the second terminal. Practised breathing exercises.", shared: false, daysAgo: 30 },
  ];
  const today = todayInNepal();
  for (const [index, studentId] of noted.entries()) {
    const enrollment = current.find((e) => e.studentId === studentId);
    const authorId = (enrollment && teachers.get(enrollment.sectionId)) ?? actor.userId;
    // The demo parents' children always have a note shared with the parent app
    const first = index < parentChildren.length ? NOTES[0] : NOTES[index % NOTES.length];
    for (const note of [first, NOTES[(index + 2) % NOTES.length]]) {
      await prisma.studentNote.create({
        data: {
          schoolId,
          studentId,
          category: note.category,
          title: note.title,
          body: note.body,
          sharedWithParents: note.shared,
          date: fromDateString(new Date(Date.parse(`${today}T00:00:00Z`) - note.daysAgo * 86_400_000).toISOString().slice(0, 10)),
          authorId,
        },
      });
    }
  }
  return true;
}
