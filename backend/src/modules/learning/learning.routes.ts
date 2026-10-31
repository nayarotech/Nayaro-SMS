import { z } from "zod";
import { defineModule, route } from "../../http/route.js";
import { dateString, idParam, optionalText, pagination, booleanQuery } from "../../http/schemas.js";
import * as homework from "./homework.service.js";
import * as materials from "./material.service.js";

const MODULE = "homework";
const fileKeys = z.array(z.string().min(1)).max(10);

export const homeworkModule = defineModule("/homework", "Homework", [
  route({
    method: "get",
    path: "/options",
    summary: "Classes, sections and subjects the user may post homework to (and teachers, for coordinators)",
    permission: ["homework.post", "homework.post_on_behalf", "material.upload"],
    module: MODULE,
    handler: ({ auth, schoolId }) => homework.postingOptions(auth, schoolId),
  }),
  route({
    method: "get",
    path: "/",
    summary: "Homework this year — teachers see their own classes, coordinators and principals see all",
    permission: ["homework.post", "homework.post_on_behalf", "student.record.view"],
    module: MODULE,
    query: pagination.extend({ classId: z.uuid().optional(), sectionId: z.uuid().optional(), subjectId: z.uuid().optional(), mine: booleanQuery }),
    handler: ({ auth, schoolId, query }) => homework.listHomework(auth, schoolId, query),
  }),
  route({
    method: "post",
    path: "/",
    summary: "Post homework to one or more sections. Parents of students taking the subject are notified.",
    permission: ["homework.post", "homework.post_on_behalf"],
    module: MODULE,
    status: 201,
    body: z.object({
      sectionIds: z.array(z.uuid()).min(1).max(20),
      subjectId: z.uuid(),
      title: z.string().trim().min(2).max(200),
      description: optionalText.pipe(z.string().max(5000).nullable()),
      assignedDate: dateString.optional(),
      dueDate: dateString,
      attachments: fileKeys.optional(),
      teacherId: z.uuid().optional(),
    }),
    handler: ({ auth, actor, body }) => homework.postHomework(auth, actor, body),
  }),
  route({
    method: "patch",
    path: "/:id",
    summary: "Edit homework (its teacher, the class teacher, or a coordinator)",
    permission: ["homework.post", "homework.post_on_behalf"],
    module: MODULE,
    params: idParam,
    body: z.object({ title: z.string().trim().min(2).max(200), description: optionalText, dueDate: dateString, attachments: fileKeys }).partial(),
    handler: ({ auth, actor, params, body }) => homework.updateHomework(auth, actor, params.id, body),
  }),
  route({
    method: "delete",
    path: "/:id",
    summary: "Delete homework",
    permission: ["homework.post", "homework.post_on_behalf"],
    module: MODULE,
    params: idParam,
    handler: ({ auth, actor, params }) => homework.deleteHomework(auth, actor, params.id),
  }),
  route({
    method: "get",
    path: "/:id/checks",
    summary: "Students and whether each did the homework",
    permission: ["homework.post", "homework.post_on_behalf"],
    module: MODULE,
    params: idParam,
    handler: ({ auth, schoolId, params }) => homework.getChecks(auth, schoolId, params.id),
  }),
  route({
    method: "put",
    path: "/:id/checks",
    summary: "Mark who did the homework (Done / Partly / Not done). Parents are told when it wasn't done.",
    permission: ["homework.post", "homework.post_on_behalf"],
    module: MODULE,
    params: idParam,
    body: z.object({
      checks: z.array(z.object({ studentId: z.uuid(), status: z.enum(["DONE", "PARTIAL", "NOT_DONE"]).nullable(), remark: z.string().trim().max(200).nullable().optional() })).min(1).max(200),
    }),
    handler: ({ auth, actor, params, body }) => homework.saveChecks(auth, actor, params.id, body.checks),
  }),
]);

export const materialsModule = defineModule("/materials", "Course materials", [
  route({
    method: "get",
    path: "/",
    summary: "Course materials this year (filter by class or subject)",
    permission: ["material.upload", "homework.post", "homework.post_on_behalf", "student.record.view"],
    module: MODULE,
    query: z.object({ classId: z.uuid().optional(), subjectId: z.uuid().optional() }),
    handler: ({ auth, schoolId, query }) => materials.listMaterials(auth, schoolId, query),
  }),
  route({
    method: "post",
    path: "/",
    summary: "Add notes, files or a video link for a class (or one section) and subject",
    permission: ["material.upload", "homework.post_on_behalf"],
    module: MODULE,
    status: 201,
    body: z.object({
      classId: z.uuid(),
      sectionId: z.uuid().nullable().optional(),
      subjectId: z.uuid(),
      title: z.string().trim().min(2).max(200),
      description: optionalText.pipe(z.string().max(5000).nullable()),
      link: z.union([z.url().max(500), z.literal("")]).nullable().optional().transform((v) => v || null),
      attachments: fileKeys.optional(),
      notifyParents: z.boolean().optional(),
    }),
    handler: ({ auth, actor, body }) => materials.addMaterial(auth, actor, body),
  }),
  route({
    method: "patch",
    path: "/:id",
    summary: "Edit a material",
    permission: ["material.upload", "homework.post_on_behalf"],
    module: MODULE,
    params: idParam,
    body: z
      .object({
        title: z.string().trim().min(2).max(200),
        description: optionalText,
        link: z.union([z.url().max(500), z.literal("")]).nullable().transform((v) => v || null),
        attachments: fileKeys,
      })
      .partial(),
    handler: ({ auth, actor, params, body }) => materials.updateMaterial(auth, actor, params.id, body),
  }),
  route({
    method: "delete",
    path: "/:id",
    summary: "Delete a material",
    permission: ["material.upload", "homework.post_on_behalf"],
    module: MODULE,
    params: idParam,
    handler: ({ auth, actor, params }) => materials.deleteMaterial(auth, actor, params.id),
  }),
]);
