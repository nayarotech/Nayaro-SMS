import type { Response } from "express";
import { z } from "zod";
import { todayInNepal } from "../../lib/nepali-date.js";
import { defineModule, route } from "../../http/route.js";
import { dateString, idParam } from "../../http/schemas.js";
import * as reports from "./attendance-reports.service.js";
import * as attendance from "./attendance.service.js";
import * as proxies from "./proxy.service.js";

const MODULE = "attendance";
const dateQuery = z.object({ date: dateString.default(() => todayInNepal()) });
const monthQuery = z.object({ sectionId: z.uuid(), bsYear: z.coerce.number().int().min(2070).max(2100), bsMonth: z.coerce.number().int().min(1).max(12) });

function sendFile(res: Response, buffer: Buffer, filename: string, contentType: string) {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
}

export const attendanceModule = defineModule("/attendance", "Attendance", [
  route({
    method: "get",
    path: "/my-sections",
    summary: "Sections I can take attendance for on a date (class teacher, proxy, or all for admins)",
    permission: ["attendance.mark", "attendance.view", "attendance.report", "attendance.proxy.assign"],
    module: MODULE,
    query: dateQuery,
    handler: ({ auth, schoolId, query }) => attendance.mySections(auth, schoolId, query.date),
  }),

  route({
    method: "get",
    path: "/sections/:id",
    summary: "A section's attendance on a date, with what the user is allowed to do",
    permission: ["attendance.mark", "attendance.view", "attendance.report", "attendance.proxy.assign"],
    module: MODULE,
    params: idParam,
    query: dateQuery,
    handler: ({ auth, schoolId, params, query }) => attendance.getSectionAttendance(auth, schoolId, params.id, query.date),
  }),

  route({
    method: "put",
    path: "/sections/:id",
    summary: "Take or correct a section's attendance for a date",
    description: "Class teachers: today and within the edit window. Proxies: their assigned dates. Admins: any past date. Changes are audit-logged.",
    permission: ["attendance.mark", "attendance.proxy.assign"],
    module: MODULE,
    params: idParam,
    body: z.object({
      date: dateString,
      records: z
        .array(z.object({ studentId: z.uuid(), status: z.enum(["PRESENT", "ABSENT", "LATE", "LEAVE"]), remark: z.string().max(200).nullable().optional() }))
        .min(1),
    }),
    handler: ({ auth, actor, params, body }) => attendance.saveSectionAttendance(auth, actor, params.id, body),
  }),

  // ─── Proxy teachers ────────────────────────────────────────

  route({
    method: "get",
    path: "/proxies",
    summary: "Proxy teacher assignments",
    permission: "attendance.proxy.assign",
    module: MODULE,
    query: z.object({ filter: z.enum(["active", "upcoming", "past", "all"]).default("all") }),
    handler: ({ schoolId, query }) => proxies.listProxies(schoolId, query.filter),
  }),

  route({
    method: "post",
    path: "/proxies",
    summary: "Let a teacher take a section's attendance on certain dates",
    permission: "attendance.proxy.assign",
    module: MODULE,
    status: 201,
    body: z.object({ sectionId: z.uuid(), teacherId: z.uuid(), startDate: dateString, endDate: dateString, reason: z.string().max(200).nullable().optional() }),
    handler: ({ actor, body }) => proxies.assignProxy(actor, body),
  }),

  route({
    method: "delete",
    path: "/proxies/:id",
    summary: "End a proxy assignment early",
    permission: "attendance.proxy.assign",
    module: MODULE,
    params: idParam,
    handler: ({ actor, params }) => proxies.revokeProxy(actor, params.id),
  }),

  // ─── Reports ───────────────────────────────────────────────

  route({
    method: "get",
    path: "/reports/daily",
    summary: "Whole-school attendance for a day: which sections took it, and the numbers",
    permission: ["attendance.report", "attendance.proxy.assign"],
    module: MODULE,
    query: dateQuery,
    handler: ({ schoolId, query }) => reports.dailyOverview(schoolId, query.date),
  }),

  route({
    method: "get",
    path: "/reports/monthly",
    summary: "Monthly register for a section (BS month)",
    permission: ["attendance.view", "attendance.report", "attendance.mark"],
    module: MODULE,
    query: monthQuery,
    handler: ({ auth, schoolId, query }) => reports.monthlyRegister(auth, schoolId, query.sectionId, query.bsYear, query.bsMonth),
  }),

  route({
    method: "get",
    path: "/reports/monthly/export",
    summary: "Download the monthly register as Excel or PDF",
    permission: ["attendance.view", "attendance.report", "attendance.mark"],
    module: MODULE,
    query: monthQuery.extend({ format: z.enum(["xlsx", "pdf"]) }),
    handler: async ({ auth, schoolId, query, res }) => {
      const register = await reports.monthlyRegister(auth, schoolId, query.sectionId, query.bsYear, query.bsMonth);
      const name = `attendance-${register.section.label}-${register.month.name}`.replace(/\s+/g, "-").toLowerCase();
      if (query.format === "xlsx") {
        sendFile(res, await reports.monthlyRegisterXlsx(register), `${name}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      } else {
        sendFile(res, await reports.monthlyRegisterPdf(schoolId, register), `${name}.pdf`, "application/pdf");
      }
    },
  }),

  route({
    method: "get",
    path: "/reports/students/:id",
    summary: "One student's attendance for a year, by month, with absences",
    permission: ["attendance.view", "attendance.report", "student.record.view"],
    module: MODULE,
    params: idParam,
    query: z.object({ academicYearId: z.uuid().optional() }),
    handler: ({ schoolId, params, query }) => reports.studentAttendance(schoolId, params.id, query.academicYearId),
  }),
]);
