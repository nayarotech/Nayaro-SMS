import { Router, type NextFunction, type Request, type Response } from "express";
import { forbidden, notFound, unauthorized } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { getSchoolSettings } from "../modules/settings/settings.service.js";
import { loadAuthContext, type AuthContext } from "./auth-context.js";
import type { RouteContext, RouteDefinition, RouteModule } from "./route.js";

/**
 * Builds an Express router from route definitions. For each route it runs, in order:
 *   extra middleware → authentication → school check → module switch → permission check
 *   → validation of params/query/body → handler → JSON response
 */
export function buildRouter(modules: RouteModule[]): Router {
  const router = Router();
  for (const module of modules) {
    for (const definition of module.routes) {
      const path = joinPath(module.prefix, definition.path);
      router[definition.method](path, ...(definition.middleware ?? []), createHandler(definition));
    }
  }
  return router;
}

export function joinPath(prefix: string, path: string): string {
  const joined = `${prefix}/${path}`.replace(/\/+/g, "/");
  return joined.length > 1 ? joined.replace(/\/$/, "") : joined;
}

function createHandler(definition: RouteDefinition) {
  const access = definition.access ?? "school";

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = access === "public" ? undefined : await authenticate(req, access);

      if (auth && definition.module && auth.schoolId) {
        const settings = await getSchoolSettings(auth.schoolId);
        if (settings[`modules.${definition.module}`] === false) {
          throw forbidden("This feature is turned off for your school");
        }
      }

      if (auth && definition.permission) {
        const required = Array.isArray(definition.permission) ? definition.permission : [definition.permission];
        if (!required.some((permission) => auth.permissions.has(permission))) throw forbidden();
      }

      const ctx: RouteContext<unknown, unknown, unknown> = {
        params: definition.params ? definition.params.parse(req.params) : req.params,
        query: definition.query ? definition.query.parse(req.query) : req.query,
        body: definition.body ? definition.body.parse(parseBody(req, definition)) : req.body,
        auth: auth as AuthContext,
        get schoolId() {
          if (!auth?.schoolId) throw new Error("schoolId used on a route without a school");
          return auth.schoolId;
        },
        get actor() {
          if (!auth?.schoolId) throw new Error("actor used on a route without a school");
          return { userId: auth.userId, schoolId: auth.schoolId, ip: req.ip };
        },
        req,
        res,
      };

      const result = await definition.handler(ctx);
      if (res.headersSent) return;
      const status = definition.status ?? 200;
      if (status === 204 || result === undefined) res.status(status === 200 ? 204 : status).end();
      else res.status(status).json(result);
    } catch (error) {
      next(error);
    }
  };
}

async function authenticate(req: Request, access: Exclude<RouteDefinition["access"], "public" | undefined>) {
  const auth = await loadAuthContext(req.headers.authorization, req.header("x-school-id"));

  if (access === "superAdmin" && !auth.isSuperAdmin) throw forbidden();

  if (access === "school") {
    if (!auth.schoolId) {
      throw auth.isSuperAdmin
        ? forbidden("Choose a school first (send the X-School-Id header)")
        : unauthorized("Your account is not linked to a school");
    }
    if (auth.isSuperAdmin) {
      const school = await prisma.school.findUnique({ where: { id: auth.schoolId }, select: { id: true } });
      if (!school) throw notFound("School");
    }
  }

  return auth;
}

/** Multipart forms send JSON fields as strings; everything else is already parsed. */
function parseBody(req: Request, definition: RouteDefinition): unknown {
  if (definition.bodyType !== "multipart") return req.body ?? {};
  return { ...(req.body ?? {}) };
}
