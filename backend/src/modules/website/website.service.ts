import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { assertFileBelongsToSchool, publicFileUrl } from "../files/file.service.js";
import { getSchoolSettings } from "../settings/settings.service.js";
import { DEFAULT_FOOTER, DEFAULT_HEADER, normalizeFooter, normalizeHeader } from "./renderer/layout.js";
import { getTemplate, STARTER_SITE } from "./renderer/templates.js";
import { DEFAULT_THEME, normalizeTheme } from "./renderer/theme.js";
import type { Block } from "./renderer/types.js";
import { collectImageKeys, sanitizeBlocks } from "./sanitize.js";
import { bumpSiteVersion } from "./site-cache.js";
import { RESERVED_SLUGS } from "./website.schemas.js";
import { Prisma } from "../../generated/prisma/client.js";

const MAX_REVISIONS = 20;

// ─── Website (theme, header, footer, SEO, publish) ───────────

/** The school's website, created with sensible defaults the first time it's opened. */
export async function getOrCreateWebsite(schoolId: string) {
  const existing = await prisma.website.findUnique({ where: { schoolId } });
  if (existing) return existing;
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId } });
  return prisma.website.create({
    data: {
      schoolId,
      theme: DEFAULT_THEME as unknown as Prisma.InputJsonValue,
      header: DEFAULT_HEADER as unknown as Prisma.InputJsonValue,
      footer: DEFAULT_FOOTER as unknown as Prisma.InputJsonValue,
      seo: { title: school.name, description: `Official website of ${school.name}.`, imageKey: null },
    },
  });
}

export async function getWebsiteOverview(schoolId: string) {
  const website = await getOrCreateWebsite(schoolId);
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { code: true } });
  const [pages, posts, albums, newEnquiries] = await Promise.all([
    listPages(schoolId),
    prisma.websitePost.groupBy({ by: ["type"], where: { schoolId, status: "PUBLISHED" }, _count: { _all: true } }),
    prisma.galleryAlbum.count({ where: { schoolId } }),
    prisma.websiteEnquiry.count({ where: { schoolId, status: "NEW" } }),
  ]);

  return {
    ...toWebsiteDto(website),
    schoolCode: school.code,
    pages,
    counts: {
      notices: posts.find((p) => p.type === "NOTICE")?._count._all ?? 0,
      news: posts.find((p) => p.type === "NEWS")?._count._all ?? 0,
      events: posts.find((p) => p.type === "EVENT")?._count._all ?? 0,
      albums,
      newEnquiries,
    },
  };
}

export interface WebsiteSettingsInput {
  theme?: unknown;
  header?: unknown;
  footer?: unknown;
  seo?: { title: string; description: string; imageKey: string | null };
  isPublished?: boolean;
  customDomain?: string | null;
}

export async function updateWebsite(actor: Actor, input: WebsiteSettingsInput) {
  const before = await getOrCreateWebsite(actor.schoolId);
  if (input.seo?.imageKey) await assertFileBelongsToSchool(actor.schoolId, input.seo.imageKey);
  if (input.customDomain) {
    const taken = await prisma.website.findFirst({ where: { customDomain: input.customDomain, NOT: { id: before.id } } });
    if (taken) throw conflict("This domain is already used by another school");
  }
  if (input.isPublished && !(await prisma.websitePage.count({ where: { websiteId: before.id, isHome: true, status: "PUBLISHED" } }))) {
    throw badRequest("Publish the home page before putting the website online");
  }

  const website = await prisma.$transaction(async (tx) => {
    const updated = await tx.website.update({
      where: { id: before.id },
      data: {
        theme: input.theme as Prisma.InputJsonValue | undefined,
        header: input.header as Prisma.InputJsonValue | undefined,
        footer: input.footer as Prisma.InputJsonValue | undefined,
        seo: input.seo,
        isPublished: input.isPublished,
        customDomain: input.customDomain === undefined ? undefined : input.customDomain || null,
        publishedAt: input.isPublished && !before.isPublished ? new Date() : undefined,
      },
    });
    await recordAudit(
      actor,
      {
        action: input.isPublished === undefined ? "website.update" : input.isPublished ? "website.publish" : "website.unpublish",
        entityType: "Website",
        entityId: before.id,
        oldValue: { isPublished: before.isPublished, customDomain: before.customDomain, changed: Object.keys(input) },
        newValue: { isPublished: input.isPublished, customDomain: input.customDomain },
      },
      tx,
    );
    return updated;
  });

  await bumpSiteVersion(actor.schoolId);
  return toWebsiteDto(website);
}

function toWebsiteDto(website: Awaited<ReturnType<typeof getOrCreateWebsite>>) {
  const seo = website.seo as { title: string; description: string; imageKey: string | null };
  return {
    id: website.id,
    isPublished: website.isPublished,
    customDomain: website.customDomain,
    publishedAt: website.publishedAt,
    theme: normalizeTheme(website.theme),
    header: normalizeHeader(website.header),
    footer: normalizeFooter(website.footer),
    seo: { ...seo, imageUrl: seo.imageKey ? publicFileUrl(seo.imageKey) : null },
  };
}

// ─── Pages ───────────────────────────────────────────────────

export async function listPages(schoolId: string) {
  const pages = await prisma.websitePage.findMany({
    where: { schoolId },
    orderBy: [{ isHome: "desc" }, { menuOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      slug: true,
      isHome: true,
      status: true,
      showInMenu: true,
      menuOrder: true,
      publishedAt: true,
      updatedAt: true,
      draftBlocks: true,
      publishedBlocks: true,
    },
  });
  return pages.map(({ draftBlocks, publishedBlocks, ...page }) => ({
    ...page,
    // Draft differs from what visitors see
    hasUnpublishedChanges: page.status === "DRAFT" || JSON.stringify(draftBlocks) !== JSON.stringify(publishedBlocks),
  }));
}

export async function getPage(schoolId: string, pageId: string) {
  const page = await findPage(schoolId, pageId);
  return {
    ...page,
    hasUnpublishedChanges: page.status === "DRAFT" || JSON.stringify(page.draftBlocks) !== JSON.stringify(page.publishedBlocks),
  };
}

export interface CreatePageInput {
  title: string;
  slug?: string;
  templateId?: string;
}

export async function createPage(actor: Actor, input: CreatePageInput) {
  const website = await getOrCreateWebsite(actor.schoolId);
  const template = getTemplate(input.templateId ?? "blank") ?? getTemplate("blank")!;
  const isFirstPage = (await prisma.websitePage.count({ where: { websiteId: website.id } })) === 0;
  const slug = isFirstPage ? "" : await uniqueSlug(website.id, input.slug || slugify(input.title));
  const lastOrder = await prisma.websitePage.aggregate({ where: { websiteId: website.id }, _max: { menuOrder: true } });

  const page = await prisma.$transaction(async (tx) => {
    const created = await tx.websitePage.create({
      data: {
        schoolId: actor.schoolId,
        websiteId: website.id,
        title: input.title,
        slug,
        isHome: isFirstPage,
        draftBlocks: (await personalise(actor.schoolId, template.blocks())) as unknown as Prisma.InputJsonValue,
        menuOrder: (lastOrder._max.menuOrder ?? 0) + 1,
        updatedById: actor.userId,
      },
    });
    await recordAudit(actor, { action: "website.page.create", entityType: "WebsitePage", entityId: created.id, newValue: { title: input.title, slug, template: template.id } }, tx);
    return created;
  });
  return getPage(actor.schoolId, page.id);
}

/** Creates the starter website (Home, About, Academics, Admissions, Contact) in one go. */
export async function createStarterSite(actor: Actor) {
  const website = await getOrCreateWebsite(actor.schoolId);
  if (await prisma.websitePage.count({ where: { websiteId: website.id } })) {
    throw conflict("The website already has pages. Add pages one at a time instead.");
  }
  for (const id of STARTER_SITE) {
    const template = getTemplate(id)!;
    await createPage(actor, { title: template.title, slug: template.slug || undefined, templateId: id });
  }
  return listPages(actor.schoolId);
}

/** Fills template text with the school's own details. */
async function personalise(schoolId: string, blocks: Block[]): Promise<Block[]> {
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId }, select: { name: true } });
  const settings = await getSchoolSettings(schoolId);
  const year = await prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true }, select: { name: true } });
  return blocks.map((block) => {
    const props = { ...block.props };
    if (block.type === "hero" && year) props.eyebrow = `Admissions open for ${year.name}`;
    if (block.type === "hero" && settings["branding.motto"]) props.subheading = settings["branding.motto"];
    if (block.type === "imageText" && props.eyebrow === "Welcome") props.heading = `Welcome to ${school.name}`;
    return { ...block, props };
  });
}

export interface PageSettingsInput {
  title?: string;
  slug?: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  showInMenu?: boolean;
}

export async function updatePageSettings(actor: Actor, pageId: string, input: PageSettingsInput) {
  const page = await findPage(actor.schoolId, pageId);
  if (input.slug !== undefined && page.isHome) throw badRequest("The home page's address can't be changed");
  const slug = input.slug !== undefined && input.slug !== page.slug ? await uniqueSlug(page.websiteId, input.slug, pageId, true) : undefined;

  await prisma.websitePage.update({
    where: { id: pageId },
    data: { title: input.title, slug, seoTitle: input.seoTitle, seoDescription: input.seoDescription, showInMenu: input.showInMenu, updatedById: actor.userId },
  });
  await recordAudit(actor, { action: "website.page.update", entityType: "WebsitePage", entityId: pageId, oldValue: { title: page.title, slug: page.slug }, newValue: input });
  await bumpSiteVersion(actor.schoolId);
  return getPage(actor.schoolId, pageId);
}

/** Autosave from the editor. Rich text is sanitised and image files must belong to the school. */
export async function saveDraft(actor: Actor, pageId: string, blocks: Block[]) {
  await findPage(actor.schoolId, pageId);
  for (const key of new Set(collectImageKeys(blocks))) await assertFileBelongsToSchool(actor.schoolId, key);
  const clean = sanitizeBlocks(blocks);
  const page = await prisma.websitePage.update({
    where: { id: pageId },
    data: { draftBlocks: clean as unknown as Prisma.InputJsonValue, updatedById: actor.userId },
  });
  return { id: page.id, updatedAt: page.updatedAt, draftBlocks: clean };
}

/** Makes the draft live and keeps a revision so it can be restored later. */
export async function publishPage(actor: Actor, pageId: string) {
  const page = await findPage(actor.schoolId, pageId);
  await prisma.$transaction(async (tx) => {
    await tx.websitePage.update({
      where: { id: pageId },
      data: { publishedBlocks: page.draftBlocks as Prisma.InputJsonValue, status: "PUBLISHED", publishedAt: new Date(), updatedById: actor.userId },
    });
    await tx.websitePageRevision.create({ data: { pageId, title: page.title, blocks: page.draftBlocks as Prisma.InputJsonValue, createdById: actor.userId } });

    // Keep only the most recent revisions
    const old = await tx.websitePageRevision.findMany({ where: { pageId }, orderBy: { createdAt: "desc" }, skip: MAX_REVISIONS, select: { id: true } });
    if (old.length) await tx.websitePageRevision.deleteMany({ where: { id: { in: old.map((r) => r.id) } } });

    await recordAudit(actor, { action: "website.page.publish", entityType: "WebsitePage", entityId: pageId, newValue: { title: page.title } }, tx);
  });
  await bumpSiteVersion(actor.schoolId);
  return getPage(actor.schoolId, pageId);
}

export async function unpublishPage(actor: Actor, pageId: string) {
  const page = await findPage(actor.schoolId, pageId);
  if (page.isHome) throw badRequest("The home page can't be unpublished. Take the whole website offline instead.");
  await prisma.websitePage.update({ where: { id: pageId }, data: { status: "DRAFT", publishedBlocks: Prisma.DbNull } });
  await recordAudit(actor, { action: "website.page.unpublish", entityType: "WebsitePage", entityId: pageId });
  await bumpSiteVersion(actor.schoolId);
  return getPage(actor.schoolId, pageId);
}

export async function setHomePage(actor: Actor, pageId: string) {
  const page = await findPage(actor.schoolId, pageId);
  if (page.isHome) return getPage(actor.schoolId, pageId);
  if (page.status !== "PUBLISHED") throw badRequest("Publish this page before making it the home page");

  await prisma.$transaction(async (tx) => {
    const currentHome = await tx.websitePage.findFirst({ where: { websiteId: page.websiteId, isHome: true } });
    if (currentHome) {
      // The old home page needs its own address now
      await tx.websitePage.update({
        where: { id: currentHome.id },
        data: { isHome: false, slug: await uniqueSlug(page.websiteId, slugify(currentHome.title) || "home", currentHome.id) },
      });
    }
    await tx.websitePage.update({ where: { id: pageId }, data: { isHome: true, slug: "" } });
    await recordAudit(actor, { action: "website.page.set_home", entityType: "WebsitePage", entityId: pageId }, tx);
  });
  await bumpSiteVersion(actor.schoolId);
  return listPages(actor.schoolId);
}

/** Menu order = order of the ids given. */
export async function reorderPages(actor: Actor, pageIds: string[]) {
  const pages = await prisma.websitePage.findMany({ where: { schoolId: actor.schoolId, id: { in: pageIds } }, select: { id: true } });
  if (pages.length !== pageIds.length) throw notFound("Page");
  await prisma.$transaction(pageIds.map((id, index) => prisma.websitePage.update({ where: { id }, data: { menuOrder: index + 1 } })));
  await bumpSiteVersion(actor.schoolId);
  return listPages(actor.schoolId);
}

export async function duplicatePage(actor: Actor, pageId: string) {
  const page = await findPage(actor.schoolId, pageId);
  const copy = await createPage(actor, { title: `${page.title} (copy)` });
  await prisma.websitePage.update({ where: { id: copy.id }, data: { draftBlocks: page.draftBlocks as Prisma.InputJsonValue, showInMenu: false } });
  return getPage(actor.schoolId, copy.id);
}

export async function deletePage(actor: Actor, pageId: string) {
  const page = await findPage(actor.schoolId, pageId);
  if (page.isHome) throw badRequest("The home page can't be deleted. Make another page the home page first.");
  await prisma.$transaction(async (tx) => {
    await tx.websitePage.delete({ where: { id: pageId } });
    await recordAudit(actor, { action: "website.page.delete", entityType: "WebsitePage", entityId: pageId, oldValue: { title: page.title, slug: page.slug } }, tx);
  });
  await bumpSiteVersion(actor.schoolId);
}

export async function listRevisions(schoolId: string, pageId: string) {
  await findPage(schoolId, pageId);
  const revisions = await prisma.websitePageRevision.findMany({ where: { pageId }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, createdAt: true, createdById: true } });
  const authors = await prisma.user.findMany({ where: { id: { in: revisions.map((r) => r.createdById).filter((id): id is string => Boolean(id)) } }, select: { id: true, fullName: true } });
  return revisions.map((r) => ({ ...r, author: authors.find((a) => a.id === r.createdById)?.fullName ?? null }));
}

/** Copies an old published version into the draft (publish again to make it live). */
export async function restoreRevision(actor: Actor, pageId: string, revisionId: string) {
  await findPage(actor.schoolId, pageId);
  const revision = await prisma.websitePageRevision.findFirst({ where: { id: revisionId, pageId } });
  if (!revision) throw notFound("Revision");
  await prisma.websitePage.update({ where: { id: pageId }, data: { draftBlocks: revision.blocks as Prisma.InputJsonValue, updatedById: actor.userId } });
  await recordAudit(actor, { action: "website.page.restore", entityType: "WebsitePage", entityId: pageId, newValue: { revisionId, from: revision.createdAt } });
  return getPage(actor.schoolId, pageId);
}

// ─── Helpers ─────────────────────────────────────────────────

async function findPage(schoolId: string, pageId: string) {
  const page = await prisma.websitePage.findFirst({ where: { id: pageId, schoolId } });
  if (!page) throw notFound("Page");
  return page;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** A free page address based on `base`; with `strict`, a taken address is an error instead of getting "-2". */
async function uniqueSlug(websiteId: string, base: string, exceptPageId?: string, strict = false): Promise<string> {
  const slug = base || "page";
  if (RESERVED_SLUGS.includes(slug)) {
    if (strict) throw badRequest(`"${slug}" is used by a built-in page. Choose another address.`, { fieldErrors: { slug: ["Reserved"] } });
  }
  for (let i = 1; ; i++) {
    const candidate = i === 1 && !RESERVED_SLUGS.includes(slug) ? slug : `${slug}-${i}`;
    const taken = await prisma.websitePage.findFirst({ where: { websiteId, slug: candidate, NOT: exceptPageId ? { id: exceptPageId } : undefined } });
    if (!taken) return candidate;
    if (strict) throw conflict(`Another page already uses /${candidate}`, { fieldErrors: { slug: ["Already used"] } });
  }
}
