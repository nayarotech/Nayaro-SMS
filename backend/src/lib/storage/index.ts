import { LocalStorageDriver } from "./local.driver.js";
import type { StorageDriver } from "./storage.driver.js";

export type { StorageDriver } from "./storage.driver.js";

// The environment schema currently permits only the local driver.
export const storage: StorageDriver = new LocalStorageDriver();

/** Optional photos/logos stay null when no file has been assigned. */
export function fileUrl(key: string | null | undefined): string | null {
  return key ? storage.getUrl(key) : null;
}
