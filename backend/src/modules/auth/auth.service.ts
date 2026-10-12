import { randomUUID } from "node:crypto";
import { env, isProduction } from "../../config/env.js";
import { badRequest, unauthorized } from "../../lib/errors.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";
import {
  generateRefreshToken,
  hashToken,
  signAccessToken,
  signSelectionToken,
  verifySelectionToken,
} from "../../lib/tokens.js";
import { fileUrl } from "../../lib/storage/index.js";
import type { AuthContext } from "../../http/auth-context.js";
import { getSchoolSettings, mergeWithDefaults } from "../settings/settings.service.js";
import * as otp from "./otp.service.js";

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Every login ends in one of two results:
 * - "ok": the person has exactly one matching account → tokens
 * - "select_school": the same phone/email has accounts in several schools →
 *   the client shows the list and calls /auth/select-school
 */
export type LoginResult =
  | ({ status: "ok" } & SessionTokens)
  | { status: "select_school"; selectionToken: string; accounts: { userId: string; schoolName: string; schoolCode: string }[] };

const accountSelect = {
  id: true,
  passwordHash: true,
  isSuperAdmin: true,
  school: { select: { id: true, name: true, code: true, isActive: true } },
} as const;

type Account = { id: string; passwordHash: string | null; isSuperAdmin: boolean; school: { id: string; name: string; code: string; isActive: boolean } | null };

// ─── Password login ──────────────────────────────────────────

/**
 * With a school code, only that school's accounts are considered — so a parent whose
 * children are in two schools signs in to the right one. Without it (web admin,
 * platform admins) every matching account is found and the user picks a school.
 */
const inSchool = (schoolCode?: string) => (schoolCode ? { school: { code: schoolCode.trim().toUpperCase() } } : {});

export async function loginWithPassword(identifier: string, password: string, meta: RequestMeta, schoolCode?: string): Promise<LoginResult> {
  const lookup = identifier.includes("@")
    ? { email: identifier.trim().toLowerCase() }
    : { phone: identifier.replace(/[\s-]/g, "").replace(/^\+?977/, "") };

  const candidates = await prisma.user.findMany({ where: { ...lookup, isActive: true, ...inSchool(schoolCode) }, select: accountSelect });

  const matches: Account[] = [];
  for (const account of candidates) {
    if (account.passwordHash && (await verifyPassword(password, account.passwordHash))) matches.push(account);
  }

  return finishLogin(activeAccounts(matches), meta, schoolCode ? "Incorrect school code, email/phone or password" : "Incorrect email/phone or password");
}

// ─── Phone + OTP login ───────────────────────────────────────

/** Always answers the same way whether or not the phone exists, so numbers can't be probed. */
export async function requestOtp(phone: string, schoolCode?: string): Promise<{ sent: true; devCode?: string }> {
  const accounts = await otpEnabledAccounts(phone, schoolCode);
  if (accounts.length === 0) return { sent: true };

  const appName = accounts.length === 1 && accounts[0].school ? accounts[0].school.name : "School";
  const code = await otp.sendOtp(phone, appName);

  // Handy for local testing with SMS_PROVIDER=console; never returned in production.
  return !isProduction && env.SMS_PROVIDER === "console" ? { sent: true, devCode: code } : { sent: true };
}

export async function loginWithOtp(phone: string, code: string, meta: RequestMeta, schoolCode?: string): Promise<LoginResult> {
  await otp.verifyOtp(phone, code);
  return finishLogin(await otpEnabledAccounts(phone, schoolCode), meta, "No account found for this phone number");
}

async function otpEnabledAccounts(phone: string, schoolCode?: string): Promise<Account[]> {
  const accounts = activeAccounts(
    await prisma.user.findMany({ where: { phone, isActive: true, isSuperAdmin: false, ...inSchool(schoolCode) }, select: accountSelect }),
  );
  const allowed: Account[] = [];
  for (const account of accounts) {
    const settings = await getSchoolSettings(account.school!.id);
    if (settings["security.otpLoginEnabled"]) allowed.push(account);
  }
  return allowed;
}

// ─── Choosing a school ───────────────────────────────────────

export async function selectSchool(selectionToken: string, userId: string, meta: RequestMeta): Promise<SessionTokens> {
  let allowedIds: string[];
  try {
    allowedIds = verifySelectionToken(selectionToken);
  } catch {
    throw unauthorized("Selection expired, please log in again");
  }
  if (!allowedIds.includes(userId)) throw unauthorized();
  return issueSession(userId, meta);
}

async function finishLogin(accounts: Account[], meta: RequestMeta, failureMessage: string): Promise<LoginResult> {
  if (accounts.length === 0) throw unauthorized(failureMessage);
  if (accounts.length === 1) return { status: "ok", ...(await issueSession(accounts[0].id, meta)) };

  return {
    status: "select_school",
    selectionToken: signSelectionToken(accounts.map((a) => a.id)),
    accounts: accounts.map((a) => ({
      userId: a.id,
      schoolName: a.school?.name ?? "Platform administration",
      schoolCode: a.school?.code ?? "",
    })),
  };
}

/** Drop accounts whose school is suspended (super admins have no school). */
function activeAccounts(accounts: Account[]): Account[] {
  return accounts.filter((a) => a.isSuperAdmin || a.school?.isActive);
}

// ─── Sessions & refresh tokens ───────────────────────────────

const refreshExpiry = () => new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

async function issueSession(userId: string, meta: RequestMeta, familyId: string = randomUUID()): Promise<SessionTokens> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
    select: { id: true, schoolId: true, isSuperAdmin: true },
  });

  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      familyId,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiry(),
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 500),
    },
  });

  return {
    accessToken: signAccessToken({ sub: user.id, schoolId: user.schoolId, sa: user.isSuperAdmin || undefined }),
    refreshToken,
  };
}

/**
 * Exchange a refresh token for new tokens. The old token is marked used.
 * Presenting an already-used token means it was stolen and replayed, so every
 * token in that login session ("family") is revoked.
 */
export async function refreshSession(refreshToken: string, meta: RequestMeta): Promise<SessionTokens> {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: { user: { select: { isActive: true } } },
  });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date() || !stored.user.isActive) {
    throw unauthorized("Session expired, please log in again");
  }

  if (stored.usedAt) {
    await revokeFamily(stored.familyId);
    throw unauthorized("Session expired, please log in again");
  }

  await prisma.refreshToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } });
  return issueSession(stored.userId, meta, stored.familyId);
}

export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
  if (stored) await revokeFamily(stored.familyId);
}

async function revokeFamily(familyId: string) {
  await prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
}

// ─── Current user ────────────────────────────────────────────

/** Everything the web/mobile app needs after login to build its UI. */
export async function getCurrentUser(auth: AuthContext) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: auth.userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      photoKey: true,
      preferredLanguage: true,
      isSuperAdmin: true,
      passwordHash: true,
      roles: { select: { role: { select: { key: true, name: true } } } },
    },
  });

  const school = auth.schoolId
    ? await prisma.school.findUnique({
        where: { id: auth.schoolId },
        select: { id: true, name: true, code: true, address: true, phone: true, email: true, logoKey: true, settings: true },
      })
    : null;

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    photoUrl: fileUrl(user.photoKey),
    preferredLanguage: user.preferredLanguage,
    isSuperAdmin: user.isSuperAdmin,
    hasPassword: Boolean(user.passwordHash),
    roles: user.roles.map((r) => r.role),
    permissions: [...auth.permissions].sort(),
    school: school && {
      id: school.id,
      name: school.name,
      code: school.code,
      address: school.address,
      phone: school.phone,
      email: school.email,
      logoUrl: fileUrl(school.logoKey),
    },
    settings: school ? mergeWithDefaults(school.settings) : null,
  };
}

export async function updateOwnProfile(userId: string, data: { fullName?: string; preferredLanguage?: string }) {
  await prisma.user.update({ where: { id: userId }, data });
}

export async function changePassword(userId: string, currentPassword: string | undefined, newPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true, schoolId: true } });

  if (user.passwordHash) {
    if (!currentPassword || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw badRequest("Current password is incorrect");
    }
  }

  if (user.schoolId) {
    const settings = await getSchoolSettings(user.schoolId);
    const minLength = settings["security.passwordMinLength"] as number;
    if (newPassword.length < minLength) throw badRequest(`Password must be at least ${minLength} characters`);
  }

  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } });
}
