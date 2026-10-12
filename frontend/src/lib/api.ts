/**
 * Small fetch wrapper for the SMS API.
 *
 * - Keeps the access token in memory only (never localStorage).
 * - The refresh token lives in an httpOnly cookie set by the API. When a call
 *   returns 401, we refresh once and retry.
 * - Errors are thrown as ApiError with the API's { code, message, details }.
 */

const BASE_URL = `${import.meta.env.VITE_API_URL ?? ""}/api`;

let accessToken: string | null = null;
/** Super admins can act inside a school; this is sent as X-School-Id. */
let actingSchoolId: string | null = sessionStorageGet("actingSchoolId");
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setActingSchoolId(schoolId: string | null) {
  actingSchoolId = schoolId;
  sessionStorageSet("actingSchoolId", schoolId);
}

export function getActingSchoolId() {
  return actingSchoolId;
}

export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> };

  constructor(status: number, code: string, message: string, details?: ApiError["details"]) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  query?: Query;
  body?: unknown;
  /** Skip the automatic refresh-and-retry (used by the auth calls themselves). */
  noRetry?: boolean;
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { "X-Client": "web" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (actingSchoolId) headers["X-School-Id"] = actingSchoolId;

  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetch(BASE_URL + path + toQueryString(options.query), {
    method,
    headers,
    body,
    credentials: "include",
  });

  if (response.status === 401 && !options.noRetry && (await refreshAccessToken())) {
    return request<T>(method, path, { ...options, noRetry: true });
  }

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && !options.noRetry) onSessionExpired?.();
    const error = data?.error ?? {};
    throw new ApiError(response.status, error.code ?? "ERROR", error.message ?? "Request failed", error.details);
  }
  return data as T;
}

let refreshing: Promise<boolean> | null = null;

/** Uses the refresh cookie to get a new access token. Concurrent callers share one request. */
export function refreshAccessToken(): Promise<boolean> {
  refreshing ??= fetch(`${BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "X-Client": "web", "Content-Type": "application/json" },
    body: "{}",
    credentials: "include",
  })
    .then(async (response) => {
      if (!response.ok) return false;
      setAccessToken((await response.json()).accessToken);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

function toQueryString(query?: Query) {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

function sessionStorageGet(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function sessionStorageSet(key: string, value: string | null) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // storage unavailable (private mode) — the value just won't survive a reload
  }
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "body">) =>
    request<T>("POST", path, { ...options, body }),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body }),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

/**
 * Downloads a file from the API (Excel, PDF…) with the user's login.
 * `open: true` shows it in a new tab (PDFs) instead of saving it.
 */
export async function downloadFile(path: string, query?: Query, options: { open?: boolean } = {}) {
  // Open the tab straight away so pop-up blockers allow it
  const tab = options.open ? window.open("about:blank", "_blank") : null;
  const fetchFile = () =>
    fetch(BASE_URL + path + toQueryString(query), {
      headers: { "X-Client": "web", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(actingSchoolId ? { "X-School-Id": actingSchoolId } : {}) },
      credentials: "include",
    });
  let response = await fetchFile();
  if (response.status === 401 && (await refreshAccessToken())) response = await fetchFile();
  if (!response.ok) {
    tab?.close();
    const error = (await response.json().catch(() => null))?.error ?? {};
    throw new ApiError(response.status, error.code ?? "ERROR", error.message ?? "Download failed");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  if (tab) {
    tab.location.href = url;
  } else {
    const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "download";
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Upload a file; returns the key to store on a record. */
export function uploadFile(file: File, purpose: string) {
  const form = new FormData();
  form.append("purpose", purpose);
  form.append("file", file);
  return api.post<{ id: string; key: string; url: string; originalName: string }>("/files", form);
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
