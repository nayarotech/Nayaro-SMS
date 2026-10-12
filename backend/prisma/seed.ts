/**
 * Demo data. Run with `npm run db:seed` (safe to run again — it skips what exists).
 *
 * Logins created (password for all staff: Password@123):
 *   Super admin    superadmin@sms.local / SuperAdmin@123  (from .env)
 *   School admin   admin@demo.school
 *   Principal      ramesh@demo.school
 *   Teacher        sunita@demo.school  (class + subject teacher)
 *   Teacher+parent deepak@demo.school  (also a parent at the school)
 *   Parents (app)  school code DEMO + phone 9811000145 or 9811000099 / Parent@123
 */
import "dotenv/config";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import { redis } from "../src/lib/redis.js";
import { createSchool } from "../src/modules/schools/school.service.js";
import { buildDemoSchool } from "./demo-data.js";
import { buildDemoWebsite } from "./demo-website.js";
import { buildDemoAcademics } from "./demo-academics.js";
import { buildDemoHistory } from "./demo-history.js";
import { buildDemoOptionalSubjects } from "./demo-options.js";

export const DEMO_PASSWORD = "Password@123";
const DEMO_SCHOOL_CODE = "DEMO";

async function seedSuperAdmin() {
  const email = (process.env.SEED_SUPER_ADMIN_EMAIL ?? "superadmin@sms.local").toLowerCase();
  const existing = await prisma.user.findFirst({ where: { email, isSuperAdmin: true } });
  if (existing) return;

  await prisma.user.create({
    data: {
      fullName: "Platform Owner",
      email,
      isSuperAdmin: true,
      passwordHash: await hashPassword(process.env.SEED_SUPER_ADMIN_PASSWORD ?? "SuperAdmin@123"),
    },
  });
  console.log(`✔ Super admin: ${email}`);
}

async function seedDemoSchool() {
  const existing = await prisma.school.findUnique({ where: { code: DEMO_SCHOOL_CODE } });
  const schoolId = existing?.id ?? (await createDemoSchool());

  const admin = await prisma.user.findFirstOrThrow({ where: { schoolId, email: "admin@demo.school" } });

  // Fill the school with demo data only if it has none yet
  if (!(await prisma.academicYear.count({ where: { schoolId } }))) {
    const result = await buildDemoSchool(schoolId, admin.id, DEMO_PASSWORD);
    console.log(`✔ Demo data: ${result.staff} staff, ${result.students} students. Parent OTP login: ${result.firstParentPhone}`);
  }

  if (await buildDemoAcademics({ userId: admin.id, schoolId })) console.log("✔ Demo attendance (last 2 months), a proxy teacher, and exams with marks");
  if (await buildDemoHistory({ userId: admin.id, schoolId })) console.log("✔ Demo history: last year's classes and final exam, promotion into this year, next year (2084), student notes");
  if (await buildDemoOptionalSubjects({ userId: admin.id, schoolId })) console.log("✔ Demo optional subjects: Grade 9–10 choose Computer or Account");
  // Demo parents who sign in to the app with a password (school code DEMO)
  for (const phone of ["9811000145", "9811000099"]) {
    const parent = await prisma.user.findFirst({ where: { schoolId, phone, passwordHash: null } });
    if (parent) await prisma.user.update({ where: { id: parent.id }, data: { passwordHash: await hashPassword("Parent@123") } });
  }

  if (await buildDemoWebsite({ userId: admin.id, schoolId })) console.log("✔ Demo website: http://localhost:4000/sites/DEMO");
}

async function createDemoSchool() {
  const school = await createSchool({
    name: "Shree Demo Secondary School",
    code: DEMO_SCHOOL_CODE,
    address: "Baneshwor, Kathmandu",
    phone: "01-4567890",
    email: "info@demo.school",
    admin: { fullName: "Sita Sharma", email: "admin@demo.school", phone: "9800000001", password: DEMO_PASSWORD },
  });
  console.log(`✔ School: ${school.name} (admin@demo.school / ${DEMO_PASSWORD})`);
  return school.id;
}

async function main() {
  await seedSuperAdmin();
  await seedDemoSchool();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => Promise.allSettled([prisma.$disconnect(), redis.quit()]));
