import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, clearSession, restoreSession, saveSession } from "./api";
import { cache } from "./storage";
import type { Child, Me } from "./types";

interface SessionState {
  status: "loading" | "signedOut" | "signedIn";
  me: Me | null;
  children: Child[];
  selectedChild: Child | null;
  selectChild: (childId: string) => void;
  signIn: (tokens: { accessToken: string; refreshToken: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children: content }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionState["status"]>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [meData, childData] = await Promise.all([api.get<Me>("/auth/me"), api.get<Child[]>("/my/children")]);
    setMe(meData);
    setChildren(childData);
    await Promise.all([cache.set("me", meData), cache.set("children", childData)]);
  }, []);

  // Start from the offline cache, then refresh from the server when online
  useEffect(() => {
    (async () => {
      const [cachedMe, cachedChildren, cachedSelected] = await Promise.all([
        cache.get<Me>("me"),
        cache.get<Child[]>("children"),
        cache.get<string>("selectedChild"),
      ]);
      if (cachedMe) {
        setMe(cachedMe);
        setChildren(cachedChildren ?? []);
        setSelectedId(cachedSelected);
      }

      const restored = await restoreSession();
      if (restored) {
        await load().catch(() => undefined);
        setStatus("signedIn");
      } else {
        // Offline with a cached session: keep showing cached data
        setStatus(cachedMe ? "signedIn" : "signedOut");
      }
    })();
  }, [load]);

  const value = useMemo<SessionState>(
    () => ({
      status,
      me,
      children,
      selectedChild: children.find((c) => c.id === selectedId) ?? children[0] ?? null,
      selectChild: (childId) => {
        setSelectedId(childId);
        void cache.set("selectedChild", childId);
      },
      signIn: async (tokens) => {
        await saveSession(tokens);
        await load();
        setStatus("signedIn");
      },
      signOut: async () => {
        await clearSession();
        await cache.clear();
        setMe(null);
        setChildren([]);
        setStatus("signedOut");
      },
      refresh: load,
    }),
    [status, me, children, selectedId, load],
  );

  return <SessionContext.Provider value={value}>{content}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside <SessionProvider>");
  return context;
}
