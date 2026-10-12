import NepaliDateModule from "nepali-date-converter";

// The package is CommonJS; under Node ESM the class ends up on `.default`.
const NepaliDate = ((NepaliDateModule as unknown as { default?: typeof NepaliDateModule }).default ??
  NepaliDateModule) as unknown as typeof NepaliDateModule.default;

/**
 * Bikram Sambat ⇄ AD helpers. All dates here are plain "YYYY-MM-DD" strings
 * (no time, no timezone), which is how the API sends and receives dates.
 */

const pad = (n: number) => String(n).padStart(2, "0");

function parseParts(value: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid date "${value}", expected YYYY-MM-DD`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** "2025-04-14" (AD) → "2082-01-01" (BS) */
export function adToBs(adDate: string): string {
  const [year, month, day] = parseParts(adDate);
  const bs = new NepaliDate(new Date(year, month - 1, day)).getBS();
  return `${bs.year}-${pad(bs.month + 1)}-${pad(bs.date)}`;
}

/** "2082-01-01" (BS) → "2025-04-14" (AD) */
export function bsToAd(bsDate: string): string {
  const [year, month, day] = parseParts(bsDate);
  const ad = new NepaliDate(year, month - 1, day).getAD();
  return `${ad.year}-${pad(ad.month + 1)}-${pad(ad.date)}`;
}

/** Prisma returns @db.Date columns as Date at UTC midnight → "YYYY-MM-DD" */
export function toDateString(date: Date): string;
export function toDateString(date: Date | null | undefined): string | null;
export function toDateString(date: Date | null | undefined): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

/** "YYYY-MM-DD" → Date at UTC midnight, for writing @db.Date columns */
export function fromDateString(value: string): Date {
  parseParts(value);
  return new Date(`${value}T00:00:00.000Z`);
}

/** Today's date in Nepal (UTC+5:45) as "YYYY-MM-DD" (AD). */
export function todayInNepal(): string {
  const nepalNow = new Date(Date.now() + (5 * 60 + 45) * 60 * 1000);
  return nepalNow.toISOString().slice(0, 10);
}

/**
 * A date or timestamp → "25 Aswin 2083" (BS), using Nepal's calendar day.
 * Timestamps are shifted to Nepal time (UTC+5:45) first.
 */
export function formatBsLong(value: string | Date, language: "en" | "ne" = "en"): string {
  const date = typeof value === "string" ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value) : value;
  const nepal = new Date(date.getTime() + (5 * 60 + 45) * 60 * 1000);
  const [y, m, d] = nepal.toISOString().slice(0, 10).split("-").map(Number);
  return new NepaliDate(new Date(y, m - 1, d)).format("D MMMM YYYY", language === "ne" ? "np" : "en");
}

export const BS_MONTHS = ["Baisakh", "Jestha", "Asar", "Shrawan", "Bhadra", "Aswin", "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"];

/** All AD dates in a BS month, e.g. (2083, 6) → Aswin 2083 = ["2026-09-17", …]. */
export function bsMonthDates(bsYear: number, bsMonth: number): { ad: string; bsDay: number }[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = bsToAd(`${bsYear}-${pad(bsMonth)}-01`);
  const nextStart = bsMonth === 12 ? bsToAd(`${bsYear + 1}-01-01`) : bsToAd(`${bsYear}-${pad(bsMonth + 1)}-01`);
  const dates: { ad: string; bsDay: number }[] = [];
  for (let t = Date.parse(`${start}T00:00:00Z`), day = 1; t < Date.parse(`${nextStart}T00:00:00Z`); t += 86_400_000, day++) {
    dates.push({ ad: new Date(t).toISOString().slice(0, 10), bsDay: day });
  }
  return dates;
}
