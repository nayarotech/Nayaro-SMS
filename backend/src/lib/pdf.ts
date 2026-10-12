import { existsSync } from "node:fs";
import puppeteer, { type Browser } from "puppeteer-core";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * HTML → PDF using headless Chrome (correct Nepali/Devanagari text, real CSS).
 * Uses an installed Chrome or Chromium: set PDF_CHROME_PATH, or one of the usual
 * install locations is found automatically. In Docker: `apt-get install chromium`.
 */

const CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];

let browser: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  const executablePath = env.PDF_CHROME_PATH || CANDIDATES.find((path) => existsSync(path));
  if (!executablePath) throw new Error("Chrome/Chromium not found for PDF generation. Install it or set PDF_CHROME_PATH.");
  browser ??= puppeteer
    .launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"] })
    .then((b) => {
      // Start a fresh browser next time if this one crashes
      b.on("disconnected", () => (browser = null));
      return b;
    })
    .catch((error) => {
      browser = null;
      throw error;
    });
  return browser;
}

export interface PdfOptions {
  landscape?: boolean;
  format?: "A4" | "A5" | "Letter";
}

export async function htmlToPdf(html: string, options: PdfOptions = {}): Promise<Buffer> {
  const page = await (await getBrowser()).newPage();
  try {
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    // Wait for web fonts (Nepali text) before printing
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({
      format: options.format ?? "A4",
      landscape: options.landscape ?? false,
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch((err) => logger.warn({ err }, "Could not close PDF page"));
  }
}

export async function closePdfBrowser() {
  if (browser) await (await browser).close().catch(() => undefined);
  browser = null;
}
