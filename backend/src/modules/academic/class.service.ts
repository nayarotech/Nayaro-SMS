import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { groupName } from "./subject-choices.service.js";

/** Classes (grades), their sections, and which subjects each class studies. */

export interface ClassInput {
  name: string;
  order: number;
  /** Section names to create with a new class, e.g. ["A", "B"] */
  sections?: string[];
}

export interface SectionInput {
  name: string;
  capacity?: number | null;
  room?: string | null;
}

export async function listClasses(schoolId: string) {
  const currentYear = await prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true }, select: { id: true } });

  const classes = await prisma.schoolClass.findMany({
    where: { schoolId },
    orderBy: { order: "asc" },
    include: {
      sections: {
        orderBy: { name: "asc" },
        include: {
          classTeachers: { where: { academicYearId: currentYear?.id ?? "" }, include: { teacher: { select: { id: true, fullName: true } } } },
          _count: { select: { enrollments: { where: { academicYearId: currentYear?.id ?? "", status: { notIn: ["LEFT", "TRANSFERRED"] } } } } },
        },
      },
      subjects: { include: { subject: { select: { id: true, name: true, code: true } } } },
    },
  });

  return classes.map((c) => ({
    id: c.id,
    name: c.name,
    order: c.order,
    sections: c.sections.map((s) => ({
      id: s.id,
      name: s.name,
      capacity: s.capacity,
      room: s.room,
      studentCount: s._count.enrollments,
      classTeacher: s.classTeachers[0]?.teacher ?? null,
    })),
    subjects: c.subjects
      .map((cs) => ({ ...cs.subject, isOptional: cs.isOptional, optionGroup: cs.isOptional ? groupName(cs.optionGroup) : null }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

export async function createClass(actor: Actor, input: ClassInput) {
  const sectionNames = [...new Set((input.sections ?? []).map((s) => s.trim()).filter(Boolean))];

  const created = await prisma.$transaction(async (tx) => {
    const schoolClass = await tx.schoolClass.create({
      data: {
        schoolId: actor.schoolId,
        name: input.name,
        order: input.order,
        sections: { create: sectionNames.map((name) => ({ schoolId: actor.schoolId, name })) },
      },
    });
    await recordAudit(actor, { action: "class.create", entityType: "SchoolClass", entityId: schoolClass.id, newValue: input }, tx);
    return schoolClass;
  });
  return created;
}

export async function updateClass(actor: Actor, classId: string, input: Partial<Omit<ClassInput, "sections">>) {
  const before = await findClass(actor.schoolId, classId);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.schoolClass.update({ where: { id: classId }, data: { name: input.name, order: input.order } });
    await recordAudit(actor, { action: "class.update", entityType: "SchoolClass", entityId: classId, oldValue: { name: before.name, order: before.order }, newValue: input }, tx);
    return updated;
  });
}

export async function deleteClass(actor: Actor, classId: string) {
  const schoolClass = await findClass(actor.schoolId, classId);
  if (await prisma.enrollment.count({ where: { classId } })) throw conflict("Students are enrolled in this class, so it can't be deleted");
  await prisma.$transaction(async (tx) => {
    await tx.schoolClass.delete({ where: { id: classId } });
    await recordAudit(actor, { action: "class.delete", entityType: "SchoolClass", entityId: classId, oldValue: { name: schoolClass.name } }, tx);
  });
}

// ─── Sections ────────────────────────────────────────────────

export async function createSection(actor: Actor, classId: string, input: SectionInput) {
  await findClass(actor.schoolId, classId);
  return prisma.$transaction(async (tx) => {
    const section = await tx.section.create({ data: { schoolId: actor.schoolId, classId, ...input } });
    await recordAudit(actor, { action: "section.create", entityType: "Section", entityId: section.id, newValue: { classId, ...input } }, tx);
    return section;
  });
}

export async function updateSection(actor: Actor, sectionId: string, input: Partial<SectionInput>) {
  const before = await findSection(actor.schoolId, sectionId);
  return prisma.$transaction(async (tx) => {
    const section = await tx.section.update({ where: { id: sectionId }, data: input });
    await recordAudit(actor, { action: "section.update", entityType: "Section", entityId: sectionId, oldValue: { name: before.name, capacity: before.capacity, room: before.room }, newValue: input }, tx);
    return section;
  });
}

export async function deleteSection(actor: Actor, sectionId: string) {
  const section = await findSection(actor.schoolId, sectionId);
  if (await prisma.enrollment.count({ where: { sectionId } })) throw conflict("Students are enrolled in this section, so it can't be deleted");
  await prisma.$transaction(async (tx) => {
    await tx.section.delete({ where: { id: sectionId } });
    await recordAudit(actor, { action: "section.delete", entityType: "Section", entityId: sectionId, oldValue: { name: section.name, classId: section.classId } }, tx);
  });
}

// ─── Curriculum ──────────────────────────────────────────────

/** Replace the list of subjects a class studies. */
export async function setClassSubjects(actor: Actor, classId: string, subjects: { subjectId: string; isOptional: boolean; optionGroup?: string | null }[]) {
  await findClass(actor.schoolId, classId);
  const ids = subjects.map((s) => s.subjectId);
  const found = await prisma.subject.count({ where: { schoolId: actor.schoolId, id: { in: ids } } });
  if (found !== new Set(ids).size) throw badRequest("One or more subjects were not found");

  const before = await prisma.classSubject.findMany({ where: { classId } });
  await prisma.$transaction(async (tx) => {
    await tx.classSubject.deleteMany({ where: { classId } });
    await tx.classSubject.createMany({
      data: subjects.map((s) => ({ schoolId: actor.schoolId, classId, subjectId: s.subjectId, isOptional: s.isOptional, optionGroup: s.isOptional ? groupName(s.optionGroup) : null })),
    });
    await recordAudit(
      actor,
      { action: "class.subjects.update", entityType: "SchoolClass", entityId: classId, oldValue: before.map((b) => b.subjectId), newValue: ids },
      tx,
    );
  });
}

export async function findSection(schoolId: string, sectionId: string) {
  const section = await prisma.section.findFirst({ where: { id: sectionId, schoolId }, include: { class: true } });
  if (!section) throw notFound("Section");
  return section;
}

async function findClass(schoolId: string, classId: string) {
  const schoolClass = await prisma.schoolClass.findFirst({ where: { id: classId, schoolId } });
  if (!schoolClass) throw notFound("Class");
  return schoolClass;
}
