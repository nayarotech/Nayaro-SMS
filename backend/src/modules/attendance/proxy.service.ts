import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { formatBsLong, fromDateString, toDateString, todayInNepal } from "../../lib/nepali-date.js";
import { prisma } from "../../lib/prisma.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { assertTeacher } from "../academic/assignment.service.js";
import { findSection } from "../academic/class.service.js";
import { notifyUsers } from "../notifications/notification.service.js";
import type { Prisma } from "../../generated/prisma/client.js";

/**
 * Proxy teachers: when a class teacher is away, an admin lets another teacher
 * take that section's attendance for specific dates. Access ends automatically
 * after the end date (or earlier if revoked).
 */

export type ProxyFilter = "active" | "upcoming" | "past" | "all";

export async function listProxies(schoolId: string, filter: ProxyFilter = "all") {
  const today = fromDateString(todayInNepal());
  const where: Prisma.ProxyAssignmentWhereInput = {
    schoolId,
    ...(filter === "active" && { revokedAt: null, startDate: { lte: today }, endDate: { gte: today } }),
    ...(filter === "upcoming" && { revokedAt: null, startDate: { gt: today } }),
    ...(filter === "past" && { OR: [{ endDate: { lt: today } }, { revokedAt: { not: null } }] }),
  };
  const proxies = await prisma.proxyAssignment.findMany({
    where,
    include: { teacher: { select: { id: true, fullName: true } }, section: { include: { class: true } } },
    orderBy: { startDate: "desc" },
    take: 200,
  });
  const todayString = todayInNepal();
  return proxies.map((p) => {
    const start = toDateString(p.startDate);
    const end = toDateString(p.endDate);
    return {
      id: p.id,
      section: { id: p.sectionId, label: `${p.section.class.name} ${p.section.name}` },
      teacher: p.teacher,
      startDate: start,
      endDate: end,
      reason: p.reason,
      status: p.revokedAt ? "revoked" : end < todayString ? "expired" : start > todayString ? "upcoming" : "active",
      createdAt: p.createdAt,
    };
  });
}

export interface ProxyInput {
  sectionId: string;
  teacherId: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
}

export async function assignProxy(actor: Actor, input: ProxyInput) {
  const section = await findSection(actor.schoolId, input.sectionId);
  await assertTeacher(actor.schoolId, input.teacherId);
  if (input.endDate < input.startDate) throw badRequest("The end date must be on or after the start date", { fieldErrors: { endDate: ["Before start date"] } });
  if (input.endDate < todayInNepal()) throw badRequest("A proxy can't be assigned only for past dates");

  const overlap = await prisma.proxyAssignment.findFirst({
    where: { sectionId: input.sectionId, revokedAt: null, startDate: { lte: fromDateString(input.endDate) }, endDate: { gte: fromDateString(input.startDate) } },
    include: { teacher: { select: { fullName: true } } },
  });
  if (overlap) throw conflict(`${overlap.teacher.fullName} is already the proxy for this section on some of these dates`);

  const proxy = await prisma.$transaction(async (tx) => {
    const created = await tx.proxyAssignment.create({
      data: {
        schoolId: actor.schoolId,
        sectionId: input.sectionId,
        teacherId: input.teacherId,
        startDate: fromDateString(input.startDate),
        endDate: fromDateString(input.endDate),
        reason: input.reason || null,
        assignedById: actor.userId,
      },
    });
    await recordAudit(actor, { action: "attendance.proxy.assign", entityType: "ProxyAssignment", entityId: created.id, newValue: input }, tx);
    return created;
  });

  const dates = input.startDate === input.endDate ? formatBsLong(input.startDate) : `${formatBsLong(input.startDate)} – ${formatBsLong(input.endDate)}`;
  await notifyUsers(actor.schoolId, [input.teacherId], {
    type: "attendance.proxy",
    title: `Proxy for ${section.class.name} ${section.name}`,
    body: `You'll take attendance for ${section.class.name} ${section.name} on ${dates}.`,
    data: { sectionId: input.sectionId, startDate: input.startDate, endDate: input.endDate },
  });
  return proxy;
}

export async function revokeProxy(actor: Actor, proxyId: string) {
  const proxy = await prisma.proxyAssignment.findFirst({ where: { id: proxyId, schoolId: actor.schoolId } });
  if (!proxy) throw notFound("Proxy assignment");
  if (proxy.revokedAt) return;
  await prisma.$transaction(async (tx) => {
    await tx.proxyAssignment.update({ where: { id: proxyId }, data: { revokedAt: new Date() } });
    await recordAudit(actor, { action: "attendance.proxy.revoke", entityType: "ProxyAssignment", entityId: proxyId, oldValue: { teacherId: proxy.teacherId, sectionId: proxy.sectionId } }, tx);
  });
}
