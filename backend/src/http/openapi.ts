import { z } from "zod";
import { joinPath } from "./router.js";
import type { RouteModule } from "./route.js";

/**
 * Generates the OpenAPI document from the same route definitions that build
 * the Express router, so the docs can't drift from the code.
 * Served at /api/openapi.json and rendered at /api/docs.
 */
export function buildOpenApiDocument(modules: RouteModule[], basePath = "/api") {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const module of modules) {
    for (const route of module.routes) {
      const expressPath = basePath + joinPath(module.prefix, route.path);
      const openApiPath = expressPath.replace(/:(\w+)/g, "{$1}");
      const access = route.access ?? "school";

      const parameters = [
        ...objectParameters(route.params, "path"),
        ...objectParameters(route.query, "query"),
      ];

      const descriptionParts = [
        route.description,
        route.permission && `**Permission:** ${[route.permission].flat().join(" or ")}`,
        access === "superAdmin" && "**Super admin only**",
        route.module && `**Module:** ${route.module}`,
      ].filter(Boolean);

      paths[openApiPath] ??= {};
      paths[openApiPath][route.method] = {
        tags: [module.tag],
        summary: route.summary,
        description: descriptionParts.join("\n\n") || undefined,
        security: access === "public" ? [] : [{ bearerAuth: [] }],
        parameters: parameters.length ? parameters : undefined,
        requestBody: route.body
          ? {
              required: true,
              content: {
                [route.bodyType === "multipart" ? "multipart/form-data" : "application/json"]: {
                  schema: toJsonSchema(route.body),
                },
              },
            }
          : undefined,
        responses: {
          [String(route.status ?? 200)]: { description: "Success" },
          "400": { description: "Validation error" },
          ...(access === "public" ? {} : { "401": { description: "Not logged in" }, "403": { description: "Not allowed" } }),
        },
      };
    }
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "School Management System API",
      version: "0.1.0",
      description:
        "All school data is scoped to the caller's school. Super admins pick a school with the `X-School-Id` header.\n\n" +
        "Errors look like `{ error: { code, message, details? } }`. Dates are `YYYY-MM-DD` (AD).",
    },
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    },
    paths,
  };
}

function toJsonSchema(schema: z.ZodType) {
  try {
    return z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  } catch {
    return {};
  }
}

function objectParameters(schema: z.ZodType | undefined, location: "path" | "query") {
  if (!schema) return [];
  const json = toJsonSchema(schema) as { properties?: Record<string, unknown>; required?: string[] };
  return Object.entries(json.properties ?? {}).map(([name, property]) => ({
    name,
    in: location,
    required: location === "path" || (json.required ?? []).includes(name),
    schema: property,
  }));
}
