import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalStorageDriver, verifyLocalSignature } from "../src/lib/storage/local.driver.js";
import { fileUrl } from "../src/lib/storage/index.js";

let directory: string;
let driver: LocalStorageDriver;
beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "nayaro-storage-"));
  driver = new LocalStorageDriver(directory);
});
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

describe("local file storage", () => {
  it("saves, streams and removes uploaded bytes in nested folders", async () => {
    const key = "schools/test/homework/worksheet.pdf";
    const bytes = Buffer.from("worksheet content");
    await driver.save(key, bytes, "application/pdf");
    const chunks: Buffer[] = [];
    for await (const chunk of await driver.read(key)) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(bytes);
    await driver.remove(key);
    await driver.remove(key);
    await expect(driver.read(key)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("refuses paths outside the storage root", async () => {
    for (const key of ["", "../secret", "/etc/passwd", "schools/../../secret", "schools\\secret", "schools//secret", "schools/./secret", "bad\0key"]) {
      await expect(driver.save(key, Buffer.from("bad"), "text/plain")).rejects.toThrow("Invalid storage key");
      await expect(driver.read(key)).rejects.toThrow("Invalid storage key");
      await expect(driver.remove(key)).rejects.toThrow("Invalid storage key");
      expect(() => driver.getUrl(key)).toThrow("Invalid storage key");
    }
  });
  it("encodes keys and rejects expired or tampered download links", () => {
    const key = "schools/test/documents/notes & अभ्यास.pdf";
    const url = new URL(driver.getUrl(key));
    const exp = Number(url.searchParams.get("exp"));
    const sig = url.searchParams.get("sig")!;
    expect(url.pathname).toBe("/api/files/raw");
    expect(url.searchParams.get("key")).toBe(key);
    expect(verifyLocalSignature(key, exp, sig)).toBe(true);
    expect(verifyLocalSignature("schools/other/private.pdf", exp, sig)).toBe(false);
    expect(verifyLocalSignature(key, exp + 1, sig)).toBe(false);
    expect(verifyLocalSignature(key, Math.floor(Date.now() / 1000) - 1, sig)).toBe(false);
    expect(verifyLocalSignature(key, exp, "invalid")).toBe(false);
    expect(verifyLocalSignature(key, exp, "0".repeat(64))).toBe(false);
    expect(verifyLocalSignature("../secret", exp, sig)).toBe(false);
    expect(verifyLocalSignature(key, Infinity, sig)).toBe(false);
  });
  it("keeps unassigned photos and logos null", () => {
    expect(fileUrl(null)).toBeNull();
    expect(fileUrl(undefined)).toBeNull();
    expect(fileUrl("")).toBeNull();
    expect(fileUrl("schools/test/logo.png")).toContain("/api/files/raw?");
  });
});
