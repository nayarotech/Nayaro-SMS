import { badRequest, notFound } from "../../lib/errors.js";
import { fromDateString, toDateString } from "../../lib/nepali-date.js";
import { prisma } from "../../lib/prisma.js";
import { paginate, type Paginated } from "../../http/schemas.js";
import { recordAudit, type Actor } from "../audit/audit.service.js";
import { assertFileBelongsToSchool, publicFileUrl } from "../files/file.service.js";
import { richTextToPlain, sanitizeRichText } from "./sanitize.js";
import { bumpSiteVersion } from "./site-cache.js";
import { slugify } from "./website.service.js";
import type { EnquiryStatus, Prisma, WebsitePostType } from "../../generated/prisma/client.js";

/** Notices, news, events, gallery albums and enquiries for the school website. */

// ─── Notices / news / events ─────────────────────────────────

export interface PostInput {
  type: WebsitePostType;
  title: string;
  excerpt?: string | null;
  content: string;
  coverImageKey?: string | null;
  attachments?: { title: string; fileKey: string }[];
  isPinned?: boolean;
  eventStart?: string | null;
  eventEnd?: string | null;
  location?: string | null;
  status: "DRAFT" | "PUBLISHED";
}

export async function listPosts(
  schoolId: string,
  query: { type?: WebsitePostType; status?: "DRAFT" | "PUBLISHED"; search?: string; page: number; pageSize: number },
): Promise<Paginated<ReturnType<typeof toPostDto>>> {
  const where: Prisma.WebsitePostWhereInput = {
    schoolId,
    type: query.type,
    status: query.status,
    ...(query.search && { title: { contains: query.search } }),
  };
  const [posts, total] = await Promise.all([
    prisma.websitePost.findMany({ where, orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }], ...paginate(query.page, query.pageSize) }),
    prisma.websitePost.count({ where }),
  ]);
  return { items: posts.map(toPostDto), total, page: query.page, pageSize: query.pageSize };
}

export async function getPost(schoolId: string, postId: string) {
  return toPostDto(await findPost(schoolId, postId));
}

export async function createPost(actor: Actor, input: PostInput) {
  await validatePostFiles(actor.schoolId, input);
  const post = await prisma.$transaction(async (tx) => {
    const created = await tx.websitePost.create({
      data: {
        schoolId: actor.schoolId,
        authorId: actor.userId,
        slug: await uniquePostSlug(actor.schoolId, input.type, input.title),
        ...postData(input),
        publishedAt: input.status === "PUBLISHED" ? new Date() : null,
      },
    });
    await recordAudit(actor, { action: "website.post.create", entityType: "WebsitePost", entityId: created.id, newValue: { type: input.type, title: input.title, status: input.status } }, tx);
    return created;
  });
  await bumpSiteVersion(actor.schoolId);
  return toPostDto(post);
}

export async function updatePost(actor: Actor, postId: string, input: PostInput) {
  const before = await findPost(actor.schoolId, postId);
  await validatePostFiles(actor.schoolId, input);
  const post = await prisma.$transaction(async (tx) => {
    const updated = await tx.websitePost.update({
      where: { id: postId },
      data: {
        ...postData(input),
        // First time it goes live, record when
        publishedAt: input.status === "PUBLISHED" ? (before.publishedAt ?? new Date()) : before.publishedAt,
      },
    });
    await recordAudit(
      actor,
      { action: "website.post.update", entityType: "WebsitePost", entityId: postId, oldValue: { title: before.title, status: before.status }, newValue: { title: input.title, status: input.status } },
      tx,
    );
    return updated;
  });
  await bumpSiteVersion(actor.schoolId);
  return toPostDto(post);
}

export async function deletePost(actor: Actor, postId: string) {
  const post = await findPost(actor.schoolId, postId);
  await prisma.$transaction(async (tx) => {
    await tx.websitePost.delete({ where: { id: postId } });
    await recordAudit(actor, { action: "website.post.delete", entityType: "WebsitePost", entityId: postId, oldValue: { type: post.type, title: post.title } }, tx);
  });
  await bumpSiteVersion(actor.schoolId);
}

async function validatePostFiles(schoolId: string, input: PostInput) {
  if (input.type === "EVENT" && !input.eventStart) throw badRequest("Events need a start date", { fieldErrors: { eventStart: ["Required"] } });
  if (input.eventStart && input.eventEnd && input.eventEnd < input.eventStart) {
    throw badRequest("The event can't end before it starts", { fieldErrors: { eventEnd: ["Must be after the start date"] } });
  }
  const keys = [input.coverImageKey, ...(input.attachments ?? []).map((a) => a.fileKey)].filter((k): k is string => Boolean(k));
  for (const key of keys) await assertFileBelongsToSchool(schoolId, key);
}

function postData(input: PostInput) {
  const content = sanitizeRichText(input.content);
  return {
    type: input.type,
    title: input.title,
    content,
    // Without a summary, use the first sentence or two of the content
    excerpt: input.excerpt?.trim() || richTextToPlain(content).slice(0, 220) || null,
    coverImageKey: input.coverImageKey ?? null,
    attachments: (input.attachments ?? []) as Prisma.InputJsonValue,
    isPinned: Boolean(input.isPinned),
    eventStart: input.eventStart ? fromDateString(input.eventStart) : null,
    eventEnd: input.eventEnd ? fromDateString(input.eventEnd) : null,
    location: input.location || null,
    status: input.status,
  };
}

async function uniquePostSlug(schoolId: string, type: WebsitePostType, title: string) {
  const base = slugify(title) || "post";
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    if (!(await prisma.websitePost.findUnique({ where: { schoolId_type_slug: { schoolId, type, slug } } }))) return slug;
  }
}

async function findPost(schoolId: string, postId: string) {
  const post = await prisma.websitePost.findFirst({ where: { id: postId, schoolId } });
  if (!post) throw notFound("Post");
  return post;
}

function toPostDto(post: Awaited<ReturnType<typeof findPost>>) {
  const attachments = (post.attachments as { title: string; fileKey: string }[]) ?? [];
  return {
    id: post.id,
    type: post.type,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    content: post.content,
    coverImageKey: post.coverImageKey,
    coverImageUrl: post.coverImageKey ? publicFileUrl(post.coverImageKey) : null,
    attachments: attachments.map((a) => ({ ...a, url: publicFileUrl(a.fileKey) })),
    isPinned: post.isPinned,
    eventStart: toDateString(post.eventStart),
    eventEnd: toDateString(post.eventEnd),
    location: post.location,
    status: post.status,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
  };
}

// ─── Gallery albums ──────────────────────────────────────────

export interface AlbumInput {
  title: string;
  description?: string | null;
  photos: { key: string; caption?: string }[];
  isPublished?: boolean;
  eventDate?: string | null;
}

export async function listAlbums(schoolId: string) {
  const albums = await prisma.galleryAlbum.findMany({ where: { schoolId }, orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }] });
  return albums.map(toAlbumDto);
}

export async function getAlbum(schoolId: string, albumId: string) {
  return toAlbumDto(await findAlbum(schoolId, albumId));
}

export async function createAlbum(actor: Actor, input: AlbumInput) {
  for (const photo of input.photos) await assertFileBelongsToSchool(actor.schoolId, photo.key);
  const base = slugify(input.title) || "album";
  let slug = base;
  for (let i = 2; await prisma.galleryAlbum.findUnique({ where: { schoolId_slug: { schoolId: actor.schoolId, slug } } }); i++) slug = `${base}-${i}`;

  const album = await prisma.galleryAlbum.create({
    data: {
      schoolId: actor.schoolId,
      title: input.title,
      slug,
      description: input.description,
      photos: input.photos as Prisma.InputJsonValue,
      isPublished: input.isPublished ?? true,
      eventDate: input.eventDate ? fromDateString(input.eventDate) : null,
    },
  });
  await recordAudit(actor, { action: "website.album.create", entityType: "GalleryAlbum", entityId: album.id, newValue: { title: input.title, photos: input.photos.length } });
  await bumpSiteVersion(actor.schoolId);
  return toAlbumDto(album);
}

export async function updateAlbum(actor: Actor, albumId: string, input: Partial<AlbumInput>) {
  await findAlbum(actor.schoolId, albumId);
  for (const photo of input.photos ?? []) await assertFileBelongsToSchool(actor.schoolId, photo.key);
  const album = await prisma.galleryAlbum.update({
    where: { id: albumId },
    data: {
      title: input.title,
      description: input.description,
      photos: input.photos as Prisma.InputJsonValue | undefined,
      isPublished: input.isPublished,
      eventDate: input.eventDate === undefined ? undefined : input.eventDate ? fromDateString(input.eventDate) : null,
    },
  });
  await recordAudit(actor, { action: "website.album.update", entityType: "GalleryAlbum", entityId: albumId, newValue: { title: input.title, photos: input.photos?.length } });
  await bumpSiteVersion(actor.schoolId);
  return toAlbumDto(album);
}

export async function deleteAlbum(actor: Actor, albumId: string) {
  const album = await findAlbum(actor.schoolId, albumId);
  await prisma.galleryAlbum.delete({ where: { id: albumId } });
  await recordAudit(actor, { action: "website.album.delete", entityType: "GalleryAlbum", entityId: albumId, oldValue: { title: album.title } });
  await bumpSiteVersion(actor.schoolId);
}

async function findAlbum(schoolId: string, albumId: string) {
  const album = await prisma.galleryAlbum.findFirst({ where: { id: albumId, schoolId } });
  if (!album) throw notFound("Album");
  return album;
}

function toAlbumDto(album: Awaited<ReturnType<typeof findAlbum>>) {
  const photos = (album.photos as { key: string; caption?: string }[]) ?? [];
  return {
    id: album.id,
    title: album.title,
    slug: album.slug,
    description: album.description,
    isPublished: album.isPublished,
    eventDate: toDateString(album.eventDate),
    photos: photos.map((p) => ({ ...p, url: publicFileUrl(p.key) })),
    createdAt: album.createdAt,
  };
}

// ─── Enquiries ───────────────────────────────────────────────

export interface EnquiryInput {
  kind: "contact" | "admission";
  name: string;
  phone?: string | null;
  email?: string | null;
  subject?: string | null;
  message: string;
}

/** Saved from the public website's forms (no login). */
export async function createEnquiry(schoolId: string, input: EnquiryInput, ip?: string) {
  return prisma.websiteEnquiry.create({
    data: { schoolId, kind: input.kind, name: input.name, phone: input.phone, email: input.email, subject: input.subject, message: input.message, ip },
  });
}

export async function listEnquiries(schoolId: string, query: { status?: EnquiryStatus; kind?: string; page: number; pageSize: number }) {
  const where: Prisma.WebsiteEnquiryWhereInput = { schoolId, status: query.status, kind: query.kind };
  const [items, total] = await Promise.all([
    prisma.websiteEnquiry.findMany({ where, orderBy: { createdAt: "desc" }, ...paginate(query.page, query.pageSize) }),
    prisma.websiteEnquiry.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function updateEnquiry(actor: Actor, enquiryId: string, input: { status?: EnquiryStatus; notes?: string | null }) {
  const enquiry = await prisma.websiteEnquiry.findFirst({ where: { id: enquiryId, schoolId: actor.schoolId } });
  if (!enquiry) throw notFound("Enquiry");
  const updated = await prisma.websiteEnquiry.update({ where: { id: enquiryId }, data: input });
  await recordAudit(actor, { action: "website.enquiry.update", entityType: "WebsiteEnquiry", entityId: enquiryId, oldValue: { status: enquiry.status }, newValue: input });
  return updated;
}
