import { useEffect, useSyncExternalStore } from "react";
import { api } from "./api";

/** Unread notification count, shared by the Inbox tab badge and the Inbox screen. */
let unread = 0;
const listeners = new Set<() => void>();

export async function refreshUnread(): Promise<void> {
  try {
    const result = await api.get<{ unread: number }>("/notifications?pageSize=1");
    unread = result.unread;
  } catch {
    return; // offline: keep the last known count
  }
  listeners.forEach((listener) => listener());
}

export function clearUnread() {
  unread = 0;
  listeners.forEach((listener) => listener());
}

const REFRESH_MS = 60_000;

export function useUnread(): number {
  useEffect(() => {
    void refreshUnread();
    const timer = setInterval(() => void refreshUnread(), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => unread,
  );
}
