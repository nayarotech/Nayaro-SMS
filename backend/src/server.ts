import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { closePdfBrowser } from "./lib/pdf.js";
import { redis } from "./lib/redis.js";

const server = createApp().listen(env.PORT, () => {
  logger.info(`API running on http://localhost:${env.PORT}  (docs: http://localhost:${env.PORT}/api/docs)`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close();
  await Promise.allSettled([prisma.$disconnect(), redis.quit(), closePdfBrowser()]);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
