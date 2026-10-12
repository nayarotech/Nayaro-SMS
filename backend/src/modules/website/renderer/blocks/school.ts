import { cx, html, raw } from "../html.js";
import { asArray, asString, icon, image, isExternal, resolveLink, sectionHeading, truncate } from "../helpers.js";
import type { PostSummary, RenderContext } from "../types.js";
import { defineBlock, headingFields } from "./define.js";

export const messageBlock = defineBlock({
  type: "message",
  label: "Principal's message",
  description: "Photo, name and a welcome message from the principal or chairperson",
  category: "School",
  icon: "user",
  fields: [
    { name: "eyebrow", label: "Small label", type: "text" },
    { name: "heading", label: "Heading", type: "text" },
    { name: "body", label: "Message", type: "richtext" },
    { name: "photo", label: "Photo", type: "image" },
    { name: "name", label: "Name", type: "text" },
    { name: "role", label: "Position", type: "text" },
  ],
  defaults: {
    eyebrow: "Message from the principal",
    heading: "Educating minds, nurturing hearts",
    body: "<p>Dear parents and students, welcome. Our goal is simple: every child should leave our school confident, curious and kind. We work closely with families to make that happen, and our doors are always open.</p>",
    photo: null,
    name: "Ramesh Koirala",
    role: "Principal",
  },
  render: (p, ctx) =>
    html`<div class="container message">
      <div class="message-photo">${p.photo ? image(p.photo, p.name, ctx, "rounded-media") : html`<div class="img-placeholder rounded-media">${icon("user", 64)}</div>`}</div>
      <div>
        ${sectionHeading(p, "left")}
        <div class="prose">${raw(asString(p.body))}</div>
        <p class="signature"><strong>${asString(p.name)}</strong><span>${asString(p.role)}</span></p>
      </div>
    </div>`,
});

export const teamBlock = defineBlock({
  type: "team",
  label: "Team",
  description: "Photos and names of the management, teachers or staff",
  category: "School",
  icon: "users",
  fields: [
    ...headingFields,
    {
      name: "columns",
      label: "Columns",
      type: "select",
      options: [
        { value: "3", label: "3" },
        { value: "4", label: "4" },
      ],
    },
    {
      name: "people",
      label: "People",
      type: "list",
      itemLabel: "Person",
      newItem: { photo: null, name: "Name", role: "Position" },
      fields: [
        { name: "photo", label: "Photo", type: "image" },
        { name: "name", label: "Name", type: "text" },
        { name: "role", label: "Position", type: "text" },
      ],
      max: 40,
    },
  ],
  defaults: {
    eyebrow: "Our team",
    heading: "Meet the people who make it happen",
    intro: "",
    columns: "4",
    people: [
      { photo: null, name: "Ramesh Koirala", role: "Principal" },
      { photo: null, name: "Sunita Gurung", role: "Vice Principal" },
      { photo: null, name: "Deepak Shrestha", role: "Head of Science" },
      { photo: null, name: "Anita Rai", role: "Pre-primary Coordinator" },
    ],
  },
  render: (p, ctx) =>
    html`<div class="container">
      ${sectionHeading(p)}
      <div class="${cx("grid", `cols-${asString(p.columns) || "4"}`)}">${asArray<{ photo: string | null; name: string; role: string }>(p.people).map(
        (person) => html`<div class="person">
          ${person.photo ? image(person.photo, person.name, ctx, "person-photo") : html`<div class="person-photo avatar-initials">${initials(person.name)}</div>`}
          <h3>${person.name}</h3><p>${person.role}</p>
        </div>`,
      )}</div>
    </div>`,
});

function initials(name: string) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

export const downloadsBlock = defineBlock({
  type: "downloads",
  label: "Downloads",
  description: "Admission form, fee structure, calendar and other files",
  category: "School",
  icon: "download",
  fields: [
    ...headingFields,
    {
      name: "files",
      label: "Files",
      type: "list",
      itemLabel: "File",
      newItem: { title: "Document", link: "" },
      fields: [
        { name: "title", label: "Title", type: "text" },
        { name: "link", label: "File or link", type: "link", help: "Upload a PDF under Website → Files, or paste a link" },
      ],
    },
  ],
  defaults: {
    eyebrow: "",
    heading: "Downloads",
    intro: "",
    files: [
      { title: "Admission form 2083", link: "" },
      { title: "Fee structure 2083", link: "" },
      { title: "Academic calendar 2083", link: "" },
    ],
  },
  render: (p, ctx) =>
    html`<div class="container container-narrow">
      ${sectionHeading(p)}
      <ul class="file-list">${asArray<{ title: string; link: string }>(p.files).map((file) => {
        const href = resolveLink(file.link, ctx);
        return html`<li><a href="${href}"${raw(isExternal(href) ? ' target="_blank" rel="noopener"' : "")}>${icon("file-text", 20)}<span>${file.title}</span>${icon("download", 18)}</a></li>`;
      })}</ul>
    </div>`,
});

// ─── Live notices, news, events ──────────────────────────────

function postDate(post: PostSummary, ctx: RenderContext) {
  const date = post.type === "EVENT" ? post.eventStart : post.publishedAt;
  return date ? ctx.formatDate(date) : "";
}

function postUrl(post: PostSummary, ctx: RenderContext) {
  const section = post.type === "NOTICE" ? "notices" : post.type === "NEWS" ? "news" : "events";
  return `${ctx.basePath}/${section}/${post.slug}`;
}

export function noticeList(posts: PostSummary[], ctx: RenderContext) {
  if (posts.length === 0) return html`<p class="muted center">No notices yet.</p>`;
  return html`<ul class="notice-list">${posts.map(
    (n) => html`<li><a href="${postUrl(n, ctx)}">
      <span class="notice-date">${postDate(n, ctx)}</span>
      <span class="notice-title">${n.isPinned ? html`<span class="pin">${icon("pin", 14)}</span>` : ""}${n.title}</span>
      ${icon("arrow-right", 18)}
    </a></li>`,
  )}</ul>`;
}

export function postCards(posts: PostSummary[], ctx: RenderContext) {
  if (posts.length === 0) return html`<p class="muted center">Nothing published yet.</p>`;
  return html`<div class="grid cols-3">${posts.map(
    (post) => html`<a class="card post-card" href="${postUrl(post, ctx)}">
      ${image(post.coverImageKey, post.title, ctx, "post-cover")}
      <div class="post-body">
        <span class="post-date">${post.type === "EVENT" ? icon("calendar", 15) : ""}${postDate(post, ctx)}${post.location ? ` · ${post.location}` : ""}</span>
        <h3>${post.title}</h3>
        ${post.excerpt ? html`<p>${truncate(post.excerpt, 130)}</p>` : ""}
      </div>
    </a>`,
  )}</div>`;
}

export const noticesBlock = defineBlock({
  type: "notices",
  label: "Latest notices",
  description: "Newest notices from Website → Notices, updated automatically",
  category: "Notices & events",
  icon: "bell",
  fields: [...headingFields, { name: "limit", label: "How many", type: "number", min: 1, max: 20 }],
  defaults: { eyebrow: "Notice board", heading: "Latest notices", intro: "", limit: 5 },
  data: ["notices"],
  render: (p, ctx) =>
    html`<div class="container container-narrow">
      ${sectionHeading(p)}
      ${noticeList(ctx.data.notices.slice(0, Number(p.limit) || 5), ctx)}
      <p class="center more-link"><a href="${ctx.basePath}/notices">All notices →</a></p>
    </div>`,
});

export const newsBlock = defineBlock({
  type: "news",
  label: "Latest news",
  description: "Newest news stories with photos, updated automatically",
  category: "Notices & events",
  icon: "file-text",
  fields: [...headingFields, { name: "limit", label: "How many", type: "number", min: 1, max: 12 }],
  defaults: { eyebrow: "News", heading: "What's happening", intro: "", limit: 3 },
  data: ["news"],
  render: (p, ctx) =>
    html`<div class="container">
      ${sectionHeading(p)}
      ${postCards(ctx.data.news.slice(0, Number(p.limit) || 3), ctx)}
      <p class="center more-link"><a href="${ctx.basePath}/news">All news →</a></p>
    </div>`,
});

export const eventsBlock = defineBlock({
  type: "events",
  label: "Upcoming events",
  description: "Next events with dates and places, updated automatically",
  category: "Notices & events",
  icon: "calendar-days",
  fields: [...headingFields, { name: "limit", label: "How many", type: "number", min: 1, max: 12 }],
  defaults: { eyebrow: "Calendar", heading: "Upcoming events", intro: "", limit: 3 },
  data: ["events"],
  render: (p, ctx) => {
    const events = ctx.data.events.slice(0, Number(p.limit) || 3);
    return html`<div class="container">
      ${sectionHeading(p)}
      ${events.length === 0
        ? html`<p class="muted center">No upcoming events.</p>`
        : html`<div class="events">${events.map((event) => {
            // "25 Aswin 2083" → big "25", small "Aswin 2083"
            const [day, ...monthYear] = postDate(event, ctx).split(" ");
            return html`<a class="card event" href="${postUrl(event, ctx)}">
              <span class="event-date"><strong>${day}</strong><small>${monthYear.join(" ")}</small></span>
              <span><h3>${event.title}</h3>${event.location ? html`<small>${icon("map-pin", 14)} ${event.location}</small>` : ""}</span>
            </a>`;
          })}</div>`}
      <p class="center more-link"><a href="${ctx.basePath}/events">All events →</a></p>
    </div>`;
  },
});
