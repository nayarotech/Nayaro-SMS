import { z } from "zod";
import { defineModule, route } from "../../http/route.js";
import { idParam, optionalText } from "../../http/schemas.js";
import * as roleService from "./role.service.js";

const roleBody = z.object({
  name: z.string().trim().min(2).max(60),
  description: optionalText,
  permissions: z.array(z.string()).default([]),
});

export const rolesModule = defineModule("/roles", "Roles & permissions", [
  route({
    method: "get",
    path: "/",
    summary: "List roles with their permissions and number of users",
    permission: "role.view",
    handler: ({ schoolId }) => roleService.listRoles(schoolId),
  }),

  route({
    method: "get",
    path: "/:id",
    summary: "Get a role",
    permission: "role.view",
    params: idParam,
    handler: ({ schoolId, params }) => roleService.getRole(schoolId, params.id),
  }),

  route({
    method: "post",
    path: "/",
    summary: "Create a custom role",
    permission: "role.manage",
    status: 201,
    body: roleBody,
    handler: ({ actor, body }) => roleService.createRole(actor, body),
  }),

  route({
    method: "patch",
    path: "/:id",
    summary: "Rename a role or change its permissions",
    description: "School Admin's permissions are locked so a school can't lock itself out.",
    permission: "role.manage",
    params: idParam,
    body: roleBody.partial(),
    handler: ({ actor, params, body }) => roleService.updateRole(actor, params.id, body),
  }),

  route({
    method: "delete",
    path: "/:id",
    summary: "Delete a custom role (must have no users)",
    permission: "role.manage",
    params: idParam,
    handler: ({ actor, params }) => roleService.deleteRole(actor, params.id),
  }),
]);
