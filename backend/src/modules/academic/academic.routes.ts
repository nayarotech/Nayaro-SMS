import { z } from "zod";
import { defineModule, route } from "../../http/route.js";
import { dateString, idParam, optionalText } from "../../http/schemas.js";
import * as years from "./academic-year.service.js";
import * as assignments from "./assignment.service.js";
import * as choices from "./subject-choices.service.js";
import * as classes from "./class.service.js";
import * as subjects from "./subject.service.js";
import * as timetable from "./timetable.service.js";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm (24-hour)");
const yearQuery = z.object({ academicYearId: z.uuid().optional() });

export const academicYearsModule = defineModule("/academic-years", "Academic setup", [
  route({
    method: "get",
    path: "/",
    summary: "List academic years",
    permission: "academic.view",
    handler: ({ schoolId }) => years.listAcademicYears(schoolId),
  }),
  route({
    method: "post",
    path: "/",
    summary: "Create an academic year (the first one becomes current)",
    permission: "academic.manage",
    status: 201,
    body: z.object({ name: z.string().trim().min(2).max(30), startDate: dateString, endDate: dateString, isCurrent: z.boolean().optional() }),
    handler: ({ actor, body }) => years.createAcademicYear(actor, body),
  }),
  route({
    method: "patch",
    path: "/:id",
    summary: "Edit an academic year or make it the current one",
    permission: "academic.manage",
    params: idParam,
    body: z.object({ name: z.string().trim().min(2).max(30), startDate: dateString, endDate: dateString, isCurrent: z.boolean() }).partial(),
    handler: ({ actor, params, body }) => years.updateAcademicYear(actor, params.id, body),
  }),
  route({
    method: "delete",
    path: "/:id",
    summary: "Delete an academic year with no enrollments",
    permission: "academic.manage",
    params: idParam,
    handler: ({ actor, params }) => years.deleteAcademicYear(actor, params.id),
  }),
]);

const sectionBody = z.object({
  name: z.string().trim().min(1).max(20),
  capacity: z.number().int().positive().nullable().optional(),
  room: optionalText,
});

export const classesModule = defineModule("/classes", "Academic setup", [
  route({
    method: "get",
    path: "/",
    summary: "Classes with sections, class teachers, student counts and subjects",
    permission: "academic.view",
    handler: ({ schoolId }) => classes.listClasses(schoolId),
  }),
  route({
    method: "post",
    path: "/",
    summary: "Create a class (optionally with sections)",
    permission: "academic.manage",
    status: 201,
    body: z.object({ name: z.string().trim().min(1).max(40), order: z.number().int(), sections: z.array(z.string()).optional() }),
    handler: ({ actor, body }) => classes.createClass(actor, body),
  }),
  route({
    method: "patch",
    path: "/:id",
    summary: "Rename or reorder a class",
    permission: "academic.manage",
    params: idParam,
    body: z.object({ name: z.string().trim().min(1).max(40), order: z.number().int() }).partial(),
    handler: ({ actor, params, body }) => classes.updateClass(actor, params.id, body),
  }),
  route({
    method: "delete",
    path: "/:id",
    summary: "Delete a class with no students",
    permission: "academic.manage",
    params: idParam,
    handler: ({ actor, params }) => classes.deleteClass(actor, params.id),
  }),
  route({
    method: "put",
    path: "/:id/subjects",
    summary: "Set the subjects a class studies",
    permission: "academic.manage",
    params: idParam,
    body: z.object({
      subjects: z.array(z.object({ subjectId: z.uuid(), isOptional: z.boolean().default(false), optionGroup: z.string().trim().max(40).nullable().optional() })),
    }),
    handler: ({ actor, params, body }) => classes.setClassSubjects(actor, params.id, body.subjects),
  }),
  route({
    method: "get",
    path: "/:id/subject-choices",
    summary: "Students of a class with their optional subject choice in each group",
    permission: ["student.view", "academic.view"],
    params: idParam,
    query: z.object({ academicYearId: z.uuid().optional(), sectionId: z.uuid().optional() }),
    handler: ({ schoolId, params, query }) => choices.getSubjectChoices(schoolId, params.id, query),
  }),
  route({
    method: "put",
    path: "/:id/subject-choices",
    summary: "Set students' optional subjects (one per group). Refused if marks exist in a subject a student would leave.",
    permission: "student.edit",
    params: idParam,
    body: z.object({
      academicYearId: z.uuid().optional(),
      choices: z.array(z.object({ studentId: z.uuid(), group: z.string().trim().min(1).max(40), subjectId: z.uuid().nullable() })).min(1).max(500),
    }),
    handler: ({ actor, params, body }) => choices.setSubjectChoices(actor, params.id, body),
  }),
  route({
    method: "post",
    path: "/:id/sections",
    summary: "Add a section to a class",
    permission: "academic.manage",
    status: 201,
    params: idParam,
    body: sectionBody,
    handler: ({ actor, params, body }) => classes.createSection(actor, params.id, body),
  }),
]);

export const sectionsModule = defineModule("/sections", "Academic setup", [
  route({
    method: "patch",
    path: "/:id",
    summary: "Edit a section",
    permission: "academic.manage",
    params: idParam,
    body: sectionBody.partial(),
    handler: ({ actor, params, body }) => classes.updateSection(actor, params.id, body),
  }),
  route({
    method: "delete",
    path: "/:id",
    summary: "Delete a section with no students",
    permission: "academic.manage",
    params: idParam,
    handler: ({ actor, params }) => classes.deleteSection(actor, params.id),
  }),
]);

const subjectBody = z.object({ name: z.string().trim().min(1).max(60), code: optionalText, hasPractical: z.boolean().optional() });

export const subjectsModule = defineModule("/subjects", "Academic setup", [
  route({
    method: "get",
    path: "/",
    summary: "List subjects with the classes that study them",
    permission: "academic.view",
    handler: ({ schoolId }) => subjects.listSubjects(schoolId),
  }),
  route({
    method: "post",
    path: "/",
    summary: "Create a subject",
    permission: "academic.manage",
    status: 201,
    body: subjectBody,
    handler: ({ actor, body }) => subjects.createSubject(actor, body),
  }),
  route({
    method: "patch",
    path: "/:id",
    summary: "Edit a subject",
    permission: "academic.manage",
    params: idParam,
    body: subjectBody.partial(),
    handler: ({ actor, params, body }) => subjects.updateSubject(actor, params.id, body),
  }),
  route({
    method: "delete",
    path: "/:id",
    summary: "Delete a subject",
    permission: "academic.manage",
    params: idParam,
    handler: ({ actor, params }) => subjects.deleteSubject(actor, params.id),
  }),
]);

export const assignmentsModule = defineModule("/assignments", "Academic setup", [
  route({
    method: "get",
    path: "/",
    summary: "Class teachers and subject teachers for every section (current year by default)",
    permission: "academic.view",
    query: yearQuery,
    handler: ({ schoolId, query }) => assignments.getAssignments(schoolId, query.academicYearId),
  }),
  route({
    method: "get",
    path: "/teachers",
    summary: "Staff who can be assigned to teach",
    permission: "academic.view",
    handler: ({ schoolId }) => assignments.listTeachers(schoolId),
  }),
  route({
    method: "put",
    path: "/class-teacher",
    summary: "Set or clear a section's class teacher",
    permission: "assignment.manage",
    body: z.object({ academicYearId: z.uuid().optional(), sectionId: z.uuid(), teacherId: z.uuid().nullable() }),
    handler: ({ actor, body }) => assignments.setClassTeacher(actor, body),
  }),
  route({
    method: "post",
    path: "/subject-teacher",
    summary: "Assign a teacher to a subject in a section",
    permission: "assignment.manage",
    status: 201,
    body: z.object({ academicYearId: z.uuid().optional(), sectionId: z.uuid(), subjectId: z.uuid(), teacherId: z.uuid() }),
    handler: ({ actor, body }) => assignments.addSubjectTeacher(actor, body),
  }),
  route({
    method: "delete",
    path: "/subject-teacher/:id",
    summary: "Remove a subject teacher assignment",
    permission: "assignment.manage",
    params: idParam,
    handler: ({ actor, params }) => assignments.removeSubjectTeacher(actor, params.id),
  }),
  route({
    method: "post",
    path: "/copy",
    summary: "Copy class teachers, subject teachers and timetable from another year",
    description: "For starting a new year. Anything already set in the target year is kept.",
    permission: "assignment.manage",
    body: z.object({
      fromYearId: z.uuid(),
      toYearId: z.uuid().optional(),
      classTeachers: z.boolean().default(true),
      subjectTeachers: z.boolean().default(true),
      timetable: z.boolean().default(true),
    }),
    handler: ({ actor, body }) => assignments.copyFromYear(actor, body),
  }),
]);

const periodBody = z.object({ name: z.string().trim().min(1).max(30), startTime: time, endTime: time, order: z.number().int(), isBreak: z.boolean().optional() });

export const timetableModule = defineModule("/timetable", "Timetable", [
  route({
    method: "get",
    path: "/periods",
    summary: "The school's periods (bell schedule)",
    permission: "academic.view",
    handler: ({ schoolId }) => timetable.listPeriods(schoolId),
  }),
  route({
    method: "post",
    path: "/periods",
    summary: "Add a period",
    permission: "academic.manage",
    status: 201,
    body: periodBody,
    handler: ({ actor, body }) => timetable.createPeriod(actor, body),
  }),
  route({
    method: "patch",
    path: "/periods/:id",
    summary: "Edit a period",
    permission: "academic.manage",
    params: idParam,
    body: periodBody.partial(),
    handler: ({ actor, params, body }) => timetable.updatePeriod(actor, params.id, body),
  }),
  route({
    method: "delete",
    path: "/periods/:id",
    summary: "Delete a period",
    permission: "academic.manage",
    params: idParam,
    handler: ({ actor, params }) => timetable.deletePeriod(actor, params.id),
  }),
  route({
    method: "get",
    path: "/sections/:id",
    summary: "A section's timetable",
    permission: "academic.view",
    params: idParam,
    query: yearQuery,
    handler: ({ schoolId, params, query }) => timetable.getSectionTimetable(schoolId, params.id, query.academicYearId),
  }),
  route({
    method: "put",
    path: "/slot",
    summary: "Set one timetable cell (clear both subject and teacher to remove it)",
    description: "Rejects the change if the teacher already teaches another section in that period.",
    permission: "timetable.manage",
    body: z.object({
      academicYearId: z.uuid().optional(),
      sectionId: z.uuid(),
      dayOfWeek: z.number().int().min(0).max(6),
      periodId: z.uuid(),
      subjectId: z.uuid().nullable(),
      teacherId: z.uuid().nullable(),
    }),
    handler: ({ actor, body }) => timetable.setTimetableSlot(actor, body),
  }),
]);
