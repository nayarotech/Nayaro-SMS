import type { Request, Response } from "express";
import { z } from "zod";
import { isProduction } from "../../config/env.js";
import { unauthorized } from "../../lib/errors.js";
import { defineModule, route } from "../../http/route.js";
import { authLimiter, otpLimiter, refreshLimiter } from "../../http/rate-limit.js";
import { phoneNumber } from "../../http/schemas.js";
import * as authService from "./auth.service.js";

/**
 * Web vs mobile:
 * - The web app sends `X-Client: web`. Its refresh token is kept in an httpOnly
 *   cookie (JavaScript can't read it) and left out of the JSON response.
 * - The mobile app gets the refresh token in the response body and keeps it in secure storage.
 */
const REFRESH_COOKIE = "sms_rt";
const schoolCode = z.string().trim().min(2).max(12);

const isWebClient = (req: Request) => req.header("x-client") === "web";
const requestMeta = (req: Request) => ({ ip: req.ip, userAgent: req.header("user-agent") });

function sendTokens(req: Request, res: Response, tokens: authService.SessionTokens) {
  if (!isWebClient(req)) return tokens;
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/api/auth",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  return { accessToken: tokens.accessToken };
}

function sendLoginResult(req: Request, res: Response, result: authService.LoginResult) {
  if (result.status !== "ok") return result;
  return { status: "ok", ...sendTokens(req, res, result) };
}

export const authModule = defineModule("/auth", "Auth", [
  route({
    method: "post",
    path: "/login",
    summary: "Log in with email or phone + password",
    access: "public",
    middleware: [authLimiter],
    description: "The mobile app always sends `schoolCode`; without it, an account that exists in several schools gets a school choice.",
    body: z.object({ identifier: z.string().trim().min(3), password: z.string().min(1), schoolCode: schoolCode.optional() }),
    handler: async ({ body, req, res }) =>
      sendLoginResult(req, res, await authService.loginWithPassword(body.identifier, body.password, requestMeta(req), body.schoolCode)),
  }),

  route({
    method: "post",
    path: "/otp/request",
    summary: "Send a login code by SMS",
    description: "Responds the same whether or not the number has an account.",
    access: "public",
    middleware: [otpLimiter],
    body: z.object({ phone: phoneNumber, schoolCode: schoolCode.optional() }),
    handler: ({ body }) => authService.requestOtp(body.phone, body.schoolCode),
  }),

  route({
    method: "post",
    path: "/otp/verify",
    summary: "Log in with phone + SMS code",
    access: "public",
    middleware: [authLimiter],
    body: z.object({ phone: phoneNumber, code: z.string().regex(/^\d{6}$/), schoolCode: schoolCode.optional() }),
    handler: async ({ body, req, res }) =>
      sendLoginResult(req, res, await authService.loginWithOtp(body.phone, body.code, requestMeta(req), body.schoolCode)),
  }),

  route({
    method: "post",
    path: "/select-school",
    summary: "Finish login when the account exists in several schools",
    access: "public",
    middleware: [authLimiter],
    body: z.object({ selectionToken: z.string(), userId: z.uuid() }),
    handler: async ({ body, req, res }) =>
      sendTokens(req, res, await authService.selectSchool(body.selectionToken, body.userId, requestMeta(req))),
  }),

  route({
    method: "post",
    path: "/refresh",
    summary: "Get a new access token",
    description: "Mobile sends `refreshToken` in the body; the web app's cookie is used automatically.",
    access: "public",
    middleware: [refreshLimiter],
    body: z.object({ refreshToken: z.string().optional() }),
    handler: async ({ body, req, res }) => {
      const token = body.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
      if (!token) throw unauthorized("Not logged in");
      return sendTokens(req, res, await authService.refreshSession(token, requestMeta(req)));
    },
  }),

  route({
    method: "post",
    path: "/logout",
    summary: "Log out (revokes the refresh token)",
    access: "public",
    body: z.object({ refreshToken: z.string().optional() }),
    handler: async ({ body, req, res }) => {
      await authService.logout(body.refreshToken ?? req.cookies?.[REFRESH_COOKIE]);
      res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    },
  }),

  route({
    method: "get",
    path: "/me",
    summary: "Current user, school, roles, permissions and school settings",
    access: "user",
    handler: ({ auth }) => authService.getCurrentUser(auth),
  }),

  route({
    method: "patch",
    path: "/me",
    summary: "Update own name or language",
    access: "user",
    body: z.object({
      fullName: z.string().trim().min(2).max(120).optional(),
      preferredLanguage: z.enum(["en", "ne"]).optional(),
    }),
    handler: ({ auth, body }) => authService.updateOwnProfile(auth.userId, body),
  }),

  route({
    method: "post",
    path: "/change-password",
    summary: "Change or set own password",
    access: "user",
    middleware: [authLimiter],
    body: z.object({ currentPassword: z.string().optional(), newPassword: z.string().min(8).max(128) }),
    handler: ({ auth, body }) => authService.changePassword(auth.userId, body.currentPassword, body.newPassword),
  }),
]);
