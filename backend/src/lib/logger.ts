import { pino } from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : "info",
  transport: env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
  // Never log credentials or tokens
  redact: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.otp", "*.refreshToken"],
});
