import { cx, html, safeUrl, type SafeHtml } from "./html.js";
import { asString, button, icon, isExternal, resolveLink } from "./helpers.js";
import type { RenderContext } from "./types.js";

/** Header and footer settings, edited under Website → Header & footer. */

export interface MenuItem {
  id: string;
  label: string;
  link: string;
  children?: MenuItem[];
}

export interface HeaderConfig {
  showTopBar: boolean;
  /** Short message on the left of the top bar, e.g. "Admissions open for 2083" */
  topBarText: string;
  /** true = menu built automatically from the pages; false = the custom `menu` below */
  autoMenu: boolean;
  menu: MenuItem[];
  ctaLabel: string;
  ctaLink: string;
}

export interface FooterConfig {
  about: string;
  columns: { title: string; links: { label: string; link: string }[] }[];
  social: { facebook: string; youtube: string; instagram: string };
  copyright: string;
}

export const DEFAULT_HEADER: HeaderConfig = {
  showTopBar: true,
  topBarText: "Admissions open for the new academic year",
  autoMenu: true,
  menu: [],
  ctaLabel: "Apply now",
  ctaLink: "#admission",
};

export const DEFAULT_FOOTER: FooterConfig = {
  about: "A community school committed to quality education, strong values and every child's success.",
  columns: [
    {
      title: "Quick links",
      links: [
        { label: "Notices", link: "/notices" },
        { label: "News", link: "/news" },
        { label: "Events", link: "/events" },
        { label: "Gallery", link: "/gallery" },
      ],
    },
  ],
  social: { facebook: "", youtube: "", instagram: "" },
  copyright: "",
};

export function normalizeHeader(value: unknown): HeaderConfig {
  return { ...DEFAULT_HEADER, ...((value as Partial<HeaderConfig>) ?? {}) };
}

export function normalizeFooter(value: unknown): FooterConfig {
  const footer = (value as Partial<FooterConfig>) ?? {};
  return { ...DEFAULT_FOOTER, ...footer, social: { ...DEFAULT_FOOTER.social, ...(footer.social ?? {}) } };
}

/** The menu visitors see: the custom one, or Home + menu pages + Notices. */
export function menuItems(header: HeaderConfig, menuPages: { id: string; title: string; isHome: boolean }[]): MenuItem[] {
  if (!header.autoMenu && header.menu.length) return header.menu;
  return [
    ...menuPages.map((page) => ({ id: page.id, label: page.isHome ? "Home" : page.title, link: `page:${page.id}` })),
    { id: "notices", label: "Notices", link: "/notices" },
  ];
}

function brand(ctx: RenderContext): SafeHtml {
  const initials = ctx.site.schoolName
    .split(" ")
    .filter((w) => /^[A-Z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  return html`<a class="brand" href="${ctx.basePath || "/"}">
    ${ctx.site.logoKey ? html`<img src="${ctx.fileUrl(ctx.site.logoKey)}" alt="">` : html`<span class="brand-mark">${initials || "S"}</span>`}
    <span class="brand-text"><strong>${ctx.site.schoolName}</strong>${ctx.site.motto ? html`<small>${ctx.site.motto}</small>` : ""}</span>
  </a>`;
}

function link(item: MenuItem, ctx: RenderContext, currentPath: string) {
  const href = resolveLink(item.link, ctx);
  const active = href === currentPath || (href !== (ctx.basePath || "/") && currentPath.startsWith(`${href}/`));
  return html`<a href="${href}" class="${cx(active && "active")}"${isExternal(href) ? html` target="_blank" rel="noopener"` : ""}>${item.label}${item.children?.length ? icon("chevron-down", 14) : ""}</a>`;
}

/** "facebook.com/ourschool" → "https://facebook.com/ourschool" */
function externalUrl(value: string) {
  return safeUrl(/^https?:\/\//i.test(value) ? value : `https://${value}`);
}

function socialLinks(footer: FooterConfig) {
  const links = (["facebook", "youtube", "instagram"] as const).filter((network) => footer.social[network]);
  if (!links.length) return html``;
  return html`<div class="social">${links.map(
    (network) => html`<a href="${externalUrl(footer.social[network])}" target="_blank" rel="noopener" aria-label="${network}">${icon(network, 18)}</a>`,
  )}</div>`;
}

export function renderHeader(header: HeaderConfig, footer: FooterConfig, menu: MenuItem[], ctx: RenderContext, currentPath: string): SafeHtml {
  const { phone, email } = ctx.site;
  return html`
    ${header.showTopBar
      ? html`<div class="topbar"><div class="container">
          <div class="topbar-items">
            ${header.topBarText ? html`<span>${icon("megaphone", 15)} ${header.topBarText}</span>` : ""}
          </div>
          <div class="topbar-items">
            ${phone ? html`<a href="tel:${phone}">${icon("phone", 15)} ${phone}</a>` : ""}
            ${email ? html`<a href="mailto:${email}">${icon("mail", 15)} ${email}</a>` : ""}
            ${socialLinks(footer)}
          </div>
        </div></div>`
      : ""}
    <header class="site-header">
      <div class="container">
        ${brand(ctx)}
        <nav class="nav" aria-label="Main"><ul>${menu.map(
          (item) => html`<li>${link(item, ctx, currentPath)}${item.children?.length
            ? html`<ul class="submenu">${item.children.map((child) => html`<li>${link(child, ctx, currentPath)}</li>`)}</ul>`
            : ""}</li>`,
        )}</ul></nav>
        <span class="header-cta">${button(header.ctaLabel, header.ctaLink, ctx, "primary")}</span>
        <button class="menu-toggle" type="button" aria-label="Menu" aria-expanded="false" data-menu-toggle>${icon("menu", 22)}</button>
      </div>
      <nav class="mobile-nav" data-mobile-nav aria-label="Mobile"><ul>${menu.map(
        (item) => html`<li>${link(item, ctx, currentPath)}${item.children?.length
          ? html`<ul>${item.children.map((child) => html`<li>${link(child, ctx, currentPath)}</li>`)}</ul>`
          : ""}</li>`,
      )}</ul><div class="container">${button(header.ctaLabel, header.ctaLink, ctx, "primary")}</div></nav>
    </header>`;
}

export function renderFooter(footer: FooterConfig, ctx: RenderContext): SafeHtml {
  const { address, phone, email, schoolName } = ctx.site;
  const year = new Date().getFullYear();
  return html`<footer class="site-footer">
    <div class="container footer-grid" style="--footer-cols:${Math.max(1, footer.columns.length)}">
      <div>
        <div class="footer-brand">${ctx.site.logoKey ? html`<img src="${ctx.fileUrl(ctx.site.logoKey)}" alt="">` : ""}${schoolName}</div>
        <p>${footer.about}</p>
        <div style="margin-top:18px">${socialLinks(footer)}</div>
      </div>
      ${footer.columns.map(
        (column) => html`<div><h4>${column.title}</h4><ul>${column.links.map(
          (l) => html`<li><a href="${resolveLink(l.link, ctx)}">${l.label}</a></li>`,
        )}</ul></div>`,
      )}
      <div>
        <h4>Contact</h4>
        <ul class="footer-contact">
          ${address ? html`<li>${icon("map-pin", 16)}<span>${address}</span></li>` : ""}
          ${phone ? html`<li>${icon("phone", 16)}<a href="tel:${phone}">${phone}</a></li>` : ""}
          ${email ? html`<li>${icon("mail", 16)}<a href="mailto:${email}">${email}</a></li>` : ""}
        </ul>
      </div>
    </div>
    <div class="container footer-bottom">
      <span>${asString(footer.copyright) || `© ${year} ${schoolName}. All rights reserved.`}</span>
      <span>Powered by School Management System</span>
    </div>
  </footer>`;
}
