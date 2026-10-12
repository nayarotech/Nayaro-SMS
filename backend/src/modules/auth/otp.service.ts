import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";
import { tooManyRequests, unauthorized } from "../../lib/errors.js";
import { redis } from "../../lib/redis.js";
import { sms } from "../../lib/sms/index.js";

/**
 * One-time passwords for phone login, kept in Redis (never in the database).
 * Codes are stored as an HMAC, expire after 5 minutes, allow 5 wrong tries,
 * and can be re-sent once a minute.
 */

const OTP_TTL_SECONDS = 5 * 60;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

const codeKey = (phone: string) => `otp:code:${phone}`;
const cooldownKey = (phone: string) => `otp:cooldown:${phone}`;

const hashCode = (phone: string, code: string) =>
  createHmac("sha256", env.OTP_SECRET).update(`${phone}:${code}`).digest("hex");

/** Generates and sends a code. Returns the code so dev builds can show it. */
export async function sendOtp(phone: string, appName: string): Promise<string> {
  const coolingDown = await redis.set(cooldownKey(phone), "1", "EX", RESEND_COOLDOWN_SECONDS, "NX");
  if (coolingDown === null) throw tooManyRequests("Please wait a minute before requesting another code");

  const code = String(randomInt(100000, 1000000));
  await redis.set(codeKey(phone), JSON.stringify({ hash: hashCode(phone, code), attempts: 0 }), "EX", OTP_TTL_SECONDS);
  await sms.send(phone, `${code} is your ${appName} login code. It expires in 5 minutes. Do not share it.`);
  return code;
}

/** Throws if the code is wrong or expired. A correct code can only be used once. */
export async function verifyOtp(phone: string, code: string): Promise<void> {
  const raw = await redis.get(codeKey(phone));
  if (!raw) throw unauthorized("Code expired, please request a new one");

  const stored = JSON.parse(raw) as { hash: string; attempts: number };
  const expected = Buffer.from(stored.hash);
  const given = Buffer.from(hashCode(phone, code));

  if (expected.length === given.length && timingSafeEqual(expected, given)) {
    await redis.del(codeKey(phone));
    return;
  }

  stored.attempts += 1;
  if (stored.attempts >= MAX_ATTEMPTS) {
    await redis.del(codeKey(phone));
    throw unauthorized("Too many wrong attempts, please request a new code");
  }
  await redis.set(codeKey(phone), JSON.stringify(stored), "KEEPTTL");
  throw unauthorized("Incorrect code");
}
