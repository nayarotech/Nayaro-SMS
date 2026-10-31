import type { HomeworkStatus } from "./types";

export const HOMEWORK_STATUS: Record<HomeworkStatus, { label: "hwDone" | "hwPartial" | "hwNotDone"; color: string; soft: string }> = {
  DONE: { label: "hwDone", color: "#15803d", soft: "#dcfce7" },
  PARTIAL: { label: "hwPartial", color: "#b45309", soft: "#fef3c7" },
  NOT_DONE: { label: "hwNotDone", color: "#b91c1c", soft: "#fee2e2" },
};

/** YYYY-MM-DD plus some days (dates only, no time zone surprises). */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
