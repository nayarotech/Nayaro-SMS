/**
 * School website renderer — turns pages (lists of blocks) into HTML.
 *
 * Shared by the server (public website) and the admin web app (page editor,
 * imported through the "@site-renderer" alias), so the editor shows exactly what
 * visitors will see. Keep this folder free of server-only imports
 * (no Prisma, no Node APIs).
 */
export * from "./types.js";
export { html, raw, escapeHtml, SafeHtml } from "./html.js";
export { BLOCKS, getBlock } from "./blocks/index.js";
export { renderBlock, renderBlocks, renderDocument } from "./document.js";
export { renderHeader, renderFooter, menuItems, normalizeHeader, normalizeFooter, DEFAULT_HEADER, DEFAULT_FOOTER } from "./layout.js";
export type { HeaderConfig, FooterConfig, MenuItem } from "./layout.js";
export { THEME_PRESETS, FONTS, DEFAULT_THEME, normalizeTheme, themeCss, googleFontsUrl } from "./theme.js";
export type { Theme } from "./theme.js";
export { SITE_CSS } from "./styles.js";
export { SYSTEM_LINKS, resolveLink } from "./helpers.js";
export { ICON_NAMES, iconSvg } from "./icons.js";
export { PAGE_TEMPLATES, STARTER_SITE, getTemplate, createBlock, newBlockId } from "./templates.js";
export * as systemPages from "./system-pages.js";
