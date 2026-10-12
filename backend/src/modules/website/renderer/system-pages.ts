import { postCards, noticeList } from "./blocks/school.js";
import { cx, html, raw, type SafeHtml } from "./html.js";
import { icon, image } from "./helpers.js";
import type { AlbumSummary, PostSummary, RenderContext } from "./types.js";

/**
 * Pages every website has without building them: notice board, news, events,
 * gallery, single post/album pages, thank-you and not-found.
 */

const SECTIONS = {
  NOTICE: { path: "notices", title: "Notices" },
  NEWS: { path: "news", title: "News" },
  EVENT: { path: "events", title: "Events" },
} as const;

function banner(title: string, subtitle?: string) {
  return html`<div class="page-header hero-gradient"><div class="container"><h1>${title}</h1>${subtitle ? html`<p>${subtitle}</p>` : ""}</div></div>`;
}

function tabs(active: keyof typeof SECTIONS, ctx: RenderContext) {
  return html`<nav class="tabs">${(Object.keys(SECTIONS) as (keyof typeof SECTIONS)[]).map(
    (type) => html`<a class="${cx(type === active && "active")}" href="${ctx.basePath}/${SECTIONS[type].path}">${SECTIONS[type].title}</a>`,
  )}</nav>`;
}

export function postListPage(type: keyof typeof SECTIONS, posts: PostSummary[], ctx: RenderContext, page: number, hasMore: boolean): SafeHtml {
  const section = SECTIONS[type];
  const subtitle = type === "NOTICE" ? "Official notices from the school" : type === "NEWS" ? "Stories and achievements from our school" : "What's coming up";
  return html`${banner(section.title, subtitle)}
    <section class="block pad-md"><div class="${cx("container", type === "NOTICE" && "container-narrow")}">
      ${tabs(type, ctx)}
      ${type === "NOTICE" ? noticeList(posts, ctx) : postCards(posts, ctx)}
      ${page > 1 || hasMore
        ? html`<div class="pagination">
            ${page > 1 ? html`<a href="?page=${page - 1}">← Newer</a>` : ""}
            ${hasMore ? html`<a href="?page=${page + 1}">Older →</a>` : ""}
          </div>`
        : ""}
    </div></section>`;
}

export interface PostDetail extends PostSummary {
  content: string;
  attachments: { title: string; url: string }[];
}

export function postDetailPage(post: PostDetail, ctx: RenderContext): SafeHtml {
  const section = SECTIONS[post.type];
  const date = post.type === "EVENT" ? post.eventStart : post.publishedAt;
  return html`<section class="block pad-md"><article class="container container-narrow article">
    <p class="breadcrumbs"><a href="${ctx.basePath || "/"}">Home</a> / <a href="${ctx.basePath}/${section.path}">${section.title}</a></p>
    <h1>${post.title}</h1>
    <div class="article-meta">
      ${date ? html`<span>${icon("calendar", 16)} ${ctx.formatDate(date)}${post.type === "EVENT" && post.eventEnd && post.eventEnd.slice(0, 10) !== date.slice(0, 10) ? ` – ${ctx.formatDate(post.eventEnd)}` : ""}</span>` : ""}
      ${post.location ? html`<span>${icon("map-pin", 16)} ${post.location}</span>` : ""}
      ${post.isPinned ? html`<span>${icon("pin", 16)} Important</span>` : ""}
    </div>
    ${post.coverImageKey ? image(post.coverImageKey, post.title, ctx, "article-cover") : ""}
    <div class="prose">${raw(post.content)}</div>
    ${post.attachments.length
      ? html`<div class="attachments"><h3>Attachments</h3><ul class="file-list" style="margin-top:12px">${post.attachments.map(
          (file) => html`<li><a href="${file.url}" target="_blank" rel="noopener">${icon("file-text", 20)}<span>${file.title}</span>${icon("download", 18)}</a></li>`,
        )}</ul></div>`
      : ""}
    <p class="more-link"><a href="${ctx.basePath}/${section.path}">← All ${section.title.toLowerCase()}</a></p>
  </article></section>`;
}

export function albumsPage(albums: AlbumSummary[], ctx: RenderContext): SafeHtml {
  return html`${banner("Gallery", "Moments from school life")}
    <section class="block pad-md"><div class="container">
      ${albums.length === 0
        ? html`<p class="muted center">No albums yet.</p>`
        : html`<div class="grid cols-3">${albums.map(
            (album) => html`<a class="card post-card album-card" href="${ctx.basePath}/gallery/${album.slug}">
              ${image(album.coverKey, album.title, ctx, "post-cover")}
              <div class="post-body"><h3>${album.title}</h3><p>${album.photoCount} photos</p></div>
            </a>`,
          )}</div>`}
    </div></section>`;
}

export function albumPage(album: AlbumSummary & { description: string | null }, ctx: RenderContext): SafeHtml {
  return html`${banner(album.title, album.description ?? undefined)}
    <section class="block pad-md"><div class="container">
      <p class="breadcrumbs"><a href="${ctx.basePath}/gallery">← All albums</a></p>
      <div class="gallery">${album.photos.map(
        (photo) => html`<a href="${ctx.fileUrl(photo.key)}" data-lightbox title="${photo.caption ?? ""}">${image(photo.key, photo.caption, ctx, "gallery-thumb")}</a>`,
      )}</div>
    </div></section>`;
}

export function messagePage(title: string, message: string, ctx: RenderContext): SafeHtml {
  return html`<section class="block pad-lg"><div class="container empty-state">
    <h1>${title}</h1><p style="margin-top:12px">${message}</p>
    <p class="more-link"><a href="${ctx.basePath || "/"}">← Back to the home page</a></p>
  </div></section>`;
}
