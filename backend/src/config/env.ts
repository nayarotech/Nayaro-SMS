import "dotenv/config";
import { z } from "zod";

/**
 * All environment variables, validated once at startup.
 * Add new variables here (and to .env.example) — never read process.env elsewhere.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  /**
   * School websites are served at /sites/<CODE>. Optionally also at <code>.<SITES_BASE_DOMAIN>
   * (e.g. "schools.example.com" with a wildcard DNS record) and at each school's custom domain.
   */
  SITES_BASE_DOMAIN: z.string().optional(),
  /** Public base URL of this API, used to build file links. */
  PUBLIC_API_URL: z.string().default("http://localhost:4000"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((value) => value.split(",").map((origin) => origin.trim())),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  OTP_SECRET: z.string().min(32),

  STORAGE_DRIVER: z.enum(["local"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  UPLOAD_MAX_MB: z.coerce.number().default(10),

  /** Chrome/Chromium used to make PDFs (report cards, receipts). Found automatically if empty. */
  PDF_CHROME_PATH: z.string().optional(),

  SMS_PROVIDER: z.enum(["console", "sparrow"]).default("console"),
  SPARROW_SMS_TOKEN: z.string().optional(),
  SPARROW_SMS_FROM: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables:", z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
