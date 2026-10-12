import { z } from "zod";

/** Reusable zod pieces for route definitions. */

export const idParam = z.object({ id: z.uuid() });

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** Nepal mobile numbers: 98XXXXXXXX / 97XXXXXXXX, optionally with +977. Stored without the prefix. */
export const phoneNumber = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, "").replace(/^\+?977/, ""))
  .pipe(z.string().regex(/^9[678]\d{8}$/, "Enter a valid 10-digit mobile number"));

export const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => (value ? value : null));

export const booleanQuery = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === "true"));

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function paginate(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}
