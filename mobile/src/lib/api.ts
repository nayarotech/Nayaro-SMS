import { secureStorage } from "./storage";

/**
 * API client for the parent/student/teacher app.
 * Set EXPO_PUBLIC_API_URL in mobile/.env — on a real phone use your computer's
 * LAN address (e.g. http://192.168.1.10:4000), on the Android emulator http://10.0.2.2:4000.
 */
const BASE_URL = `${process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000"}/api`;
const REFRESH_KEY = "sms.refreshToken";

let accessToken: string | null = null;

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function saveSession(tokens: { accessToken: string; refreshToken: string }) {
  accessToken = tokens.accessToken;
  await secureStorage.set(REFRESH_KEY, tokens.refreshToken);
}

export async function clearSession() {
  const refreshToken = await secureStorage.get(REFRESH_KEY);
  accessToken = null;
  await secureStorage.remove(REFRESH_KEY);
  if (refreshToken) await request("POST", "/auth/logout", { refreshToken }, false).catch(() => undefined);
}

let restoring: Promise<boolean> | null = null;

/**
 * Exchange the stored refresh token for a new access token. Returns false if logged out.
 * Calls made at the same time share one refresh: refresh tokens are single-use, and the
 * server logs everyone out if one is used twice (it looks like a stolen token).
 */
export function restoreSession(): Promise<boolean> {
  restoring ??= refreshOnce().finally(() => {
    restoring = null;
  });
  return restoring;
}

async function refreshOnce(): Promise<boolean> {
  const refreshToken = await secureStorage.get(REFRESH_KEY);
  if (!refreshToken) return false;
  try {
    const tokens = await request<{ accessToken: string; refreshToken: string }>("POST", "/auth/refresh", { refreshToken }, false);
    await saveSession(tokens);
    return true;
  } catch (error) {
    // Only forget the session if the server rejected it — not when offline
    if (error instanceof ApiError && error.status === 401) await secureStorage.remove(REFRESH_KEY);
    return false;
  }
}

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  let response: Response;
  try {
    response = await fetch(BASE_URL + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "OFFLINE", "No internet connection");
  }

  if (response.status === 401 && retry && (await restoreSession())) return request<T>(method, path, body, false);
  if (response.status === 204) return undefined as T;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, data?.error?.code ?? "ERROR", data?.error?.message ?? "Something went wrong");
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
};
