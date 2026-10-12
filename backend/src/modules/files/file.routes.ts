import type { Response } from "express";
import multer from "multer";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { env } from "../../config/env.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { verifyLocalSignature } from "../../lib/storage/local.driver.js";
import { storage } from "../../lib/storage/index.js";
import { defineModule, route } from "../../http/route.js";
import { UPLOAD_PURPOSES, getFileMeta, uploadFile, type UploadPurpose } from "./file.service.js";

/** Streams a stored file and resolves when it has been sent (so the route doesn't end the response early). */
async function sendFile(res: Response, key: string) {
  try {
    await pipeline(await storage.read(key), res);
  } catch {
    if (!res.headersSent) res.status(404).end();
  }
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.UPLOAD_MAX_MB * 1024 * 1024 } });

export const filesModule = defineModule("/files", "Files", [
  route({
    method: "post",
    path: "/",
    summary: "Upload a file",
    description:
      "Multipart form with `file` and `purpose`. Returns a `key` to save on the record (e.g. a student's photoKey) and a temporary `url`.",
    bodyType: "multipart",
    middleware: [upload.single("file")],
    status: 201,
    body: z.object({ purpose: z.enum(Object.keys(UPLOAD_PURPOSES) as [UploadPurpose, ...UploadPurpose[]]) }),
    handler: ({ actor, body, req }) => {
      if (!req.file) throw badRequest("No file was uploaded");
      return uploadFile(actor, body.purpose, req.file);
    },
  }),

  route({
    method: "get",
    path: "/public/*key",
    summary: "Download a public website file",
    access: "public",
    handler: async ({ req, res }) => {
      const key = ([] as string[]).concat((req.params as { key: string | string[] }).key).join("/");
      const meta = await getFileMeta(key);
      if (!meta?.isPublic) throw notFound("File");
      res.setHeader("Content-Type", meta.mimeType);
      // Keys are random and never reused, so files can be cached for a long time
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      await sendFile(res, key);
    },
  }),

  route({
    method: "get",
    path: "/raw",
    summary: "Download a file using a signed link",
    description: "Links are created by the API (they expire after an hour), so this route needs no login.",
    access: "public",
    query: z.object({ key: z.string(), exp: z.coerce.number(), sig: z.string() }),
    handler: async ({ query, res }) => {
      if (!verifyLocalSignature(query.key, query.exp, query.sig)) throw notFound("File");
      const meta = await getFileMeta(query.key);
      if (!meta) throw notFound("File");

      res.setHeader("Content-Type", meta.mimeType);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(meta.originalName)}"`);
      await sendFile(res, query.key);
    },
  }),
]);
