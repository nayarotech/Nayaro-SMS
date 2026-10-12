/**
 * Demo optional subjects (NEB Grade 9–10 style): "Optional I" is Computer or
 * Account; each student has chosen one. Other classes study Computer as a
 * normal subject.
 */
import { prisma } from "../src/lib/prisma.js";
import type { Actor } from "../src/modules/audit/audit.service.js";

const GROUP = "Optional I";

export async function buildDemoOptionalSubjects(actor: Actor): Promise<boolean> {
  const { schoolId } = actor;
  if (await prisma.subject.findFirst({ where: { schoolId, name: "Account" } })) return false;

  const year = await prisma.academicYear.findFirstOrThrow({ where: { schoolId, isCurrent: true } });
  const computer = await prisma.subject.findFirstOrThrow({ where: { schoolId, name: "Computer" } });
  const account = await prisma.subject.create({ data: { schoolId, name: "Account", code: "ACC" } });
  const seniorClasses = await prisma.schoolClass.findMany({ where: { schoolId, name: { in: ["Grade 9", "Grade 10"] } }, include: { sections: true } });

  // Only Grades 9–10 have a choice; elsewhere Computer and Optional Maths are ordinary subjects
  await prisma.classSubject.updateMany({ where: { schoolId, isOptional: true }, data: { isOptional: false, optionGroup: null } });
  await prisma.classSubject.updateMany({ where: { schoolId, classId: { in: seniorClasses.map((c) => c.id) }, subjectId: computer.id }, data: { isOptional: true, optionGroup: GROUP } });
  await prisma.classSubject.createMany({ data: seniorClasses.map((c) => ({ schoolId, classId: c.id, subjectId: account.id, isOptional: true, optionGroup: GROUP })) });

  // Account is taught by the Social Studies teacher, and is in every exam those classes sit
  const teacher = await prisma.user.findFirst({ where: { schoolId, staffProfile: { designation: { contains: "Social Studies" } } } });
  if (teacher) {
    await prisma.subjectAssignment.createMany({
      data: seniorClasses.flatMap((c) => c.sections.map((s) => ({ schoolId, academicYearId: year.id, sectionId: s.id, subjectId: account.id, teacherId: teacher.id }))),
      skipDuplicates: true,
    });
  }
  const computerConfigs = await prisma.examSubject.findMany({ where: { schoolId, subjectId: computer.id, classId: { in: seniorClasses.map((c) => c.id) } } });
  await prisma.examSubject.createMany({
    data: computerConfigs.map((c) => ({ schoolId, examId: c.examId, classId: c.classId, subjectId: account.id, theoryFullMarks: 100, theoryPassMarks: 35, creditHours: c.creditHours })),
    skipDuplicates: true,
  });

  // Roughly a third choose Account; two students haven't chosen yet (shown as "not chosen")
  const enrollments = await prisma.enrollment.findMany({ where: { academicYearId: year.id, classId: { in: seniorClasses.map((c) => c.id) } }, orderBy: { rollNo: "asc" } });
  await prisma.studentSubject.createMany({
    data: enrollments.slice(0, -2).map((e, i) => ({ schoolId, studentId: e.studentId, academicYearId: year.id, subjectId: i % 3 === 2 ? account.id : computer.id })),
  });
  return true;
}
