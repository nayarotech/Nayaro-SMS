import { badRequest, forbidden } from "../../lib/errors.js";
import { formatBsLong, fromDateString, toDateString, todayInNepal } from "../../lib/nepali-date.js";
import { prisma } from "../../lib/prisma.js";
import { fileUrl } from "../../lib/storage/index.js";
import type { AuthContext } from "../../http/auth-context.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { findSection } from "../academic/class.service.js";
import { guardianUserIds, notifyUsers } from "../notifications/notification.service.js";
import { getSchoolSettings } from "../settings/settings.service.js";
import type { AttendanceStatus } from "../../generated/prisma/client.js";

/**
 * Daily attendance per section.
 *
 * Who can take or correct attendance for a section on a date:
 *  - admins (permission attendance.proxy.assign): any section, any past date
 *  - the section's class teacher: today, and earlier days within the school's edit window
 *  - a proxy teacher: only the dates they were assigned
 * Nobody can mark future dates. Corrections are written to the audit log.
 */

export interface AttendanceAccess {
  canView: boolean;
  canMark: boolean;
  asProxy: boolean;
  /** Why marking isn't allowed (shown in the app) */
  reason: string | null;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** The academic year a date falls in (or the current one if it's between years). */
export async function yearForDate(schoolId: string, date: string) {
  const day = fromDateString(date);
  const year =
    (await prisma.academicYear.findFirst({ where: { schoolId, startDate: { lte: day }, endDate: { gte: day } } })) ??
    (await prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true } }));
  if (!year) throw badRequest("Set up the academic year first");
  return year;
}

export async function getAccess(auth: AuthContext, schoolId: string, sectionId: string, date: string, dayExists: boolean): Promise<AttendanceAccess> {
  const today = todayInNepal();
  const isManager = auth.permissions.has("attendance.proxy.assign");
  const canMarkPermission = auth.permissions.has("attendance.mark");
  const year = await yearForDate(schoolId, date);

  const [classTeacher, proxyOnDate, proxyNow] = await Promise.all([
    prisma.classTeacherAssignment.findFirst({ where: { academicYearId: year.id, sectionId, teacherId: auth.userId } }),
    activeProxy(sectionId, auth.userId, date),
    activeProxy(sectionId, auth.userId, today),
  ]);

  const canView = isManager || auth.permissions.has("attendance.report") || Boolean(classTeacher) || Boolean(proxyNow) || Boolean(proxyOnDate);
  const deny = (reason: string): AttendanceAccess => ({ canView, canMark: false, asProxy: false, reason });

  if (date > today) return deny("Attendance can't be taken for future dates");
  if (isManager) return { canView, canMark: true, asProxy: false, reason: null };

  if (proxyOnDate && canMarkPermission) return { canView, canMark: true, asProxy: true, reason: null };
  if (proxyNow && !classTeacher) return deny("You're the proxy teacher for other dates — earlier attendance is read-only");

  if (classTeacher && canMarkPermission) {
    if (dayExists && date !== today && !auth.permissions.has("attendance.edit")) return deny("You don't have permission to correct attendance");
    const settings = await getSchoolSettings(schoolId);
    const window = Number(settings["attendance.editWindowDays"] ?? 0);
    if (window > 0 && daysBetween(date, today) > window) return deny(`Attendance older than ${window} days can only be changed by an admin`);
    return { canView, canMark: true, asProxy: false, reason: null };
  }

  return deny("Only the class teacher, an assigned proxy teacher or an admin can take this attendance");
}

function activeProxy(sectionId: string, teacherId: string, date: string) {
  const day = fromDateString(date);
  return prisma.proxyAssignment.findFirst({ where: { sectionId, teacherId, revokedAt: null, startDate: { lte: day }, endDate: { gte: day } } });
}

/** Students enrolled in the section for that academic year, in roll-number order. */
export async function sectionStudents(sectionId: string, academicYearId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { sectionId, academicYearId, status: { notIn: ["LEFT", "TRANSFERRED"] } },
    include: { student: { select: { id: true, firstName: true, middleName: true, lastName: true, photoKey: true, gender: true } } },
    orderBy: [{ rollNo: "asc" }, { student: { firstName: "asc" } }],
  });
  return enrollments.map((e) => ({
    studentId: e.student.id,
    name: [e.student.firstName, e.student.middleName, e.student.lastName].filter(Boolean).join(" "),
    firstName: e.student.firstName,
    rollNo: e.rollNo,
    gender: e.student.gender,
    photoUrl: fileUrl(e.student.photoKey),
  }));
}

// ─── Reading ─────────────────────────────────────────────────

export async function getSectionAttendance(auth: AuthContext, schoolId: string, sectionId: string, date: string) {
  const section = await findSection(schoolId, sectionId);
  const year = await yearForDate(schoolId, date);
  const day = await prisma.attendanceDay.findUnique({
    where: { sectionId_date: { sectionId, date: fromDateString(date) } },
    include: { records: true },
  });

  const access = await getAccess(auth, schoolId, sectionId, date, Boolean(day));
  if (!access.canView) throw forbidden("You can't see this section's attendance");

  const settings = await getSchoolSettings(schoolId);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const takenBy = day ? await prisma.user.findUnique({ where: { id: day.takenById }, select: { fullName: true } }) : null;
  const records = new Map(day?.records.map((r) => [r.studentId, r]) ?? []);
  const students = (await sectionStudents(sectionId, year.id)).map((s) => ({
    ...s,
    status: records.get(s.studentId)?.status ?? null,
    remark: records.get(s.studentId)?.remark ?? null,
  }));

  return {
    section: { id: section.id, name: section.name, className: section.class.name },
    date,
    dateBs: formatBsLong(date),
    isWorkingDay: (settings["academic.workingDays"] as string[]).includes(String(weekday)),
    academicYear: { id: year.id, name: year.name },
    access,
    taken: day && { by: takenBy?.fullName ?? "Unknown", asProxy: day.takenAsProxy, at: day.updatedAt },
    students,
    summary: summarise(students.map((s) => s.status)),
  };
}

function summarise(statuses: (AttendanceStatus | null)[]) {
  return {
    total: statuses.length,
    present: statuses.filter((s) => s === "PRESENT").length,
    absent: statuses.filter((s) => s === "ABSENT").length,
    late: statuses.filter((s) => s === "LATE").length,
    leave: statuses.filter((s) => s === "LEAVE").length,
  };
}

/** Sections the user can take attendance for on a date, with whether it's been taken. */
export async function mySections(auth: AuthContext, schoolId: string, date: string) {
  const year = await yearForDate(schoolId, date);
  const day = fromDateString(date);
  const isManager = auth.permissions.has("attendance.proxy.assign") || auth.permissions.has("attendance.report");

  const [classTeacherOf, proxies] = await Promise.all([
    prisma.classTeacherAssignment.findMany({ where: { academicYearId: year.id, teacherId: auth.userId }, select: { sectionId: true } }),
    prisma.proxyAssignment.findMany({ where: { schoolId, teacherId: auth.userId, revokedAt: null, startDate: { lte: day }, endDate: { gte: day } }, select: { sectionId: true, endDate: true } }),
  ]);
  const roleBySection = new Map<string, "class_teacher" | "proxy" | "admin">();
  classTeacherOf.forEach((c) => roleBySection.set(c.sectionId, "class_teacher"));
  proxies.forEach((p) => roleBySection.set(p.sectionId, "proxy"));

  const sections = await prisma.section.findMany({
    where: { schoolId, ...(isManager ? {} : { id: { in: [...roleBySection.keys()] } }) },
    include: {
      class: true,
      attendanceDays: { where: { date: day }, include: { records: { select: { status: true } } } },
      _count: { select: { enrollments: { where: { academicYearId: year.id, status: { notIn: ["LEFT", "TRANSFERRED"] } } } } },
    },
    orderBy: [{ class: { order: "asc" } }, { name: "asc" }],
  });

  return sections.map((s) => {
    const taken = s.attendanceDays[0];
    return {
      sectionId: s.id,
      label: `${s.class.name} ${s.name}`,
      role: roleBySection.get(s.id) ?? "admin",
      proxyUntil: toDateString(proxies.find((p) => p.sectionId === s.id)?.endDate),
      students: s._count.enrollments,
      taken: Boolean(taken),
      summary: taken ? summarise(taken.records.map((r) => r.status)) : null,
    };
  });
}

// ─── Saving ──────────────────────────────────────────────────

export interface SaveAttendanceInput {
  date: string;
  records: { studentId: string; status: AttendanceStatus; remark?: string | null }[];
}

export async function saveSectionAttendance(auth: AuthContext, actor: Actor, sectionId: string, input: SaveAttendanceInput) {
  await findSection(actor.schoolId, sectionId);
  const year = await yearForDate(actor.schoolId, input.date);
  const date = fromDateString(input.date);
  const existing = await prisma.attendanceDay.findUnique({ where: { sectionId_date: { sectionId, date } }, include: { records: true } });

  const access = await getAccess(auth, actor.schoolId, sectionId, input.date, Boolean(existing));
  if (!access.canMark) throw forbidden(access.reason ?? "You can't take this attendance");

  const enrolled = new Set((await sectionStudents(sectionId, year.id)).map((s) => s.studentId));
  const unknown = input.records.filter((r) => !enrolled.has(r.studentId));
  if (unknown.length) throw badRequest("Some students are not in this section");

  const before = new Map(existing?.records.map((r) => [r.studentId, r.status]) ?? []);
  const changes = input.records.filter((r) => before.get(r.studentId) !== r.status);

  await prisma.$transaction(async (tx) => {
    const day =
      existing ??
      (await tx.attendanceDay.create({
        data: { schoolId: actor.schoolId, academicYearId: year.id, sectionId, date, takenById: actor.userId, takenAsProxy: access.asProxy },
      }));
    if (existing) await tx.attendanceDay.update({ where: { id: day.id }, data: { updatedAt: new Date() } });

    for (const record of input.records) {
      await tx.attendanceRecord.upsert({
        where: { dayId_studentId: { dayId: day.id, studentId: record.studentId } },
        create: { schoolId: actor.schoolId, dayId: day.id, studentId: record.studentId, status: record.status, remark: record.remark ?? null, updatedById: actor.userId },
        update: { status: record.status, remark: record.remark ?? null, updatedById: actor.userId },
      });
    }

    await recordAudit(
      actor,
      existing
        ? {
            action: "attendance.edit",
            entityType: "AttendanceDay",
            entityId: day.id,
            oldValue: Object.fromEntries(changes.map((c) => [c.studentId, before.get(c.studentId) ?? null])),
            newValue: { date: input.date, sectionId, asProxy: access.asProxy, changes: Object.fromEntries(changes.map((c) => [c.studentId, c.status])) },
          }
        : { action: "attendance.take", entityType: "AttendanceDay", entityId: day.id, newValue: { date: input.date, sectionId, asProxy: access.asProxy, ...summarise(input.records.map((r) => r.status)) } },
      tx,
    );
  });

  await notifyNewAbsences(actor.schoolId, input.date, changes.filter((c) => c.status === "ABSENT").map((c) => c.studentId));
  return getSectionAttendance(auth, actor.schoolId, sectionId, input.date);
}

/** Tells parents their child was marked absent — only for today's attendance, and only once per change. */
async function notifyNewAbsences(schoolId: string, date: string, studentIds: string[]) {
  if (!studentIds.length || date !== todayInNepal()) return;
  const settings = await getSchoolSettings(schoolId);
  if (!settings["attendance.notifyParentsOnAbsence"]) return;

  const [students, parents] = await Promise.all([
    prisma.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, firstName: true } }),
    guardianUserIds(studentIds),
  ]);
  for (const student of students) {
    await notifyUsers(schoolId, parents.get(student.id) ?? [], {
      type: "attendance.absent",
      title: `${student.firstName} is absent today`,
      body: `${student.firstName} was marked absent on ${formatBsLong(date)}. If this is a mistake, please contact the class teacher.`,
      data: { studentId: student.id, date },
    });
  }
}
