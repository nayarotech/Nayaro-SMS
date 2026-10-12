import { prisma, type Db } from "../../lib/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";

/**
 * In-app notifications. Every alert (absence, results published…) is stored here
 * first; push notifications and WhatsApp can be sent from the same place later.
 */

export interface NotificationInput {
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function notifyUsers(schoolId: string, userIds: string[], notification: NotificationInput, db: Db = prisma) {
  const unique = [...new Set(userIds)];
  if (!unique.length) return;
  await db.notification.createMany({
    data: unique.map((userId) => ({ schoolId, userId, ...notification, data: notification.data as Prisma.InputJsonValue | undefined })),
  });
}

/** User ids of a student's guardians (parents who can log in). */
export async function guardianUserIds(studentIds: string[], db: Db = prisma): Promise<Map<string, string[]>> {
  const links = await db.studentGuardian.findMany({
    where: { studentId: { in: studentIds } },
    select: { studentId: true, guardian: { select: { userId: true } } },
  });
  const map = new Map<string, string[]>();
  for (const link of links) map.set(link.studentId, [...(map.get(link.studentId) ?? []), link.guardian.userId]);
  return map;
}

export async function listNotifications(userId: string, page: number, pageSize: number) {
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, total, unread, page, pageSize };
}

export async function markRead(userId: string, ids?: string[]) {
  await prisma.notification.updateMany({ where: { userId, readAt: null, ...(ids && { id: { in: ids } }) }, data: { readAt: new Date() } });
}
