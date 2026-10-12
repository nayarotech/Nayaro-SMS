import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";
import { formatBsLong, toDateString } from "../../lib/nepali-date.js";
import { prisma } from "../../lib/prisma.js";
import { publicFileUrl } from "../files/file.service.js";
import { SYSTEM_ROLE_KEYS } from "../permissions/default-roles.js";
import { getSchoolSettings } from "../settings/settings.service.js";
import { getBlock } from "./renderer/blocks/index.js";
import { renderBlocks, renderDocument } from "./renderer/document.js";
import { html, type SafeHtml } from "./renderer/html.js";
import { menuItems, normalizeFooter, normalizeHeader } from "./renderer/layout.js";
import * as systemPages from "./renderer/system-pages.js";
import { normalizeTheme } from "./renderer/theme.js";
import type { AlbumSummary, Block, PostSummary, RenderContext, SiteData } from "./renderer/types.js";
import type { WebsitePostType } from "../../generated/prisma/client.js";

/**
 * Renders the public website. A "site" is loaded once per request (school,
 * website settings, published pages), then the URL path decides what to show:
 *   /                 home page        /notices, /news, /events (+ /:slug)
 *   /<page-slug>      a built page     /gallery (+ /:album)
 *   /sitemap.xml, /robots.txt
 */

export type LoadedSite = NonNullable<Awaited<ReturnType<typeof loadSite>>>;

export async function loadSite(where: { schoolCode: string } | { domain: string }) {
  const website =
    "domain" in where
      ? await prisma.website.findUnique({ where: { customDomain: where.domain }, include: { school: true } })
      : await prisma.website.findFirst({ where: { school: { code: where.schoolCode.toUpperCase() } }, include: { school: true } });
  if (!website || !website.school.isActive) return null;

  const settings = await getSchoolSettings(website.schoolId);
  if (settings["modules.website"] === false) return null;

  const pages = await prisma.websitePage.findMany({
    where: { websiteId: website.id, status: "PUBLISHED" },
    orderBy: [{ isHome: "desc" }, { menuOrder: "asc" }],
    select: { id: true, title: true, slug: true, isHome: true, showInMenu: true, seoTitle: true, seoDescription: true, publishedBlocks: true },
  });
  return { website, school: website.school, settings, pages };
}

interface RenderResult {
  status: number;
  html: string;
  contentType?: string;
}

/** `basePath` is "/sites/CODE" for platform URLs, "" on the school's own domain. */
export async function renderSitePath(site: LoadedSite, path: string, query: URLSearchParams, basePath: string, origin: string): Promise<RenderResult> {
  const segments = path.split("/").filter(Boolean);
  const [first, second] = segments;

  if (!site.website.isPublished) {
    return page(site, basePath, origin, path, 200, "Coming soon", systemPages.messagePage("Coming soon", "Our new website is being prepared. Please check back soon.", baseContext(site, basePath, emptyData())), "noindex");
  }

  if (first === "sitemap.xml") return { status: 200, html: sitemap(site, origin + basePath), contentType: "application/xml" };
  if (first === "robots.txt") return { status: 200, html: `User-agent: *\nAllow: /\nSitemap: ${origin}${basePath}/sitemap.xml\n`, contentType: "text/plain" };

  const POST_SECTIONS: Record<string, WebsitePostType> = { notices: "NOTICE", news: "NEWS", events: "EVENT" };
  if (first && POST_SECTIONS[first]) {
    const type = POST_SECTIONS[first];
    if (second) {
      const post = await prisma.websitePost.findFirst({ where: { schoolId: site.school.id, type, slug: second, status: "PUBLISHED" } });
      if (!post) return notFound(site, basePath, origin, path);
      const ctx = baseContext(site, basePath, emptyData());
      const attachments = ((post.attachments as { title: string; fileKey: string }[]) ?? []).map((a) => ({ title: a.title, url: publicFileUrl(a.fileKey) }));
      return page(site, basePath, origin, path, 200, post.title, systemPages.postDetailPage({ ...toPostSummary(post), content: post.content, attachments }, ctx), undefined, post.excerpt ?? undefined, post.coverImageKey);
    }
    const pageNumber = Math.max(1, Number(query.get("page")) || 1);
    const { posts, hasMore } = await loadPosts(site.school.id, type, pageNumber);
    const title = { NOTICE: "Notices", NEWS: "News", EVENT: "Events" }[type];
    return page(site, basePath, origin, path, 200, title, systemPages.postListPage(type, posts, baseContext(site, basePath, emptyData()), pageNumber, hasMore));
  }

  if (first === "gallery") {
    const albums = await loadAlbums(site.school.id);
    const ctx = baseContext(site, basePath, emptyData());
    if (second) {
      const album = albums.find((a) => a.slug === second);
      if (!album) return notFound(site, basePath, origin, path);
      const description = (await prisma.galleryAlbum.findUnique({ where: { id: album.id }, select: { description: true } }))?.description ?? null;
      return page(site, basePath, origin, path, 200, album.title, systemPages.albumPage({ ...album, description }, ctx), undefined, description ?? undefined, album.coverKey);
    }
    return page(site, basePath, origin, path, 200, "Gallery", systemPages.albumsPage(albums, ctx));
  }

  const target = first ? site.pages.find((p) => p.slug === first && !p.isHome) : site.pages.find((p) => p.isHome);
  if (!target || segments.length > 1) return notFound(site, basePath, origin, path);

  const blocks = (target.publishedBlocks as unknown as Block[]) ?? [];
  const ctx = baseContext(site, basePath, await loadSiteData(site.school.id, blocks));
  const firstImage = blocks.map((b) => (b.props.image as string | undefined) ?? null).find(Boolean) ?? null;
  return page(site, basePath, origin, path, 200, target.seoTitle || target.title, renderBlocks(blocks, ctx), undefined, target.seoDescription ?? undefined, firstImage, target.isHome);
}

/** Renders one page's draft for the editor's "Preview" button (not cached, not indexed). */
export async function renderDraftPreview(pageId: string, origin: string): Promise<RenderResult | null> {
  const draft = await prisma.websitePage.findUnique({ where: { id: pageId }, include: { website: { include: { school: true } } } });
  if (!draft) return null;
  const site = await loadSite({ schoolCode: draft.website.school.code });
  if (!site) return null;
  const blocks = (draft.draftBlocks as unknown as Block[]) ?? [];
  const basePath = `/sites/${site.school.code}`;
  const ctx = baseContext(site, basePath, await loadSiteData(site.school.id, blocks));
  return page(site, basePath, origin, `${basePath}/${draft.slug}`, 200, `Preview: ${draft.title}`, renderBlocks(blocks, ctx), "noindex");
}

/** Short-lived signed token so the editor can open a preview in a new tab without a login header. */
export function signPreviewToken(pageId: string, ttlSeconds = 600): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `${expires}.${createHmac("sha256", env.JWT_ACCESS_SECRET).update(`preview:${pageId}:${expires}`).digest("hex")}`;
}

export function verifyPreviewToken(pageId: string, token: string): boolean {
  const [expires, signature] = token.split(".");
  if (!expires || !signature || Number(expires) < Date.now() / 1000) return false;
  const expected = Buffer.from(createHmac("sha256", env.JWT_ACCESS_SECRET).update(`preview:${pageId}:${expires}`).digest("hex"));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// ─── Building blocks of a response ───────────────────────────

function baseContext(site: LoadedSite, basePath: string, data: SiteData): RenderContext {
  return {
    site: {
      schoolName: site.school.name,
      schoolCode: site.school.code,
      logoKey: site.school.logoKey,
      address: site.school.address,
      phone: site.school.phone,
      email: site.school.email,
      motto: String(site.settings["branding.motto"] ?? ""),
    },
    data,
    pages: site.pages.map((p) => ({ id: p.id, title: p.title, slug: p.slug })),
    basePath,
    fileUrl: publicFileUrl,
    formatDate: (date) => {
      const display = site.settings["localization.dateDisplay"];
      if (display === "ad") return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      const bs = formatBsLong(date);
      return display === "both" ? `${bs} (${toDateString(new Date(date))})` : bs;
    },
    mode: "public",
  };
}

function page(
  site: LoadedSite,
  basePath: string,
  origin: string,
  path: string,
  status: number,
  title: string,
  body: SafeHtml,
  robots?: string,
  description?: string,
  imageKey?: string | null,
  isHome = false,
): RenderResult {
  const seo = site.website.seo as { title?: string; description?: string; imageKey?: string | null };
  const ctx = baseContext(site, basePath, emptyData());
  const menuPages = site.pages.filter((p) => p.showInMenu);
  const fullTitle = isHome ? seo.title || site.school.name : `${title} | ${seo.title || site.school.name}`;
  const ogImage = imageKey ?? seo.imageKey ?? site.school.logoKey;

  return {
    status,
    html: renderDocument({
      ctx,
      theme: normalizeTheme(site.website.theme),
      header: normalizeHeader(site.website.header),
      footer: normalizeFooter(site.website.footer),
      menu: menuItems(normalizeHeader(site.website.header), menuPages),
      currentPath: `${basePath}${path === "/" ? "" : path}` || "/",
      title: fullTitle,
      description: description || seo.description || site.school.name,
      canonicalUrl: `${origin}${basePath}${path}`,
      ogImageUrl: ogImage ? publicFileUrl(ogImage) : null,
      body,
      robots,
    }),
  };
}

function notFound(site: LoadedSite, basePath: string, origin: string, path: string): RenderResult {
  const ctx = baseContext(site, basePath, emptyData());
  return page(site, basePath, origin, path, 404, "Page not found", systemPages.messagePage("404", "Sorry, we couldn't find that page.", ctx), "noindex");
}

function sitemap(site: LoadedSite, siteUrl: string): string {
  const urls = [
    ...site.pages.map((p) => `${siteUrl}/${p.slug}`),
    ...["notices", "news", "events", "gallery"].map((s) => `${siteUrl}/${s}`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((u) => `<url><loc>${html`${u}`}</loc></url>`)
    .join("")}</urlset>`;
}

// ─── Data for dynamic blocks ─────────────────────────────────

function emptyData(): SiteData {
  return { notices: [], news: [], events: [], albums: [], stats: { students: 0, teachers: 0, classes: 0, parents: 0 } };
}

/** Loads only the live data the page's blocks actually use. */
export async function loadSiteData(schoolId: string, blocks: Block[]): Promise<SiteData> {
  const needs = new Set(blocks.flatMap((b) => getBlock(b.type)?.data ?? []));
  if (blocks.some((b) => b.type === "stats")) needs.add("stats");
  const data = emptyData();

  await Promise.all([
    needs.has("notices") && loadPosts(schoolId, "NOTICE", 1, 10).then((r) => (data.notices = r.posts)),
    needs.has("news") && loadPosts(schoolId, "NEWS", 1, 12).then((r) => (data.news = r.posts)),
    needs.has("events") && loadUpcomingEvents(schoolId).then((posts) => (data.events = posts)),
    needs.has("albums") && loadAlbums(schoolId).then((albums) => (data.albums = albums)),
    needs.has("stats") &&
      Promise.all([
        prisma.student.count({ where: { schoolId, status: "ACTIVE" } }),
        prisma.user.count({ where: { schoolId, isActive: true, roles: { some: { role: { key: { notIn: [SYSTEM_ROLE_KEYS.parent, SYSTEM_ROLE_KEYS.student] } } } } } }),
        prisma.schoolClass.count({ where: { schoolId } }),
        prisma.guardian.count({ where: { schoolId } }),
      ]).then(([students, teachers, classes, parents]) => (data.stats = { students, teachers, classes, parents })),
  ]);
  return data;
}

const PAGE_SIZE = 12;

async function loadPosts(schoolId: string, type: WebsitePostType, page: number, size = PAGE_SIZE) {
  const posts = await prisma.websitePost.findMany({
    where: { schoolId, type, status: "PUBLISHED" },
    orderBy: type === "EVENT" ? [{ eventStart: "desc" }] : [{ isPinned: "desc" }, { publishedAt: "desc" }],
    skip: (page - 1) * size,
    take: size + 1,
  });
  return { posts: posts.slice(0, size).map(toPostSummary), hasMore: posts.length > size };
}

async function loadUpcomingEvents(schoolId: string) {
  const today = new Date(new Date().toISOString().slice(0, 10));
  const posts = await prisma.websitePost.findMany({
    where: { schoolId, type: "EVENT", status: "PUBLISHED", OR: [{ eventStart: { gte: today } }, { eventEnd: { gte: today } }] },
    orderBy: { eventStart: "asc" },
    take: 12,
  });
  return posts.map(toPostSummary);
}

async function loadAlbums(schoolId: string): Promise<AlbumSummary[]> {
  const albums = await prisma.galleryAlbum.findMany({ where: { schoolId, isPublished: true }, orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }] });
  return albums.map((album) => {
    const photos = (album.photos as { key: string; caption?: string }[]) ?? [];
    return { id: album.id, title: album.title, slug: album.slug, coverKey: photos[0]?.key ?? null, photoCount: photos.length, photos };
  });
}

function toPostSummary(post: {
  id: string;
  type: WebsitePostType;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImageKey: string | null;
  isPinned: boolean;
  publishedAt: Date | null;
  eventStart: Date | null;
  eventEnd: Date | null;
  location: string | null;
}): PostSummary {
  return {
    id: post.id,
    type: post.type,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    coverImageKey: post.coverImageKey,
    isPinned: post.isPinned,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    eventStart: toDateString(post.eventStart),
    eventEnd: toDateString(post.eventEnd),
    location: post.location,
  };
}
