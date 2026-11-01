import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config.js";

// Run financial integration tests without loading unrelated application modules.
export default mergeConfig(base, defineConfig({ test: {
  include: ["test/fees.test.ts", "test/bulk-fees.test.ts", "test/fee-reminders.test.ts", "test/sms-provider.test.ts", "test/fee-reports.test.ts", "test/payment-reversals.test.ts", "test/recurring-fees.test.ts", "test/fee-scheduler.test.ts"],
  env: {
    JWT_ACCESS_SECRET: "fee-tests-access-secret-at-least-32-characters",
    JWT_REFRESH_SECRET: "fee-tests-refresh-secret-at-least-32-characters",
    OTP_SECRET: "fee-tests-otp-secret-at-least-32-characters",
  },
} }));
