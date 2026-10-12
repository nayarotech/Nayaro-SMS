import { cx, html, raw, safeUrl, type SafeHtml } from "./html.js";
import { iconSvg } from "./icons.js";
import type { Block, RenderContext } from "./types.js";

/**
 * Link values used by blocks and menus:
 *   "page:<pageId>"   another page of the website
 *   "/notices"        a built-in page (notices, news, events, gallery, contact form…)
 *   "#section"        an anchor on the same page
 *   "https://…", "tel:…", "mailto:…"
 */
export function resolveLink(link: unknown, ctx: RenderContext): string {
  const value = typeof link === "string" ? link.trim() : "";
  if (!value) return "#";
  if (value.startsWith("page:")) {
    const page = ctx.pages.find((p) => p.id === value.slice(5));
    return page ? `${ctx.basePath}/${page.slug}` : "#";
  }
  if (value.startsWith("/")) return `${ctx.basePath}${value}`;
  return safeUrl(value);
}

/** Built-in pages that every website has, for link pickers and menus. */
export const SYSTEM_LINKS = [
  { value: "/notices", label: "Notices" },
  { value: "/news", label: "News" },
  { value: "/events", label: "Events" },
  { value: "/gallery", label: "Gallery" },
];

export function isExternal(href: string) {
  return /^https?:/i.test(href);
}

export function button(label: unknown, link: unknown, ctx: RenderContext, variant: "primary" | "secondary" | "light" = "primary"): SafeHtml {
  if (!label) return html``;
  const href = resolveLink(link, ctx);
  return html`<a class="${cx("btn", `btn-${variant}`)}" href="${href}"${raw(isExternal(href) ? ' target="_blank" rel="noopener"' : "")}>${String(label)}</a>`;
}

export function icon(name: unknown, size = 24) {
  return raw(iconSvg(String(name || "star"), size));
}

export function image(key: unknown, alt: unknown, ctx: RenderContext, className = ""): SafeHtml {
  if (!key) return html`<div class="${cx("img-placeholder", className)}">${icon("image", 32)}</div>`;
  return html`<img class="${className}" src="${ctx.fileUrl(String(key))}" alt="${String(alt ?? "")}" loading="lazy" decoding="async">`;
}

/** Optional small label + heading + intro shown above most sections. */
export function sectionHeading(props: { eyebrow?: unknown; heading?: unknown; intro?: unknown }, align: "center" | "left" = "center"): SafeHtml {
  if (!props.heading && !props.eyebrow && !props.intro) return html``;
  return html`<header class="${cx("section-heading", align === "left" && "is-left")}">
    ${props.eyebrow ? html`<p class="eyebrow">${String(props.eyebrow)}</p>` : ""}
    ${props.heading ? html`<h2>${String(props.heading)}</h2>` : ""}
    ${props.intro ? html`<p class="intro">${String(props.intro)}</p>` : ""}
  </header>`;
}

/** Wraps every block in a <section> with its background, spacing and anchor. */
export function sectionWrapper(block: Block, inner: SafeHtml, ctx: RenderContext): SafeHtml {
  const style = block.style ?? {};
  const background = style.background ?? "default";
  const bgImage = background === "image" && style.backgroundImage ? ` style="--section-image:url('${ctx.fileUrl(style.backgroundImage)}')"` : "";
  return html`<section
    class="${cx("block", `block-${block.type}`, `bg-${background}`, `pad-${style.padding ?? "md"}`, style.hideOnMobile && "hide-mobile")}"
    ${raw(style.anchor ? `id="${escapeAttr(style.anchor)}"` : "")}
    data-block-id="${block.id}"${raw(bgImage)}
  >${inner}</section>`;
}

function escapeAttr(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

/** Shortens text to `max` characters on a word boundary. */
export function truncate(text: string | null | undefined, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, text.lastIndexOf(" ", max) > 0 ? text.lastIndexOf(" ", max) : max)}…`;
}

export const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
export const asString = (value: unknown): string => (typeof value === "string" ? value : "");
export const asNumber = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
