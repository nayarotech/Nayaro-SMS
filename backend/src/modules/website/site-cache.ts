import { redis } from "../../lib/redis.js";
import { logger } from "../../lib/logger.js";

/**
 * Public pages are cached in Redis for a few minutes. Each school has a
 * "version" number that's bumped whenever anything on its website changes,
 * which makes every cached page for that school stale at once.
 */
const TTL_SECONDS = 300;
const versionKey = (schoolId: string) => `site:${schoolId}:version`;

export async function bumpSiteVersion(schoolId: string): Promise<void> {
  await redis.incr(versionKey(schoolId)).catch((err) => logger.warn({ err }, "Could not bump site cache version"));
}

/** Returns the cached HTML, or renders, caches and returns it. Still works (uncached) if Redis is down. */
export async function cachedPage(schoolId: string, path: string, render: () => Promise<{ status: number; html: string }>) {
  let key: string | null = null;
  try {
    const version = (await redis.get(versionKey(schoolId))) ?? "0";
    key = `site:${schoolId}:${version}:${path}`;
    const cached = await redis.get(key);
    if (cached) return { status: 200, html: cached, cached: true };
  } catch (err) {
    logger.warn({ err }, "Site cache unavailable");
  }

  const result = await render();
  // Only successful pages are cached; errors and 404s are rendered every time
  if (key && result.status === 200) await redis.set(key, result.html, "EX", TTL_SECONDS).catch(() => undefined);
  return { ...result, cached: false };
}
