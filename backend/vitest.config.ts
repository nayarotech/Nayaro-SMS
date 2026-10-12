import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests use their own database and Redis DB so demo data is never touched
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "mysql://root:root@localhost:3306/sms_test",
      REDIS_URL: "redis://localhost:6379/1",
      STORAGE_LOCAL_DIR: "./storage-test",
      SMS_PROVIDER: "console",
    },
    globalSetup: ["./test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
