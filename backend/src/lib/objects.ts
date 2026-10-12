/** Copy only the given keys from an object — used to record "old values" in the audit log. */
export function pickKeys<T extends object>(source: T, keys: string[]): Partial<T> {
  return Object.fromEntries(Object.entries(source).filter(([key]) => keys.includes(key))) as Partial<T>;
}
