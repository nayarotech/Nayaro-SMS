import NepaliDate from "nepali-date-converter";

/**
 * Date display. The API always uses AD "YYYY-MM-DD"; the school's
 * "localization.dateDisplay" setting decides whether people see BS, AD or both.
 */

export type DateDisplay = "bs" | "ad" | "both";

const pad = (n: number) => String(n).padStart(2, "0");

function parse(value: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** "2025-04-14" → "2082-01-01" */
export function adToBs(ad: string): string | null {
  const parts = parse(ad);
  if (!parts) return null;
  try {
    const bs = new NepaliDate(new Date(parts[0], parts[1] - 1, parts[2])).getBS();
    return `${bs.year}-${pad(bs.month + 1)}-${pad(bs.date)}`;
  } catch {
    return null;
  }
}

/** "2082-01-01" → "2025-04-14" */
export function bsToAd(bs: string): string | null {
  const parts = parse(bs);
  if (!parts) return null;
  try {
    const ad = new NepaliDate(parts[0], parts[1] - 1, parts[2]).getAD();
    return `${ad.year}-${pad(ad.month + 1)}-${pad(ad.date)}`;
  } catch {
    return null;
  }
}

/** Long BS format, e.g. "1 Baisakh 2082" (or in Nepali script). */
export function formatBsLong(ad: string, language: "en" | "ne" = "en"): string {
  const parts = parse(ad);
  if (!parts) return ad;
  try {
    return new NepaliDate(new Date(parts[0], parts[1] - 1, parts[2])).format("D MMMM YYYY", language === "ne" ? "np" : "en");
  } catch {
    return ad;
  }
}

export function formatDate(ad: string | null | undefined, display: DateDisplay = "bs"): string {
  if (!ad) return "—";
  const day = ad.slice(0, 10);
  const bs = adToBs(day);
  if (display === "ad" || !bs) return day;
  if (display === "bs") return `${bs} BS`;
  return `${bs} BS (${day})`;
}

export function todayAd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
