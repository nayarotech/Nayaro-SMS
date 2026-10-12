import type { SchoolSettings } from "./types";

const DEFAULT_BRAND = "#2563eb";

/** Applies the school's primary colour (settings → branding.primaryColor) to the whole UI. */
export function applyBranding(settings: SchoolSettings | null) {
  const color = (settings?.["branding.primaryColor"] as string | undefined) ?? DEFAULT_BRAND;
  document.documentElement.style.setProperty("--brand", color);
}
