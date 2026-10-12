import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { env } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

function createPrismaClient() {
  const url = new URL(env.DATABASE_URL);
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    connectionLimit: 10,
    // MySQL 8 uses caching_sha2_password; the mariadb driver needs this to authenticate.
    allowPublicKeyRetrieval: true,
  });
  return new PrismaClient({ adapter });
}

export const prisma = createPrismaClient();

/** Prisma client or an interactive transaction — repositories accept either. */
export type Db = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
