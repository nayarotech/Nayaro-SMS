import type { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
};

/** Converts any thrown error into `{ error: { code, message, details? } }`. */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const { status, body } = toResponse(error);
  if (status >= 500) logger.error({ err: error, path: req.path }, "Unhandled error");
  res.status(status).json({ error: body });
};

function toResponse(error: unknown): { status: number; body: { code: string; message: string; details?: unknown } } {
  if (error instanceof AppError) {
    return { status: error.status, body: { code: error.code, message: error.message, details: error.details } };
  }

  if (error instanceof ZodError) {
    return {
      status: 400,
      body: { code: "VALIDATION_ERROR", message: "Some fields are invalid", details: flattenIssues(error) },
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return { status: 409, body: { code: "CONFLICT", message: "A record with these details already exists" } };
    }
    if (error.code === "P2025") {
      return { status: 404, body: { code: "NOT_FOUND", message: "Record not found" } };
    }
    if (error.code === "P2003") {
      return { status: 409, body: { code: "IN_USE", message: "This record is linked to other records" } };
    }
  }

  if (error instanceof multer.MulterError) {
    return { status: 400, body: { code: "UPLOAD_ERROR", message: error.message } };
  }

  if (error instanceof SyntaxError && "body" in error) {
    return { status: 400, body: { code: "BAD_JSON", message: "Request body is not valid JSON" } };
  }

  return { status: 500, body: { code: "INTERNAL_ERROR", message: "Something went wrong" } };
}

/** { formErrors: [...], fieldErrors: { "admin.email": ["Invalid email"] } } — nested paths are dotted. */
function flattenIssues(error: ZodError) {
  const formErrors: string[] = [];
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    if (issue.path.length === 0) {
      formErrors.push(issue.message);
      continue;
    }
    const key = issue.path.join(".");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { formErrors, fieldErrors };
}
