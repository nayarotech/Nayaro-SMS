import { execSync } from "node:child_process";

/** Apply migrations to the test database (creates it if needed) before any test runs. */
export default function setup() {
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: "mysql://root:root@localhost:3306/sms_test" },
  });
}
