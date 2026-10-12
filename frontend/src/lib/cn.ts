import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Join class names; later Tailwind classes override earlier ones (e.g. "w-full" + "w-40" → "w-40"). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
