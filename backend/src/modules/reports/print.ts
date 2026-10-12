import { prisma } from "../../lib/prisma.js";
import { publicFileUrl } from "../files/file.service.js";
import { getSchoolSettings } from "../settings/settings.service.js";
import { html, raw, type SafeHtml } from "../website/renderer/html.js";

/**
 * Shared look for everything the school prints or downloads as PDF
 * (registers, report cards, ledgers, later receipts): school logo, name and
 * address at the top in the school's colour.
 */

export interface SchoolLetterhead {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  color: string;
}

export async function getLetterhead(schoolId: string): Promise<SchoolLetterhead> {
  const [school, settings] = await Promise.all([prisma.school.findUniqueOrThrow({ where: { id: schoolId } }), getSchoolSettings(schoolId)]);
  return {
    name: school.name,
    address: school.address,
    phone: school.phone,
    email: school.email,
    logoUrl: school.logoKey ? publicFileUrl(school.logoKey) : null,
    color: String(settings["branding.primaryColor"] ?? "#1d4ed8"),
  };
}

export function letterheadHtml(school: SchoolLetterhead, title: string, subtitle?: string): SafeHtml {
  return html`<header class="lh">
    ${school.logoUrl ? html`<img src="${school.logoUrl}" alt="">` : html`<div class="lh-mark">${school.name.slice(0, 1)}</div>`}
    <div>
      <h1>${school.name}</h1>
      <p>${[school.address, school.phone, school.email].filter(Boolean).join(" · ")}</p>
    </div>
  </header>
  <div class="doc-title"><h2>${title}</h2>${subtitle ? html`<p>${subtitle}</p>` : ""}</div>`;
}

/** A full HTML document ready for htmlToPdf() or the browser's Print. */
export function printDocument(school: SchoolLetterhead, title: string, body: SafeHtml, extraCss = ""): string {
  return `<!doctype html>${html`<html><head><meta charset="utf-8"><title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Noto+Sans+Devanagari:wght@400;600&display=swap">
<style>${raw(`
:root{--brand:${school.color}}
*{box-sizing:border-box}
body{margin:0;font:12px/1.45 Inter,"Noto Sans Devanagari",system-ui,sans-serif;color:#0f172a;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.lh{display:flex;align-items:center;gap:14px;padding-bottom:10px;border-bottom:3px solid var(--brand)}
.lh img{height:58px;width:auto}
.lh-mark{width:52px;height:52px;border-radius:10px;background:var(--brand);color:#fff;display:grid;place-items:center;font-size:24px;font-weight:700}
.lh h1{margin:0;font-size:20px;color:var(--brand)}
.lh p{margin:2px 0 0;color:#475569;font-size:11px}
.doc-title{text-align:center;margin:12px 0 14px}
.doc-title h2{margin:0;font-size:15px;letter-spacing:.06em;text-transform:uppercase}
.doc-title p{margin:3px 0 0;color:#475569}
table{width:calc(100% - 1px);border-collapse:collapse}
th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left}
th{background:#f1f5f9;font-weight:600}
.num{text-align:right;font-variant-numeric:tabular-nums}
.center{text-align:center}
.muted{color:#64748b}
.page-break{page-break-after:always;break-after:page}
${extraCss}`)}</style></head><body>${body}</body></html>`}`;
}
