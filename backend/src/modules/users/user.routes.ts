import { z } from "zod";
import { defineModule, route } from "../../http/route.js";
import { dateString, idParam, optionalText, pagination, phoneNumber } from "../../http/schemas.js";
import { assertFileBelongsToSchool } from "../files/file.service.js";
import * as userService from "./user.service.js";

const staffProfile = z
  .object({
    employeeId: optionalText,
    designation: optionalText,
    gender: z.enum(["MALE", "FEMALE", "OTHER"]).nullable(),
    dateOfBirth: dateString.nullable(),
    joinDate: dateString.nullable(),
    qualification: optionalText,
    address: optionalText,
  })
  .partial();

const contact = {
  email: z.union([z.email(), z.literal("")]).optional().nullable(),
  phone: z.union([phoneNumber, z.literal("")]).optional().nullable(),
};

export const usersModule = defineModule("/users", "Staff & users", [
  route({
    method: "get",
    path: "/",
    summary: "List users (staff by default)",
    permission: "user.view",
    query: pagination.extend({
      search: z.string().optional(),
      roleId: z.uuid().optional(),
      status: z.enum(["active", "inactive"]).optional(),
      kind: z.enum(["staff", "all"]).default("staff"),
    }),
    handler: ({ schoolId, query }) => userService.listUsers(schoolId, query),
  }),

  route({
    method: "get",
    path: "/:id",
    summary: "User details, roles, permission exceptions and effective permissions",
    permission: "user.view",
    params: idParam,
    handler: ({ schoolId, params }) => userService.getUser(schoolId, params.id),
  }),

  route({
    method: "post",
    path: "/",
    summary: "Add a staff member / user",
    description: "Without a password the user logs in with phone + OTP.",
    permission: "user.manage",
    status: 201,
    body: z.object({
      fullName: z.string().trim().min(2).max(120),
      ...contact,
      password: z.string().min(8).max(128).optional().nullable(),
      roleIds: z.array(z.uuid()).default([]),
      staffProfile: staffProfile.optional(),
    }),
    handler: ({ actor, body }) => userService.createUser(actor, body),
  }),

  route({
    method: "patch",
    path: "/:id",
    summary: "Edit a user, or deactivate/reactivate them",
    permission: "user.manage",
    params: idParam,
    body: z
      .object({
        fullName: z.string().trim().min(2).max(120),
        ...contact,
        isActive: z.boolean(),
        photoKey: z.string().nullable(),
        staffProfile,
      })
      .partial(),
    handler: async ({ actor, params, body }) => {
      if (body.photoKey) await assertFileBelongsToSchool(actor.schoolId, body.photoKey);
      return userService.updateUser(actor, params.id, body);
    },
  }),

  route({
    method: "put",
    path: "/:id/roles",
    summary: "Set a user's roles",
    permission: "role.manage",
    params: idParam,
    body: z.object({ roleIds: z.array(z.uuid()) }),
    handler: ({ actor, params, body }) => userService.setUserRoles(actor, params.id, body.roleIds),
  }),

  route({
    method: "put",
    path: "/:id/permissions",
    summary: "Set a user's individual permission exceptions (GRANT adds, DENY removes)",
    permission: "user.permissions.manage",
    params: idParam,
    body: z.object({
      overrides: z.array(z.object({ permission: z.string(), effect: z.enum(["GRANT", "DENY"]) })),
    }),
    handler: ({ actor, params, body }) => userService.setPermissionOverrides(actor, params.id, body.overrides),
  }),

  route({
    method: "post",
    path: "/:id/reset-password",
    summary: "Set a new password for a user (logs them out everywhere)",
    permission: "user.manage",
    params: idParam,
    body: z.object({ password: z.string().min(8).max(128) }),
    handler: ({ actor, params, body }) => userService.resetPassword(actor, params.id, body.password),
  }),
]);
