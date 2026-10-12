import type { Request, RequestHandler, Response } from "express";
import type { z } from "zod";
import type { Actor } from "../modules/audit/audit.service.js";
import type { Permission } from "../modules/permissions/permission.catalog.js";
import type { AuthContext } from "./auth-context.js";

/**
 * Who may call a route:
 * - "public"      no login (login, OTP, health)
 * - "user"        any logged-in user, school optional (e.g. /auth/me)
 * - "school"      logged-in user acting inside a school (the default)
 * - "superAdmin"  platform owner only
 */
export type RouteAccess = "public" | "user" | "school" | "superAdmin";

type AnyZod = z.ZodType;
type Infer<T> = T extends AnyZod ? z.output<T> : undefined;

export interface RouteContext<P, Q, B> {
  params: P;
  query: Q;
  body: B;
  /** Present on every route except "public" ones. */
  auth: AuthContext;
  /** The current school. Only use on "school" routes (throws otherwise). */
  schoolId: string;
  /** For audit logging. Only use on "school" routes (throws otherwise). */
  actor: Actor;
  req: Request;
  res: Response;
}

export interface RouteDefinition<P extends AnyZod | undefined = any, Q extends AnyZod | undefined = any, B extends AnyZod | undefined = any> {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  summary: string;
  description?: string;
  access?: RouteAccess;
  /** Caller needs at least one of these. */
  permission?: Permission | Permission[];
  /** Module switch from settings (e.g. "attendance") that must be on. */
  module?: string;
  params?: P;
  query?: Q;
  body?: B;
  /** "multipart" routes receive files via req.file (see files module). */
  bodyType?: "json" | "multipart";
  status?: number;
  middleware?: RequestHandler[];
  handler: (ctx: RouteContext<Infer<P>, Infer<Q>, Infer<B>>) => Promise<unknown> | unknown;
}

/** Identity function that gives the handler typed params/query/body. */
export function route<P extends AnyZod | undefined = undefined, Q extends AnyZod | undefined = undefined, B extends AnyZod | undefined = undefined>(
  definition: RouteDefinition<P, Q, B>,
): RouteDefinition {
  return definition as RouteDefinition;
}

/** A group of routes under one URL prefix, shown as one section in the API docs. */
export interface RouteModule {
  prefix: string;
  tag: string;
  routes: RouteDefinition[];
}

export function defineModule(prefix: string, tag: string, routes: RouteDefinition[]): RouteModule {
  return { prefix, tag, routes };
}
