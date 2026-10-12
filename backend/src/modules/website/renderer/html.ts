/**
 * A tiny HTML templating helper.
 *
 *   html`<h1>${title}</h1>`        → `title` is escaped (safe for user text)
 *   html`<div>${raw(trusted)}</div>` → inserted as-is (only for sanitised rich text / our own markup)
 *
 * Nested html`` results and arrays of them are inserted without double-escaping.
 * This file has no dependencies so it runs both on the server and in the browser editor.
 */

export class SafeHtml {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

export const raw = (value: string) => new SafeHtml(value);

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

type Value = SafeHtml | string | number | boolean | null | undefined | Value[];

function toHtml(value: Value): string {
  if (value === null || value === undefined || value === false || value === true) return "";
  if (Array.isArray(value)) return value.map(toHtml).join("");
  if (value instanceof SafeHtml) return value.value;
  return escapeHtml(value);
}

export function html(strings: TemplateStringsArray, ...values: Value[]): SafeHtml {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += toHtml(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/** Only allow http(s), mailto, tel, relative and anchor links — never javascript: */
export function safeUrl(url: string | null | undefined): string {
  const value = (url ?? "").trim();
  if (!value) return "#";
  if (/^(https?:|mailto:|tel:|\/|#|\?)/i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return "#";
  return value;
}

/** class names from conditional parts: cx("a", cond && "b") */
export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");
