import type { Db } from "../../lib/prisma.js";
import { notFound } from "../../lib/errors.js";

export async function findReminderBills(schoolId: string, billIds: string[], db: Db) {
  const bills = await db.feeBill.findMany({
    where: { schoolId, id: { in: billIds } },
    include: { school: { select: { name: true } }, student: { select: { id: true, firstName: true, lastName: true, guardians: {
      where: { guardian: { schoolId, user: { isActive: true, schoolId } } },
      select: { guardian: { select: { user: { select: { id: true, fullName: true, preferredLanguage: true, phone: true } } } } },
    } } } },
    orderBy: { id: "asc" },
  });
  if (bills.length !== billIds.length) throw notFound("Bill");
  return bills;
}

