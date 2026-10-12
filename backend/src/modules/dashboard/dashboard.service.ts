import { prisma } from "../../lib/prisma.js";
import { adToBs, toDateString, todayInNepal } from "../../lib/nepali-date.js";
import type { AuthContext } from "../../http/auth-context.js";
import { SYSTEM_ROLE_KEYS } from "../permissions/default-roles.js";
import { getSchoolSettings } from "../settings/settings.service.js";
import { dailyOverview } from "../attendance/attendance-reports.service.js";
import { mySections } from "../attendance/attendance.service.js";

/**
 * Data for the admin dashboard. Which widgets appear is a school setting
 * (dashboard.adminWidgets); each widget is also hidden if the user lacks the
 * permission needed to see its data.
 */
export async function getAdminDashboard(schoolId: string, auth: AuthContext) {
  const settings = await getSchoolSettings(schoolId);
  const enabled = new Set(settings["dashboard.adminWidgets"] as string[]);
  const can = (permission: string) => auth.permissions.has(permission);

  const today = todayInNepal();
  const currentYear = await prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true } });

  const widgets: Record<string, unknown> = {};

  if (enabled.has("myWork") && settings["modules.attendance"] !== false) {
    widgets.myWork = await myWork(schoolId, auth, today, currentYear?.id ?? null);
  }

  if (enabled.has("attendanceToday") && (can("attendance.report") || can("attendance.proxy.assign")) && currentYear) {
    const overview = await dailyOverview(schoolId, today);
    widgets.attendanceToday = {
      percent: overview.percent,
      sectionsTaken: overview.sectionsTaken,
      sectionsTotal: overview.sectionsTotal,
      present: overview.totals.present + overview.totals.late,
      absent: overview.totals.absent,
      leave: overview.totals.leave,
      notTaken: overview.rows.filter((r) => !r.taken).map((r) => ({ sectionId: r.sectionId, label: r.label, classTeacher: r.classTeacher })),
    };
  }

  if (enabled.has("stats")) {
    const [students, staff, guardians, classes, sections] = await Promise.all([
      prisma.student.count({ where: { schoolId, status: "ACTIVE" } }),
      prisma.user.count({
        where: { schoolId, isActive: true, roles: { some: { role: { key: { notIn: [SYSTEM_ROLE_KEYS.parent, SYSTEM_ROLE_KEYS.student] } } } } },
      }),
      prisma.guardian.count({ where: { schoolId } }),
      prisma.schoolClass.count({ where: { schoolId } }),
      prisma.section.count({ where: { schoolId } }),
    ]);
    widgets.stats = { students, staff, guardians, classes, sections };
  }

  if (enabled.has("studentsByClass") && can("student.view") && currentYear) {
    const [classes, counts] = await Promise.all([
      prisma.schoolClass.findMany({ where: { schoolId }, orderBy: { order: "asc" }, select: { id: true, name: true } }),
      prisma.enrollment.groupBy({
        by: ["classId"],
        where: { schoolId, academicYearId: currentYear.id, status: { notIn: ["LEFT", "TRANSFERRED"] } },
        _count: { _all: true },
      }),
    ]);
    const countByClass = new Map(counts.map((c) => [c.classId, c._count._all]));
    widgets.studentsByClass = classes.map((c) => ({ className: c.name, count: countByClass.get(c.id) ?? 0 }));
  }

  if (enabled.has("genderSplit") && can("student.view")) {
    const rows = await prisma.student.groupBy({ by: ["gender"], where: { schoolId, status: "ACTIVE" }, _count: { _all: true } });
    widgets.genderSplit = rows.map((r) => ({ gender: r.gender, count: r._count._all }));
  }

  if (enabled.has("recentAdmissions") && can("student.view")) {
    const students = await prisma.student.findMany({
      where: { schoolId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNo: true,
        admissionDate: true,
        enrollments: { orderBy: { createdAt: "desc" }, take: 1, select: { class: { select: { name: true } }, section: { select: { name: true } } } },
      },
    });
    widgets.recentAdmissions = students.map((s) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      admissionNo: s.admissionNo,
      admissionDate: toDateString(s.admissionDate),
      classSection: s.enrollments[0] ? `${s.enrollments[0].class.name} ${s.enrollments[0].section.name}` : null,
    }));
  }

  if (enabled.has("recentActivity") && can("audit.view")) {
    const logs = await prisma.auditLog.findMany({ where: { schoolId }, orderBy: { createdAt: "desc" }, take: 8 });
    const actors = await prisma.user.findMany({
      where: { id: { in: logs.map((l) => l.actorId).filter((id): id is string => Boolean(id)) } },
      select: { id: true, fullName: true },
    });
    const actorName = new Map(actors.map((a) => [a.id, a.fullName]));
    widgets.recentActivity = logs.map((l) => ({
      id: l.id,
      action: l.action,
      actor: l.actorId ? (actorName.get(l.actorId) ?? "Unknown") : "System",
      at: l.createdAt,
    }));
  }

  if (enabled.has("setupChecklist") && can("academic.manage")) {
    const [years, classes, subjects, staff, students] = await Promise.all([
      prisma.academicYear.count({ where: { schoolId } }),
      prisma.schoolClass.count({ where: { schoolId } }),
      prisma.subject.count({ where: { schoolId } }),
      prisma.staffProfile.count({ where: { schoolId } }),
      prisma.student.count({ where: { schoolId } }),
    ]);
    widgets.setupChecklist = [
      { key: "year", label: "Create the current academic year", done: Boolean(currentYear), path: "/academic/years" },
      { key: "classes", label: "Add classes and sections", done: classes > 0, path: "/academic/classes" },
      { key: "subjects", label: "Add subjects", done: subjects > 0, path: "/academic/subjects" },
      { key: "staff", label: "Add teachers and staff", done: staff > 0, path: "/staff" },
      { key: "assignments", label: "Assign teachers to subjects and sections", done: false, path: "/academic/assignments" },
      { key: "students", label: "Admit students", done: students > 0, path: "/students/new" },
    ];
    if (years && currentYear) {
      const assignments = await prisma.subjectAssignment.count({ where: { schoolId, academicYearId: currentYear.id } });
      (widgets.setupChecklist as { key: string; done: boolean }[]).find((i) => i.key === "assignments")!.done = assignments > 0;
    }
  }

  return {
    today: { ad: today, bs: adToBs(today) },
    currentAcademicYear: currentYear && { id: currentYear.id, name: currentYear.name },
    widgetOrder: [...enabled],
    widgets,
  };
}

/** The user's own to-do list: attendance not yet taken, marks to enter or check. */
async function myWork(schoolId: string, auth: AuthContext, today: string, academicYearId: string | null) {
  const tasks: { kind: string; label: string; detail: string; path: string }[] = [];

  if (academicYearId && auth.permissions.has("attendance.mark")) {
    const sections = (await mySections(auth, schoolId, today)).filter((s) => s.role !== "admin" && !s.taken);
    for (const s of sections) {
      tasks.push({ kind: "attendance", label: `Take attendance for ${s.label}`, detail: s.role === "proxy" ? "You're the proxy teacher today" : `${s.students} students`, path: `/attendance/sections/${s.sectionId}` });
    }
  }

  if (academicYearId && auth.permissions.has("marks.enter")) {
    const assignments = await prisma.subjectAssignment.findMany({
      where: { academicYearId, teacherId: auth.userId },
      include: { section: { include: { class: true } }, subject: true },
    });
    const exams = await prisma.exam.findMany({ where: { academicYearId }, include: { subjects: true, markSheets: true } });
    for (const exam of exams) {
      for (const a of assignments) {
        if (!exam.subjects.some((s) => s.classId === a.section.classId && s.subjectId === a.subjectId)) continue;
        const sheet = exam.markSheets.find((m) => m.sectionId === a.sectionId && m.subjectId === a.subjectId);
        if (sheet && sheet.status !== "DRAFT") continue;
        // Only exams that have started (or have no dates yet) need marks
        if (exam.startDate && toDateString(exam.startDate) > today) continue;
        tasks.push({
          kind: sheet?.returnNote ? "returned" : "marks",
          label: `${sheet?.returnNote ? "Fix" : "Enter"} ${a.subject.name} marks · ${a.section.class.name} ${a.section.name}`,
          detail: sheet?.returnNote ? `Sent back: ${sheet.returnNote}` : exam.name,
          path: `/exams/${exam.id}/marks/${a.sectionId}/${a.subjectId}`,
        });
      }
    }
  }

  if (auth.permissions.has("marks.verify")) {
    const submitted = await prisma.markSheet.count({ where: { schoolId, status: "SUBMITTED" } });
    if (submitted) tasks.push({ kind: "verify", label: `Check ${submitted} submitted mark sheet${submitted === 1 ? "" : "s"}`, detail: "Verify or send back", path: "/exams/marks" });
  }

  return tasks.slice(0, 12);
}
