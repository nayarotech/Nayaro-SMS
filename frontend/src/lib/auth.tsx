import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, refreshAccessToken, setAccessToken, setActingSchoolId, setSessionExpiredHandler } from "./api";
import { applyBranding } from "./branding";
import i18n from "./i18n";
import type { CurrentUser } from "./types";

interface AuthState {
  user: CurrentUser | null;
  /** True until we know whether there is a session (first page load). */
  loading: boolean;
  /** Call after a successful login with the returned access token. */
  completeLogin: (accessToken: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Reload the current user (after changing roles, settings, school profile…). */
  reload: () => Promise<void>;
  can: (permission: string | string[]) => boolean;
  /** Is a module (settings "modules.x") switched on for this school? */
  moduleEnabled: (module: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const loadUser = useCallback(async () => {
    const me = await api.get<CurrentUser>("/auth/me");
    setUser(me);
    applyBranding(me.settings);
    const language = (me.preferredLanguage || me.settings?.["localization.defaultLanguage"] || "en") as string;
    if (i18n.language !== language) void i18n.changeLanguage(language);
  }, []);

  // On first load, try to restore the session from the refresh cookie.
  useEffect(() => {
    refreshAccessToken()
      .then((ok) => (ok ? loadUser() : undefined))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [loadUser]);

  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
  }, []);

  const value = useMemo<AuthState>(() => {
    const permissions = new Set(user?.permissions ?? []);
    return {
      user,
      loading,
      completeLogin: async (accessToken) => {
        setAccessToken(accessToken);
        await loadUser();
      },
      logout: async () => {
        await api.post("/auth/logout", {}, { noRetry: true }).catch(() => undefined);
        setAccessToken(null);
        setActingSchoolId(null);
        queryClient.clear();
        setUser(null);
      },
      reload: loadUser,
      can: (permission) => [permission].flat().some((p) => permissions.has(p)),
      moduleEnabled: (module) => user?.settings?.[`modules.${module}`] !== false,
    };
  }, [user, loading, loadUser, queryClient]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
