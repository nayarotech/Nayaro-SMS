import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { defineModule, route } from "../../http/route.js";
import { dateString, pagination } from "../../http/schemas.js";

export const auditModule = defineModule("/audit", "Audit log", [
  route({
    method: "get",
    path: "/",
    summary: "Search the audit log",
    permission: "audit.view",
    query: pagination.extend({
      entityType: z.string().optional(),
      entityId: z.string().optional(),
      actorId: z.uuid().optional(),
      action: z.string().optional(),
      from: dateString.optional(),
      to: dateString.optional(),
    }),
    handler: async ({ schoolId, query }) => {
      const where: Prisma.AuditLogWhereInput = {
        schoolId,
        entityType: query.entityType,
        entityId: query.entityId,
        actorId: query.actorId,
        ...(query.action && { action: { startsWith: query.action } }),
        ...((query.from || query.to) && {
          createdAt: {
            gte: query.from ? new Date(`${query.from}T00:00:00+05:45`) : undefined,
            lte: query.to ? new Date(`${query.to}T23:59:59+05:45`) : undefined,
          },
        }),
      };

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        prisma.auditLog.count({ where }),
      ]);

      const actorIds = [...new Set(logs.map((l) => l.actorId).filter((id): id is string => Boolean(id)))];
      const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true } });
      const names = new Map(actors.map((a) => [a.id, a.fullName]));

      return {
        items: logs.map((log) => ({
          id: log.id,
          action: log.action,
          entityType: log.entityType,
          entityId: log.entityId,
          actor: log.actorId ? (names.get(log.actorId) ?? "Unknown user") : "System",
          oldValue: log.oldValue,
          newValue: log.newValue,
          ip: log.ip,
          createdAt: log.createdAt,
        })),
        total,
        page: query.page,
        pageSize: query.pageSize,
      };
    },
  }),
]);
