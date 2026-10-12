import { useCallback } from "react";
import { useAuth } from "./auth";
import { formatDate, type DateDisplay } from "./dates";

/** Formats AD dates according to the school's "Show dates in" setting (BS / AD / both). */
export function useFormatDate() {
  const { user } = useAuth();
  const display = (user?.settings?.["localization.dateDisplay"] as DateDisplay | undefined) ?? "bs";
  return useCallback((ad: string | null | undefined) => formatDate(ad, display), [display]);
}
