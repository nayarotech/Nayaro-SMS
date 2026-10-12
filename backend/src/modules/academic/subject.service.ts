import { notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";

export interface SubjectInput {
  name: string;
  code?: string | null;
  hasPractical?: boolean;
}

export async function listSubjects(schoolId: string) {
  const subjects = await prisma.subject.findMany({
    where: { schoolId },
    orderBy: { name: "asc" },
    include: { classes: { include: { class: { select: { id: true, name: true, order: true } } } } },
  });
  return subjects.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    hasPractical: s.hasPractical,
    classes: s.classes.map((c) => c.class).sort((a, b) => a.order - b.order),
  }));
}

export async function createSubject(actor: Actor, input: SubjectInput) {
  return prisma.$transaction(async (tx) => {
    const subject = await tx.subject.create({ data: { schoolId: actor.schoolId, ...input } });
    await recordAudit(actor, { action: "subject.create", entityType: "Subject", entityId: subject.id, newValue: input }, tx);
    return subject;
  });
}

export async function updateSubject(actor: Actor, subjectId: string, input: Partial<SubjectInput>) {
  const before = await findSubject(actor.schoolId, subjectId);
  return prisma.$transaction(async (tx) => {
    const subject = await tx.subject.update({ where: { id: subjectId }, data: input });
    await recordAudit(actor, { action: "subject.update", entityType: "Subject", entityId: subjectId, oldValue: before, newValue: input }, tx);
    return subject;
  });
}

export async function deleteSubject(actor: Actor, subjectId: string) {
  const subject = await findSubject(actor.schoolId, subjectId);
  await prisma.$transaction(async (tx) => {
    await tx.subject.delete({ where: { id: subjectId } });
    await recordAudit(actor, { action: "subject.delete", entityType: "Subject", entityId: subjectId, oldValue: subject }, tx);
  });
}

async function findSubject(schoolId: string, subjectId: string) {
  const subject = await prisma.subject.findFirst({ where: { id: subjectId, schoolId } });
  if (!subject) throw notFound("Subject");
  return subject;
}
