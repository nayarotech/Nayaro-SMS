import { z } from "zod";
import { defineModule, route } from "../../http/route.js";
import { idParam, optionalText, pagination, phoneNumber } from "../../http/schemas.js";
import { assertFileBelongsToSchool } from "../files/file.service.js";
import * as schoolService from "./school.service.js";

const schoolFields = {
  name: z.string().trim().min(2).max(150),
  address: optionalText,
  phone: optionalText,
  email: z.email().optional().nullable(),
};

/** Platform-level school management (Super Admin). */
export const schoolsModule = defineModule("/schools", "Schools (super admin)", [
  route({
    method: "get",
    path: "/",
    summary: "List schools",
    access: "superAdmin",
    query: pagination.extend({ search: z.string().optional() }),
    handler: ({ query }) => schoolService.listSchools(query),
  }),

  route({
    method: "post",
    path: "/",
    summary: "Create a school with its first School Admin",
    access: "superAdmin",
    status: 201,
    body: z.object({
      ...schoolFields,
      code: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9-]{2,12}$/, "2–12 letters, numbers or dashes"),
      admin: z.object({
        fullName: z.string().trim().min(2),
        email: z.email(),
        phone: phoneNumber.optional().nullable(),
        password: z.string().min(8),
      }),
    }),
    handler: ({ body }) => schoolService.createSchool(body),
  }),

  route({
    method: "get",
    path: "/:id",
    summary: "Get a school",
    access: "superAdmin",
    params: idParam,
    handler: ({ params }) => schoolService.getSchool(params.id),
  }),

  route({
    method: "patch",
    path: "/:id",
    summary: "Update a school or suspend/reactivate it",
    access: "superAdmin",
    params: idParam,
    body: z.object({ ...schoolFields, isActive: z.boolean() }).partial(),
    handler: ({ params, body }) => schoolService.updateSchool(params.id, body),
  }),
]);

/** A school's own profile, edited by its admins. */
export const schoolProfileModule = defineModule("/school", "School profile", [
  route({
    method: "get",
    path: "/",
    summary: "Get this school's profile",
    handler: ({ schoolId }) => schoolService.getSchool(schoolId),
  }),

  route({
    method: "patch",
    path: "/",
    summary: "Update this school's name, contact details and logo",
    permission: "school.settings.edit",
    body: z.object({ ...schoolFields, logoKey: z.string().nullable() }).partial(),
    handler: async ({ actor, body }) => {
      if (body.logoKey) await assertFileBelongsToSchool(actor.schoolId, body.logoKey);
      return schoolService.updateSchool(actor.schoolId, body, actor);
    },
  }),
]);
