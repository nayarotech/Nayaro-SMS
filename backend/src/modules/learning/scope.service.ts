import { badRequest } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { storage } from "../../lib/storage/index.js";
import type { AuthContext } from "../../http/auth-context.js";
import type { Prisma } from "../../generated/prisma/client.js";

/**
 * Who may post homework or materials where:
 * - a subject teacher: the sections and subjects they're assigned to
 * - a class teacher: every subject of their own section
 * - `homework.post_on_behalf` (coordinators, admins): everywhere
 */

export interface TeachingScope {
  all: boolean;
  /** "sectionId:subjectId" */
  pairs: Set<string>;
  /** Section → class, for the sections in scope */
  sections: Map<string, { classId: string; label: string }>;
}

export const pairKey = (sectionId: string, subjectId: string) => `${sectionId}:${subjectId}`;

export async function teachingScope(auth: AuthContext, academicYearId: string, userId = auth.userId): Promise<TeachingScope> {
  const all = auth.permissions.has("homework.post_on_behalf") && userId === auth.userId;
  const [assignments, classTeacherOf] = await Promise.all([
    prisma.subjectAssignment.findMany({ where: { academicYearId, teacherId: userId }, include: { section: { include: { class: true } } } }),
    prisma.classTeacherAssignment.findMany({ where: { academicYearId, teacherId: userId }, include: { section: { include: { class: { include: { subjects: true } } } } } }),
  ]);
  const pairs = new Set<string>();
  const sections = new Map<string, { classId: string; label: string }>();
  for (const a of assignments) {
    pairs.add(pairKey(a.sectionId, a.subjectId));
    sections.set(a.sectionId, { classId: a.section.classId, label: `${a.section.class.name} ${a.section.name}` });
  }
  for (const c of classTeacherOf) {
    for (const cs of c.section.class.subjects) pairs.add(pairKey(c.sectionId, cs.subjectId));
    sections.set(c.sectionId, { classId: c.section.classId, label: `${c.section.class.name} ${c.section.name}` });
  }
  return { all, pairs, sections };
}

/** Where-filter for homework a user may see and manage (everything for coordinators). */
export function scopeFilter(scope: TeachingScope, userId: string): Prisma.HomeworkWhereInput {
  if (scope.all) return {};
  const pairs = [...scope.pairs].map((p) => {
    const [sectionId, subjectId] = p.split(":");
    return { sectionId, subjectId };
  });
  return { OR: [{ teacherId: userId }, ...pairs] };
}

// ─── Attachments ─────────────────────────────────────────────

export interface Attachment {
  key: string;
  name: string;
  mimeType: string;
  size: number;
}

const MAX_ATTACHMENTS = 10;

/** Turns uploaded file keys into attachments, checking they belong to this school. */
export async function toAttachments(schoolId: string, keys: string[]): Promise<Attachment[]> {
  if (keys.length > MAX_ATTACHMENTS) throw badRequest(`Attach at most ${MAX_ATTACHMENTS} files`);
  if (!keys.length) return [];
  const files = await prisma.storedFile.findMany({ where: { schoolId, key: { in: keys } } });
  if (files.length !== new Set(keys).size) throw badRequest("An attached file wasn't found. Upload it again.");
  return keys.map((key) => {
    const f = files.find((x) => x.key === key)!;
    return { key, name: f.originalName, mimeType: f.mimeType, size: f.sizeBytes };
  });
}

/** Attachments with a temporary download link (links expire after an hour). */
export function withUrls(attachments: unknown) {
  return ((attachments as Attachment[] | null) ?? []).map((a) => ({ ...a, url: storage.getUrl(a.key) }));
}
