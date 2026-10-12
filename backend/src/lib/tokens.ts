import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/** Payload of the short-lived access token (sent as "Authorization: Bearer …"). */
export interface AccessTokenPayload {
  sub: string; // user id
  schoolId: string | null;
  sa?: boolean; // super admin
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

/** Short-lived token used between "which school?" and the final login step. */
export function signSelectionToken(userIds: string[]): string {
  return jwt.sign({ userIds }, env.JWT_ACCESS_SECRET, { expiresIn: "5m", audience: "school-selection" });
}

export function verifySelectionToken(token: string): string[] {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { audience: "school-selection" }) as {
    userIds: string[];
  };
  return payload.userIds;
}

/** Refresh tokens are random strings; only their SHA-256 hash is stored. */
export function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
