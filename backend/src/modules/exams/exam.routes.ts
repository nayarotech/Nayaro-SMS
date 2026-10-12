import type { Response } from "express";
import { z } from "zod";
import { defineModule, route } from "../../http/route.js";
import { dateString, idParam } from "../../http/schemas.js";
import * as exams from "./exam.service.js";
import * as marks from "./marks.service.js";
import * as results from "./results.service.js";

const MODULE = "exams";
const sheetParams = z.object({ id: z.uuid(), sectionId: z.uuid(), subjectId: z.uuid() });
const classParams = z.object({ id: z.uuid(), classId: z.uuid() });
const resultQuery = z.object({ classId: z.uuid(), sectionId: z.uuid().optional(), studentId: z.uuid().optional() });

function sendFile(res: Response, buffer: Buffer, filename: string, contentType: string, inline = false) {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${filename}"`);
  res.send(buffer);
}

const examBody = z.object({
  name: z.string().trim().min(2).max(80),
  order: z.number().int().min(1).optional(),
  startDate: dateString.nullable().optional(),
  endDate: dateString.nullable().optional(),
  academicYearId: z.uuid().optional(),
});

const gradeBand = z.object({ min: z.number().min(0).max(100), grade: z.string().trim().min(1).max(5), gradePoint: z.number().min(0).max(10), remark: z.string().max(40) });

export const examsModule = defineModule("/exams", "Exams & marks", [
  // Grading scale (declared before /:id so the path isn't read as an exam id)
  route({
    method: "get",
    path: "/grading-scale",
    summary: "The school's grading scale (NEB letter grades by default)",
    permission: ["exam.manage", "marks.enter", "marks.verify"],
    module: MODULE,
    handler: ({ schoolId }) => exams.getGradingScale(schoolId),
  }),
  route({
    method: "put",
    path: "/grading-scale",
    summary: "Change the grading scale",
    permission: "exam.manage",
    module: MODULE,
    body: z.object({ bands: z.array(gradeBand).min(2).max(15) }),
    handler: ({ actor, body }) => exams.setGradingScale(actor, body.bands),
  }),

  route({
    method: "get",
    path: "/my-sheets",
    summary: "My mark sheets in every exam this year, newest exam first (teacher app)",
    permission: "marks.enter",
    module: MODULE,
    handler: ({ auth, schoolId }) => marks.myMarkSheets(auth, schoolId),
  }),

  route({
    method: "get",
    path: "/",
    summary: "Exams in an academic year (current by default) with mark-entry progress",
    permission: ["exam.manage", "marks.enter", "marks.verify", "marks.publish", "reportcard.generate"],
    module: MODULE,
    query: z.object({ academicYearId: z.uuid().optional() }),
    handler: ({ schoolId, query }) => exams.listExams(schoolId, query.academicYearId),
  }),
  route({
    method: "post",
    path: "/",
    summary: "Create an exam",
    permission: "exam.manage",
    module: MODULE,
    status: 201,
    body: examBody,
    handler: ({ actor, body }) => exams.createExam(actor, body),
  }),
  route({
    method: "patch",
    path: "/:id",
    summary: "Rename an exam or change its dates",
    permission: "exam.manage",
    module: MODULE,
    params: idParam,
    body: examBody.partial(),
    handler: ({ actor, params, body }) => exams.updateExam(actor, params.id, body),
  }),
  route({
    method: "delete",
    path: "/:id",
    summary: "Delete an exam that has no marks",
    permission: "exam.manage",
    module: MODULE,
    params: idParam,
    handler: ({ actor, params }) => exams.deleteExam(actor, params.id),
  }),

  route({
    method: "get",
    path: "/:id/classes/:classId/subjects",
    summary: "Subjects, full marks and pass marks for one class in this exam",
    permission: ["exam.manage", "marks.verify"],
    module: MODULE,
    params: classParams,
    handler: ({ schoolId, params }) => exams.getClassSubjects(schoolId, params.id, params.classId),
  }),
  route({
    method: "put",
    path: "/:id/classes/:classId/subjects",
    summary: "Set the subjects and marks for one class in this exam",
    permission: "exam.manage",
    module: MODULE,
    params: classParams,
    body: z.object({
      subjects: z.array(
        z.object({
          subjectId: z.uuid(),
          theoryFullMarks: z.number().positive().max(1000),
          theoryPassMarks: z.number().min(0).max(1000),
          practicalFullMarks: z.number().min(0).max(1000).default(0),
          practicalPassMarks: z.number().min(0).max(1000).default(0),
          creditHours: z.number().positive().max(20).default(4),
          examDate: dateString.nullable().optional(),
        }),
      ),
    }),
    handler: ({ actor, params, body }) => exams.setClassSubjects(actor, params.id, params.classId, body.subjects),
  }),

  route({
    method: "post",
    path: "/:id/classes/:classId/copy",
    summary: "Copy this class's subjects and marks to other classes in the same exam",
    description: "Only subjects each class studies are copied. Existing settings for those subjects are overwritten; nothing is removed.",
    permission: "exam.manage",
    module: MODULE,
    params: classParams,
    body: z.object({ toClassIds: z.array(z.uuid()).min(1).max(50) }),
    handler: ({ actor, params, body }) => exams.copyClassSetup(actor, params.id, params.classId, body.toClassIds),
  }),
  route({
    method: "post",
    path: "/:id/copy-from",
    summary: "Copy every class's subjects and marks from another exam",
    permission: "exam.manage",
    module: MODULE,
    params: idParam,
    body: z.object({ fromExamId: z.uuid() }),
    handler: ({ actor, params, body }) => exams.copyExamSetup(actor, params.id, body.fromExamId),
  }),

  // ─── Mark sheets ───────────────────────────────────────────

  route({
    method: "get",
    path: "/:id/sheets",
    summary: "Mark sheets (subject × section) with status — teachers see only their own",
    permission: ["marks.enter", "exam.manage", "marks.verify", "marks.publish"],
    module: MODULE,
    params: idParam,
    query: z.object({ classId: z.uuid().optional() }),
    handler: ({ auth, schoolId, params, query }) => marks.listSheets(auth, schoolId, params.id, query.classId),
  }),
  route({
    method: "get",
    path: "/:id/sheets/:sectionId/:subjectId",
    summary: "One mark sheet with students, marks and what the user may do",
    permission: ["marks.enter", "exam.manage", "marks.verify", "marks.publish", "attendance.mark"],
    module: MODULE,
    params: sheetParams,
    handler: ({ auth, schoolId, params }) => marks.getSheet(auth, schoolId, params.id, params.sectionId, params.subjectId),
  }),
  route({
    method: "put",
    path: "/:id/sheets/:sectionId/:subjectId",
    summary: "Save marks (some or all students). Validated against full marks; audit-logged.",
    permission: ["marks.enter", "exam.manage", "marks.verify", "marks.edit_published"],
    module: MODULE,
    params: sheetParams,
    body: z.object({
      marks: z
        .array(z.object({ studentId: z.uuid(), theory: z.number().nullable(), practical: z.number().nullable(), status: z.enum(["PRESENT", "ABSENT", "MEDICAL"]) }))
        .min(1)
        .max(200),
    }),
    handler: ({ auth, actor, params, body }) => marks.saveMarks(auth, actor, params.id, params.sectionId, params.subjectId, body.marks),
  }),
  route({
    method: "post",
    path: "/:id/sheets/:sectionId/:subjectId/submit",
    summary: "Submit marks for checking",
    permission: ["marks.enter", "exam.manage"],
    module: MODULE,
    params: sheetParams,
    handler: ({ auth, actor, params }) => marks.submitSheet(auth, actor, params.id, params.sectionId, params.subjectId),
  }),
  route({
    method: "post",
    path: "/:id/sheets/:sectionId/:subjectId/verify",
    summary: "Verify submitted marks",
    permission: "marks.verify",
    module: MODULE,
    params: sheetParams,
    handler: ({ auth, actor, params }) => marks.verifySheet(auth, actor, params.id, params.sectionId, params.subjectId),
  }),
  route({
    method: "post",
    path: "/:id/verify-all",
    summary: "Verify every submitted mark sheet in this exam (or one class)",
    permission: "marks.verify",
    module: MODULE,
    params: idParam,
    body: z.object({ classId: z.uuid().optional() }),
    handler: ({ auth, actor, params, body }) => marks.verifyAll(auth, actor, params.id, body.classId),
  }),
  route({
    method: "post",
    path: "/:id/sheets/:sectionId/:subjectId/return",
    summary: "Send marks back to the teacher with a note",
    permission: "marks.verify",
    module: MODULE,
    params: sheetParams,
    body: z.object({ note: z.string().trim().min(3).max(500) }),
    handler: ({ auth, actor, params, body }) => marks.returnSheet(auth, actor, params.id, params.sectionId, params.subjectId, body.note),
  }),
  route({
    method: "post",
    path: "/:id/classes/:classId/publish",
    summary: "Publish results for a class (all its marks must be verified). Parents are notified.",
    permission: "marks.publish",
    module: MODULE,
    params: classParams,
    handler: ({ actor, params }) => marks.publishClassResults(actor, params.id, params.classId),
  }),

  // ─── Results ───────────────────────────────────────────────

  route({
    method: "get",
    path: "/:id/results",
    summary: "Results for a class or section: marks, GPA, grade, result and ranks",
    permission: ["exam.manage", "marks.verify", "marks.publish", "reportcard.generate", "attendance.mark", "student.record.view"],
    module: MODULE,
    params: idParam,
    query: resultQuery,
    handler: async ({ auth, schoolId, params, query }) => {
      const exam = await exams.findExam(schoolId, params.id);
      await results.assertCanViewResults(auth, exam.academicYearId, query.classId, query.sectionId);
      const data = await results.computeResults(schoolId, params.id, query.classId, { sectionId: query.sectionId, studentIds: query.studentId ? [query.studentId] : undefined });
      return { ...data, published: await results.isPublished(params.id, query.classId) };
    },
  }),
  route({
    method: "get",
    path: "/:id/results/export",
    summary: "Download the marks ledger (Excel or PDF)",
    permission: ["exam.manage", "marks.verify", "marks.publish", "reportcard.generate", "attendance.mark"],
    module: MODULE,
    params: idParam,
    query: resultQuery.extend({ format: z.enum(["xlsx", "pdf"]) }),
    handler: async ({ auth, schoolId, params, query, res }) => {
      const exam = await exams.findExam(schoolId, params.id);
      await results.assertCanViewResults(auth, exam.academicYearId, query.classId, query.sectionId);
      const data = await results.computeResults(schoolId, params.id, query.classId, { sectionId: query.sectionId });
      const name = `ledger-${data.exam.name}-${data.class.name}`.replace(/\s+/g, "-").toLowerCase();
      if (query.format === "xlsx") sendFile(res, await results.ledgerXlsx(data), `${name}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      else sendFile(res, await results.ledgerPdf(schoolId, data), `${name}.pdf`, "application/pdf");
    },
  }),
  route({
    method: "get",
    path: "/:id/report-cards",
    summary: "Report cards as one PDF (a section, or one student)",
    permission: ["reportcard.generate", "exam.manage", "attendance.mark"],
    module: MODULE,
    params: idParam,
    query: resultQuery,
    handler: async ({ auth, schoolId, params, query, res }) => {
      const exam = await exams.findExam(schoolId, params.id);
      await results.assertCanViewResults(auth, exam.academicYearId, query.classId, query.sectionId);
      const data = await results.computeResults(schoolId, params.id, query.classId, { sectionId: query.sectionId, studentIds: query.studentId ? [query.studentId] : undefined });
      sendFile(res, await results.reportCardsPdf(schoolId, data), `report-cards-${data.exam.name}-${data.class.name}.pdf`.replace(/\s+/g, "-").toLowerCase(), "application/pdf", true);
    },
  }),
  route({
    method: "put",
    path: "/:id/remarks",
    summary: "Class teacher's remark for a student's report card",
    permission: ["attendance.mark", "exam.manage"],
    module: MODULE,
    params: idParam,
    body: z.object({ studentId: z.uuid(), remark: z.string().trim().max(500) }),
    handler: ({ auth, actor, params, body }) => results.setRemark(auth, actor, params.id, body.studentId, body.remark),
  }),
]);
