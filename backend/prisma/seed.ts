/**
 * Creates the platform owner (super admin) account. Run with `npm run db:seed`;
 * safe to run again. Email and password come from SEED_SUPER_ADMIN_EMAIL and
 * SEED_SUPER_ADMIN_PASSWORD in .env. Schools are then created from the dashboard.
 */
import "dotenv/config";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import { redis } from "../src/lib/redis.js";

async function seedSuperAdmin() {
  const email = (process.env.SEED_SUPER_ADMIN_EMAIL ?? "superadmin@sms.local").toLowerCase();
  const existing = await prisma.user.findFirst({ where: { email, isSuperAdmin: true } });
  if (existing) {
    console.log(`✔ Super admin already exists: ${email}`);
    return;
  }

  await prisma.user.create({
    data: {
      fullName: "Platform Owner",
      email,
      isSuperAdmin: true,
      passwordHash: await hashPassword(process.env.SEED_SUPER_ADMIN_PASSWORD ?? "SuperAdmin@123"),
    },
  });
  console.log(`✔ Super admin created: ${email}`);
}

seedSuperAdmin()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => Promise.allSettled([prisma.$disconnect(), redis.quit()]));
