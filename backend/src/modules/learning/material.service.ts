import { badRequest, forbidden, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthContext } from "../../http/auth-context.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { resolveAcademicYear } from "../academic/academic-year.service.js";
import { subjectTakers } from "../academic/subject-choices.service.js";
import { guardianUserIds, notifyUsers } from "../notifications/notification.service.js";
import { pairKey, teachingScope, toAttachments, withUrls, type TeachingScope } from "./scope.service.js";

/**
 * Course materials: notes, slides, worksheets and video links for a class (or one
 * section) and subject. Anyone who teaches that subject in the class can add them.
 */

const materialInclude = {
  class: { select: { id: true, name: true } },
  section: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
  postedBy: { select: { id: true, fullName: true } },
} as const;

type MaterialRow = NonNullable<Awaited<ReturnType<typeof findMaterial>>>;

function toDto(m: MaterialRow, canManage?: boolean) {
  return {
    id: m.id,
    class: m.class,
    section: m.section,
    subject: m.subject,
    title: m.title,
    description: m.description,
    link: m.link,
    attachments: withUrls(m.attachments),
    postedBy: m.postedBy,
    createdAt: m.createdAt,
    ...(canManage !== undefined && { canManage }),
  };
}

async function findMaterial(schoolId: string, id: string) {
  const material = await prisma.material.findFirst({ where: { id, schoolId }, include: materialInclude });
  if (!material) throw notFound("Material");
  return material;
}

/** Teaches the subject in this class (any section, or the given one)? */
async function teachesIn(scope: TeachingScope, classId: string, subjectId: string, sectionId?: string | null) {
  if (scope.all) return true;
  const sections = await prisma.section.findMany({ where: { classId, ...(sectionId && { id: sectionId }) }, select: { id: true } });
  return sections.some((s) => scope.pairs.has(pairKey(s.id, subjectId)));
}

async function canManage(auth: AuthContext, scope: TeachingScope, m: { postedById: string; classId: string; subjectId: string; sectionId: string | null }) {
  if (scope.all || m.postedById === auth.userId) return true;
  return auth.permissions.has("material.upload") && (await teachesIn(scope, m.classId, m.subjectId, m.sectionId));
}

export async function listMaterials(auth: AuthContext, schoolId: string, query: { classId?: string; subjectId?: string }) {
  const year = await resolveAcademicYear(schoolId);
  const scope = await teachingScope(auth, year.id);
  const rows = await prisma.material.findMany({
    where: { schoolId, academicYearId: year.id, ...(query.classId && { classId: query.classId }), ...(query.subjectId && { subjectId: query.subjectId }) },
    include: materialInclude,
    orderBy: [{ subject: { name: "asc" } }, { createdAt: "desc" }],
  });
  return Promise.all(rows.map(async (m) => toDto(m, await canManage(auth, scope, m))));
}

export interface MaterialInput {
  classId: string;
  sectionId?: string | null;
  subjectId: string;
  title: string;
  description?: string | null;
  link?: string | null;
  attachments?: string[];
  notifyParents?: boolean;
}

export async function addMaterial(auth: AuthContext, actor: Actor, input: MaterialInput) {
  const year = await resolveAcademicYear(actor.schoolId);
  const schoolClass = await prisma.schoolClass.findFirst({ where: { id: input.classId, schoolId: actor.schoolId }, include: { subjects: true, sections: true } });
  if (!schoolClass) throw notFound("Class");
  if (!schoolClass.subjects.some((s) => s.subjectId === input.subjectId)) throw badRequest(`${schoolClass.name} doesn't study this subject`);
  if (input.sectionId && !schoolClass.sections.some((s) => s.id === input.sectionId)) throw badRequest("That section isn't part of the class");
  const scope = await teachingScope(auth, year.id);
  if (!(await teachesIn(scope, input.classId, input.subjectId, input.sectionId))) throw forbidden("You can only add materials for subjects you teach in this class");
  if (!input.link && !input.attachments?.length && !input.description) throw badRequest("Add a file, a link or some text");
  const attachments = await toAttachments(actor.schoolId, input.attachments ?? []);

  const created = await prisma.$transaction(async (tx) => {
    const material = await tx.material.create({
      data: {
        schoolId: actor.schoolId,
        academicYearId: year.id,
        classId: input.classId,
        sectionId: input.sectionId ?? null,
        subjectId: input.subjectId,
        title: input.title,
        description: input.description ?? null,
        link: input.link ?? null,
        attachments: attachments as unknown as object,
        postedById: actor.userId,
      },
    });
    await recordAudit(actor, { action: "material.add", entityType: "Material", entityId: material.id, newValue: { title: input.title, classId: input.classId, sectionId: input.sectionId, subjectId: input.subjectId } }, tx);
    return material;
  });

  if (input.notifyParents) {
    const subjectName = (await prisma.subject.findUniqueOrThrow({ where: { id: input.subjectId } })).name;
    const takes = await subjectTakers(input.classId, year.id);
    const enrollments = await prisma.enrollment.findMany({
      where: { classId: input.classId, academicYearId: year.id, status: { notIn: ["LEFT", "TRANSFERRED"] }, ...(input.sectionId && { sectionId: input.sectionId }) },
      select: { studentId: true },
    });
    const studentIds = enrollments.map((e) => e.studentId).filter((id) => takes(id, input.subjectId));
    const parents = await guardianUserIds(studentIds);
    await notifyUsers(actor.schoolId, [...new Set([...parents.values()].flat())], {
      type: "material.added",
      title: `New ${subjectName} material`,
      body: input.title,
      data: { materialId: created.id },
    });
  }
  return toDto(await findMaterial(actor.schoolId, created.id), true);
}

export async function updateMaterial(auth: AuthContext, actor: Actor, id: string, input: Partial<Pick<MaterialInput, "title" | "description" | "link" | "attachments">>) {
  const before = await findMaterial(actor.schoolId, id);
  const scope = await teachingScope(auth, before.academicYearId);
  if (!(await canManage(auth, scope, before))) throw forbidden("Only teachers of this subject can change it");
  const attachments = input.attachments ? await toAttachments(actor.schoolId, input.attachments) : undefined;
  await prisma.$transaction(async (tx) => {
    await tx.material.update({ where: { id }, data: { title: input.title, description: input.description, link: input.link, attachments: attachments as unknown as object | undefined } });
    await recordAudit(actor, { action: "material.update", entityType: "Material", entityId: id, oldValue: { title: before.title }, newValue: input }, tx);
  });
  return toDto(await findMaterial(actor.schoolId, id), true);
}

export async function deleteMaterial(auth: AuthContext, actor: Actor, id: string) {
  const before = await findMaterial(actor.schoolId, id);
  const scope = await teachingScope(auth, before.academicYearId);
  if (!(await canManage(auth, scope, before))) throw forbidden("Only teachers of this subject can delete it");
  await prisma.$transaction(async (tx) => {
    await tx.material.delete({ where: { id } });
    await recordAudit(actor, { action: "material.delete", entityType: "Material", entityId: id, oldValue: { title: before.title, subject: before.subject.name } }, tx);
  });
}

/** Parent app: materials for the child's class and section, for subjects they take. */
export async function childMaterials(schoolId: string, studentId: string) {
  const enrollment = await prisma.enrollment.findFirst({ where: { studentId, schoolId, academicYear: { isCurrent: true } } });
  if (!enrollment) return [];
  const takes = await subjectTakers(enrollment.classId, enrollment.academicYearId);
  const rows = await prisma.material.findMany({
    where: { schoolId, academicYearId: enrollment.academicYearId, classId: enrollment.classId, OR: [{ sectionId: null }, { sectionId: enrollment.sectionId }] },
    include: materialInclude,
    orderBy: [{ subject: { name: "asc" } }, { createdAt: "desc" }],
  });
  return rows.filter((m) => takes(studentId, m.subjectId)).map((m) => toDto(m));
}
