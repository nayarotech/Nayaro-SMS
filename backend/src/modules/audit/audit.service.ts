import type { Db } from "../../lib/prisma.js";
import { prisma } from "../../lib/prisma.js";

/** Who is performing an action. Built by the HTTP layer for every authenticated request. */
export interface Actor {
  userId: string;
  schoolId: string;
  ip?: string;
}

export interface AuditEntry {
  /** "<entity>.<verb>", e.g. "student.update", "role.permissions.update" */
  action: string;
  entityType: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
}

/**
 * Write an audit log row. Pass the transaction client (`db`) when the change
 * itself happens inside a transaction so both are committed together.
 */
export async function recordAudit(actor: Actor, entry: AuditEntry, db: Db = prisma): Promise<void> {
  await db.auditLog.create({
    data: {
      schoolId: actor.schoolId,
      actorId: actor.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      oldValue: toJson(entry.oldValue),
      newValue: toJson(entry.newValue),
      ip: actor.ip,
    },
  });
}

/** Strip undefined and convert Dates so the value fits a JSON column. */
function toJson(value: unknown) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}
