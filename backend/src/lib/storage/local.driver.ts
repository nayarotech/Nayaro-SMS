import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, open, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";
import type { StorageDriver } from "./storage.driver.js";

const LINK_TTL_SECONDS = 3600;

function validateKey(key: string) {
  if (!key || key.includes("\\") || key.includes("\0") || key.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Invalid storage key");
  }
}

function signature(key: string, exp: number): string {
  return createHmac("sha256", env.JWT_ACCESS_SECRET).update(`local-file\n${exp}\n${key}`).digest("hex");
}

/** Private links are bound to both the file key and their expiry time. */
export function verifyLocalSignature(key: string, exp: number, sig: string): boolean {
  try {
    validateKey(key);
    if (!Number.isSafeInteger(exp) || exp <= Math.floor(Date.now() / 1000) || !/^[a-f0-9]{64}$/.test(sig)) return false;
    return timingSafeEqual(Buffer.from(signature(key, exp), "hex"), Buffer.from(sig, "hex"));
  } catch {
    return false;
  }
}

export class LocalStorageDriver implements StorageDriver {
  private readonly root: string;

  constructor(directory = env.STORAGE_LOCAL_DIR) {
    this.root = path.resolve(directory);
  }

  private filePath(key: string): string {
    validateKey(key);
    return path.join(this.root, ...key.split("/"));
  }

  async save(key: string, data: Buffer, _mimeType: string): Promise<void> {
    const target = this.filePath(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
  }

  async read(key: string) {
    // Open before returning so missing-file errors reject this promise.
    const file = await open(this.filePath(key), "r");
    return file.createReadStream();
  }

  async remove(key: string): Promise<void> {
    await rm(this.filePath(key), { force: true });
  }

  getUrl(key: string): string {
    validateKey(key);
    const exp = Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS;
    const query = new URLSearchParams({ key, exp: String(exp), sig: signature(key, exp) });
    return `${env.PUBLIC_API_URL.replace(/\/$/, "")}/api/files/raw?${query}`;
  }
}
