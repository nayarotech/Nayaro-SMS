import type { Readable } from "node:stream";

/** Storage keys are relative paths, independent of the storage provider. */
export interface StorageDriver {
  save(key: string, data: Buffer, mimeType: string): Promise<void>;
  read(key: string): Promise<Readable>;
  remove(key: string): Promise<void>;
  getUrl(key: string): string;
}
