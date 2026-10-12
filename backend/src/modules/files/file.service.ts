import { randomUUID } from "node:crypto";
import path from "node:path";
import mime from "mime-types";
import { badRequest, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { storage } from "../../lib/storage/index.js";
import type { Actor } from "../audit/audit.service.js";

/**
 * What can be uploaded, per purpose. Add a purpose here when a new screen needs uploads.
 */
export const UPLOAD_PURPOSES: Record<string, { folder: string; types: readonly string[]; isPublic?: boolean }> = {
  // The logo appears on the public website, so it's public too
  "school-logo": { folder: "branding", types: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"], isPublic: true },
  "user-photo": { folder: "users", types: ["image/png", "image/jpeg", "image/webp"] },
  "student-photo": { folder: "students/photos", types: ["image/png", "image/jpeg", "image/webp"] },
  "student-document": {
    folder: "students/documents",
    types: ["image/png", "image/jpeg", "image/webp", "application/pdf"],
  },
  // Website files are public: anyone with the link can open them (no signed URL)
  "website-image": { folder: "website/images", types: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"], isPublic: true },
  "website-file": {
    folder: "website/files",
    types: ["application/pdf", "image/png", "image/jpeg", "image/webp", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    isPublic: true,
  },
};

export type UploadPurpose = string;

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export async function uploadFile(actor: Actor, purpose: UploadPurpose, file: UploadedFile) {
  const rules = UPLOAD_PURPOSES[purpose];
  if (!rules) throw badRequest("Unknown upload purpose");
  if (!rules.types.includes(file.mimetype)) {
    throw badRequest(`This file type is not allowed. Allowed: ${rules.types.join(", ")}`);
  }

  const extension = mime.extension(file.mimetype) || path.extname(file.originalname).slice(1) || "bin";
  const key = `schools/${actor.schoolId}/${rules.folder}/${randomUUID()}.${extension}`;

  await storage.save(key, file.buffer, file.mimetype);
  const stored = await prisma.storedFile.create({
    data: {
      schoolId: actor.schoolId,
      key,
      originalName: file.originalname.slice(0, 190),
      mimeType: file.mimetype,
      sizeBytes: file.size,
      isPublic: Boolean(rules.isPublic),
      uploadedById: actor.userId,
    },
  });

  const url = rules.isPublic ? publicFileUrl(key) : storage.getUrl(key);
  return { id: stored.id, key, url, originalName: stored.originalName, mimeType: stored.mimeType };
}

/** Use before saving a file key on a record, so one school can't reference another school's file. */
export async function assertFileBelongsToSchool(schoolId: string, key: string): Promise<void> {
  const file = await prisma.storedFile.findUnique({ where: { key }, select: { schoolId: true } });
  if (!file || file.schoolId !== schoolId) throw notFound("File");
}

export async function getFileMeta(key: string) {
  return prisma.storedFile.findUnique({ where: { key }, select: { mimeType: true, originalName: true, isPublic: true } });
}

/** Permanent URL for a public (website) file. */
export function publicFileUrl(key: string): string {
  return `${env.PUBLIC_API_URL}/api/files/public/${key}`;
}
