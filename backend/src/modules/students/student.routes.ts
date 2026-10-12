import { z } from "zod";
import { defineModule, route } from "../../http/route.js";
import { dateString, idParam, optionalText, pagination, phoneNumber } from "../../http/schemas.js";
import * as guardianService from "../guardians/guardian.service.js";
import { studentAttendance } from "../attendance/attendance-reports.service.js";
import { publishedResultDetail, publishedResultsForStudent, reportCardsPdf } from "../exams/results.service.js";
import * as recordService from "./student-record.service.js";
import * as studentService from "./student.service.js";

const gender = z.enum(["MALE", "FEMALE", "OTHER"]);
const relation = z.enum(["FATHER", "MOTHER", "GUARDIAN", "GRANDPARENT", "SIBLING", "OTHER"]);

const studentDetails = z.object({
  firstName: z.string().trim().min(1).max(60),
  middleName: optionalText,
  lastName: z.string().trim().min(1).max(60),
  gender,
  dateOfBirth: dateString,
  bloodGroup: optionalText,
  religion: optionalText,
  nationality: optionalText,
  address: optionalText,
  temporaryAddress: optionalText,
  phone: optionalText,
  email: z.union([z.email(), z.literal("")]).optional().nullable(),
  photoKey: z.string().nullable().optional(),
  admissionDate: dateString,
  previousSchool: optionalText,
  medicalNotes: optionalText,
});

export const guardianDetails = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.union([phoneNumber, z.literal("")]).optional().nullable(),
  email: z.union([z.email(), z.literal("")]).optional().nullable(),
  occupation: optionalText,
  address: optionalText,
  alternatePhone: optionalText,
  whatsappOptIn: z.boolean().optional(),
  password: z.string().max(128).nullable().optional(),
});

const guardianLink = z
  .object({
    guardianId: z.uuid().optional(),
    guardian: guardianDetails.optional(),
    relation,
    isPrimary: z.boolean().optional(),
  })
  .refine((g) => g.guardianId || g.guardian, "Choose an existing guardian or enter details");

const studentParams = z.object({ id: z.uuid() });
const noteParams = z.object({ id: z.uuid(), noteId: z.uuid() });
const noteCategory = z.enum(["ACHIEVEMENT", "DISCIPLINE", "COUNSELLING", "HEALTH", "GENERAL"]);
const noteBody = z.object({
  category: noteCategory,
  title: z.string().trim().min(2).max(150),
  body: optionalText.pipe(z.string().max(5000).nullable()),
  date: dateString,
  sharedWithParents: z.boolean().optional(),
});
const guardianParams = z.object({ id: z.uuid(), guardianId: z.uuid() });

export const studentsModule = defineModule("/students", "Students", [
  route({
    method: "get",
    path: "/",
    summary: "List students (current year's class/section by default)",
    permission: "student.view",
    query: pagination.extend({
      search: z.string().optional(),
      classId: z.uuid().optional(),
      sectionId: z.uuid().optional(),
      status: z.enum(["ACTIVE", "LEFT", "TRANSFERRED", "GRADUATED"]).optional(),
      academicYearId: z.uuid().optional(),
    }),
    handler: ({ schoolId, query }) => studentService.listStudents(schoolId, query),
  }),

  route({
    method: "post",
    path: "/",
    summary: "Admit a student with guardians, class/section and documents",
    description:
      "Guardians are matched by phone number, so siblings share the same parent account. A guardian who is already a staff member gets the Parent role added.",
    permission: "student.create",
    status: 201,
    body: studentDetails.extend({
      admissionNo: optionalText,
      enrollment: z.object({ academicYearId: z.uuid().optional(), sectionId: z.uuid(), rollNo: z.number().int().positive().nullable().optional() }),
      guardians: z.array(guardianLink).min(1).max(4),
      documents: z.array(z.object({ title: z.string().trim().min(1).max(100), fileKey: z.string() })).optional(),
    }),
    handler: async ({ actor, auth, body }) => studentService.getStudent(actor.schoolId, (await studentService.admitStudent(actor, body)).id, auth),
  }),

  route({
    method: "get",
    path: "/:id",
    summary: "Student profile (history and documents need student.record.view)",
    permission: "student.view",
    params: idParam,
    handler: ({ schoolId, params, auth }) => studentService.getStudent(schoolId, params.id, auth),
  }),

  route({
    method: "patch",
    path: "/:id",
    summary: "Edit student details or status",
    permission: "student.edit",
    params: idParam,
    body: studentDetails.partial().extend({ status: z.enum(["ACTIVE", "LEFT", "TRANSFERRED", "GRADUATED"]).optional() }),
    handler: async ({ actor, auth, params, body }) => {
      await studentService.updateStudent(actor, params.id, body);
      return studentService.getStudent(actor.schoolId, params.id, auth);
    },
  }),

  route({
    method: "patch",
    path: "/:id/enrollment",
    summary: "Change section (same class) or roll number for the current year",
    permission: "student.edit",
    params: idParam,
    body: z.object({ sectionId: z.uuid().optional(), rollNo: z.number().int().positive().nullable().optional() }),
    handler: async ({ actor, auth, params, body }) => {
      await studentService.updateCurrentEnrollment(actor, params.id, body);
      return studentService.getStudent(actor.schoolId, params.id, auth);
    },
  }),

  route({
    method: "post",
    path: "/:id/guardians",
    summary: "Link a guardian (existing or new) to a student",
    permission: "guardian.manage",
    params: studentParams,
    body: guardianLink,
    handler: async ({ actor, auth, params, body }) => {
      await studentService.addGuardian(actor, params.id, body);
      return studentService.getStudent(actor.schoolId, params.id, auth);
    },
  }),

  route({
    method: "patch",
    path: "/:id/guardians/:guardianId",
    summary: "Change relation or primary guardian",
    permission: "guardian.manage",
    params: guardianParams,
    body: z.object({ relation, isPrimary: z.boolean() }).partial(),
    handler: async ({ actor, auth, params, body }) => {
      await studentService.updateGuardianLink(actor, params.id, params.guardianId, body);
      return studentService.getStudent(actor.schoolId, params.id, auth);
    },
  }),

  route({
    method: "delete",
    path: "/:id/guardians/:guardianId",
    summary: "Unlink a guardian from a student",
    permission: "guardian.manage",
    params: guardianParams,
    handler: async ({ actor, auth, params }) => {
      await studentService.removeGuardian(actor, params.id, params.guardianId);
      return studentService.getStudent(actor.schoolId, params.id, auth);
    },
  }),

  route({
    method: "post",
    path: "/:id/documents",
    summary: "Attach an uploaded document to a student",
    permission: "student.documents.manage",
    params: idParam,
    body: z.object({ title: z.string().trim().min(1).max(100), fileKey: z.string() }),
    handler: async ({ actor, auth, params, body }) => {
      await studentService.addDocument(actor, params.id, body);
      return studentService.getStudent(actor.schoolId, params.id, auth);
    },
  }),

  route({
    method: "delete",
    path: "/:id/documents/:documentId",
    summary: "Remove a student document",
    permission: "student.documents.manage",
    params: z.object({ id: z.uuid(), documentId: z.uuid() }),
    handler: async ({ actor, auth, params }) => {
      await studentService.removeDocument(actor, params.id, params.documentId);
      return studentService.getStudent(actor.schoolId, params.id, auth);
    },
  }),

  route({
    method: "get",
    path: "/:id/record",
    summary: "360° record: every year's class, attendance and exam results, promotions and note counts",
    description: "Needs student.record.view, or being the student's class teacher this year.",
    permission: "student.view",
    params: idParam,
    handler: ({ auth, schoolId, params }) => recordService.studentRecord(auth, schoolId, params.id),
  }),
  route({
    method: "get",
    path: "/:id/notes",
    summary: "Notes about a student (achievements, discipline, counselling, health)",
    permission: "student.view",
    params: idParam,
    query: z.object({ category: noteCategory.optional() }),
    handler: ({ auth, schoolId, params, query }) => recordService.listNotes(auth, schoolId, params.id, query.category),
  }),
  route({
    method: "post",
    path: "/:id/notes",
    summary: "Add a note (class teacher of the student, or student.notes.manage). Shared notes notify parents.",
    permission: "student.view",
    status: 201,
    params: idParam,
    body: noteBody,
    handler: ({ auth, actor, params, body }) => recordService.createNote(auth, actor, params.id, body),
  }),
  route({
    method: "patch",
    path: "/:id/notes/:noteId",
    summary: "Edit a note (its author, or student.notes.manage)",
    permission: "student.view",
    params: noteParams,
    body: noteBody.partial(),
    handler: ({ auth, actor, params, body }) => recordService.updateNote(auth, actor, params.id, params.noteId, body),
  }),
  route({
    method: "delete",
    path: "/:id/notes/:noteId",
    summary: "Delete a note (its author, or student.notes.manage)",
    permission: "student.view",
    params: noteParams,
    handler: ({ auth, actor, params }) => recordService.deleteNote(auth, actor, params.id, params.noteId),
  }),

  route({
    method: "get",
    path: "/:id/export",
    summary: "Export everything stored about a student (data request)",
    permission: "student.record.view",
    params: idParam,
    handler: ({ actor, params }) => studentService.exportStudentData(actor, params.id),
  }),

  route({
    method: "delete",
    path: "/:id",
    summary: "Permanently delete a student's data (data deletion request)",
    permission: "student.delete",
    params: idParam,
    handler: ({ actor, params }) => studentService.deleteStudent(actor, params.id),
  }),
]);

export const guardiansModule = defineModule("/guardians", "Parents & guardians", [
  route({
    method: "get",
    path: "/",
    summary: "List guardians with their children",
    permission: "guardian.view",
    query: pagination.extend({ search: z.string().optional() }),
    handler: ({ schoolId, query }) => guardianService.listGuardians(schoolId, query),
  }),
  route({
    method: "get",
    path: "/:id",
    summary: "Get a guardian",
    permission: "guardian.view",
    params: idParam,
    handler: ({ schoolId, params }) => guardianService.getGuardian(schoolId, params.id),
  }),
  route({
    method: "patch",
    path: "/:id",
    summary: "Edit a guardian, including WhatsApp opt-in/opt-out",
    permission: "guardian.manage",
    params: idParam,
    body: guardianDetails.omit({ password: true }).partial(),
    handler: ({ actor, params, body }) => guardianService.updateGuardian(actor, params.id, body),
  }),
  route({
    method: "put",
    path: "/:id/password",
    summary: "Set or reset a parent's app password (signs them out of other devices)",
    permission: "guardian.manage",
    params: idParam,
    body: z.object({ password: z.string().min(6).max(128) }),
    handler: ({ actor, params, body }) => guardianService.setGuardianPassword(actor, params.id, body.password),
  }),
]);

/** Endpoints for the logged-in parent (mobile app). */
/** Parents can only open their own children. */
async function ownChild(auth: { userId: string }, studentId: string) {
  await guardianService.assertIsGuardianOf(auth.userId, studentId);
}

export const myModule = defineModule("/my", "Parent app", [
  route({
    method: "get",
    path: "/children",
    summary: "The logged-in parent's children (for the child switcher)",
    handler: ({ auth }) => guardianService.getMyChildren(auth.userId),
  }),
  route({
    method: "get",
    path: "/children/:id",
    summary: "Profile of one of the logged-in parent's children",
    description: "Access is by guardian link, not by permission: parents only ever see their own children.",
    params: idParam,
    handler: async ({ auth, schoolId, params }) => {
      await guardianService.assertIsGuardianOf(auth.userId, params.id);
      const { history, documents: _documents, canSeeFullRecord: _full, access: _access, ...profile } = await studentService.getStudent(schoolId, params.id);
      return { ...profile, history: history?.map(({ remarks: _remarks, ...h }) => h) ?? [] };
    },
  }),
  route({
    method: "get",
    path: "/children/:id/attendance",
    summary: "A child's attendance this year: totals, by month and absent days",
    params: idParam,
    handler: async ({ auth, schoolId, params }) => {
      await ownChild(auth, params.id);
      return studentAttendance(schoolId, params.id);
    },
  }),
  route({
    method: "get",
    path: "/children/:id/notes",
    summary: "Notes the school shared about a child (achievements, discipline…)",
    params: idParam,
    handler: async ({ auth, schoolId, params }) => {
      await ownChild(auth, params.id);
      return recordService.sharedNotes(schoolId, params.id);
    },
  }),
  route({
    method: "get",
    path: "/children/:id/results",
    summary: "A child's published exam results",
    params: idParam,
    handler: async ({ auth, schoolId, params }) => {
      await ownChild(auth, params.id);
      return publishedResultsForStudent(schoolId, params.id);
    },
  }),
  route({
    method: "get",
    path: "/children/:id/results/:examId",
    summary: "A child's full result for one published exam",
    params: z.object({ id: z.uuid(), examId: z.uuid() }),
    handler: async ({ auth, schoolId, params }) => {
      await ownChild(auth, params.id);
      const data = await publishedResultDetail(schoolId, params.id, params.examId);
      return { exam: data.exam, subjects: data.subjects, student: data.students[0], bands: data.bands };
    },
  }),
  route({
    method: "get",
    path: "/children/:id/results/:examId/report-card",
    summary: "A child's report card PDF for a published exam",
    params: z.object({ id: z.uuid(), examId: z.uuid() }),
    handler: async ({ auth, schoolId, params, res }) => {
      await ownChild(auth, params.id);
      const data = await publishedResultDetail(schoolId, params.id, params.examId);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="report-card.pdf"`);
      res.send(await reportCardsPdf(schoolId, data));
    },
  }),
]);
