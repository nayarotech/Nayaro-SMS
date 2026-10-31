import { env } from "../../config/env.js";
import { AppError, notFound } from "../../lib/errors.js";
import { prisma, type Db } from "../../lib/prisma.js";

/**
 * Schools buy a plan for a number of students. Only ACTIVE students count, so
 * students who left, transferred or graduated free up places. The limit is set
 * by the platform owner (super admin); null means no limit.
 */

/** Warn the school when this share of the plan is used. */
const NEAR_LIMIT = 0.9;

export function activeStudentCount(schoolId: string, db: Db = prisma) {
  return db.student.count({ where: { schoolId, status: "ACTIVE" } });
}

export async function getPlan(schoolId: string, db: Db = prisma) {
  const school = await db.school.findUnique({ where: { id: schoolId }, select: { studentLimit: true } });
  if (!school) throw notFound("School");
  const activeStudents = await activeStudentCount(schoolId, db);
  const limit = school.studentLimit;
  return {
    studentLimit: limit,
    activeStudents,
    remaining: limit === null ? null : Math.max(0, limit - activeStudents),
    full: limit !== null && activeStudents >= limit,
    nearLimit: limit !== null && activeStudents >= Math.ceil(limit * NEAR_LIMIT),
    salesContact: env.SALES_CONTACT || null,
  };
}

/**
 * Refuses to add students beyond the plan. Call inside the transaction that
 * creates or reactivates them, so two admissions at once can't both slip through.
 */
export async function assertStudentCapacity(schoolId: string, adding: number, db: Db = prisma) {
  const plan = await getPlan(schoolId, db);
  if (plan.studentLimit === null || plan.activeStudents + adding <= plan.studentLimit) return;
  const contact = plan.salesContact ? ` Contact ${plan.salesContact} to upgrade your plan.` : " Contact us to upgrade your plan.";
  throw new AppError(
    403,
    "STUDENT_LIMIT_REACHED",
    `Your plan allows ${plan.studentLimit} active students and you have ${plan.activeStudents}.${contact}`,
    { studentLimit: plan.studentLimit, activeStudents: plan.activeStudents, salesContact: plan.salesContact },
  );
}
