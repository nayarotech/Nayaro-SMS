import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";

/**
 * In-memory limits — fine for a single server. When running more than one
 * API instance, switch these to a Redis store (rate-limit-redis).
 */
const skip = () => env.NODE_ENV === "test";

/** Password/OTP login attempts: 20 per 15 minutes per IP. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip,
  message: { error: { code: "TOO_MANY_REQUESTS", message: "Too many attempts, try again in a few minutes" } },
});

/** Token refresh happens on every page load, so it gets a looser limit: 200 per 15 minutes per IP. */
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip,
  message: { error: { code: "TOO_MANY_REQUESTS", message: "Too many requests, try again in a few minutes" } },
});

/** OTP requests: 5 per 15 minutes per IP (each one sends an SMS). */
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip,
  message: { error: { code: "TOO_MANY_REQUESTS", message: "Too many OTP requests, try again later" } },
});

/** Everything else: 300 requests per minute per IP. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip,
});
