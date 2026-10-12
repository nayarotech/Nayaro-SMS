import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";
import { cache } from "./storage";

interface State<T> {
  data: T | null;
  offline: boolean;
  error: string | null;
  loading: boolean;
}

/**
 * Loads `path` from the API, showing the last saved copy first so screens
 * open instantly and still work offline. A null path means "nothing to load yet".
 */
export function useCachedFetch<T>(path: string | null) {
  const [state, setState] = useState<State<T>>({ data: null, offline: false, error: null, loading: Boolean(path) });

  const load = useCallback(async () => {
    if (!path) return;
    const cached = await cache.get<T>(path);
    if (cached) setState((s) => ({ ...s, data: cached }));
    try {
      const fresh = await api.get<T>(path);
      setState({ data: fresh, offline: false, error: null, loading: false });
      await cache.set(path, fresh);
    } catch (e) {
      const offline = e instanceof ApiError && e.code === "OFFLINE";
      setState((s) => ({ ...s, offline, error: offline ? null : e instanceof Error ? e.message : "Something went wrong", loading: false }));
    }
  }, [path]);

  useEffect(() => {
    // Loading happens after an await, so state is never set synchronously here
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, [load]);

  return { ...state, reload: load };
}
