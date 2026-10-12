import { cx, html, raw } from "../html.js";
import { asArray, asString, button, icon, resolveLink } from "../helpers.js";
import { defineBlock } from "./define.js";

export const heroBlock = defineBlock({
  type: "hero",
  label: "Hero banner",
  description: "Big welcome section with a photo, headline and buttons",
  category: "Headers",
  icon: "sparkles",
  fields: [
    { name: "eyebrow", label: "Small label", type: "text" },
    { name: "heading", label: "Headline", type: "text" },
    { name: "subheading", label: "Text under the headline", type: "textarea", rows: 3 },
    { name: "image", label: "Background photo", type: "image", help: "A wide photo of the school works best" },
    {
      name: "layout",
      label: "Layout",
      type: "select",
      options: [
        { value: "center", label: "Centered on photo" },
        { value: "left", label: "Left aligned on photo" },
        { value: "split", label: "Text left, photo right" },
      ],
    },
    {
      name: "height",
      label: "Height",
      type: "select",
      options: [
        { value: "md", label: "Medium" },
        { value: "lg", label: "Large" },
        { value: "full", label: "Full screen" },
      ],
    },
    { name: "primaryLabel", label: "Main button text", type: "text" },
    { name: "primaryLink", label: "Main button link", type: "link" },
    { name: "secondaryLabel", label: "Second button text", type: "text" },
    { name: "secondaryLink", label: "Second button link", type: "link" },
  ],
  defaults: {
    eyebrow: "Admissions open for 2083",
    heading: "Where every child learns, grows and shines",
    subheading: "A caring school with experienced teachers, modern classrooms and a strong record of results.",
    image: null,
    layout: "center",
    height: "lg",
    primaryLabel: "Apply for admission",
    primaryLink: "#admission",
    secondaryLabel: "Explore our school",
    secondaryLink: "#about",
  },
  style: { padding: "none" },
  render: (p, ctx) => {
    const imageUrl = p.image ? ctx.fileUrl(String(p.image)) : null;
    const text = html`<div class="hero-text">
      ${p.eyebrow ? html`<p class="hero-eyebrow">${asString(p.eyebrow)}</p>` : ""}
      <h1>${asString(p.heading)}</h1>
      ${p.subheading ? html`<p class="hero-sub">${asString(p.subheading)}</p>` : ""}
      <div class="btn-row">${button(p.primaryLabel, p.primaryLink, ctx, "primary")}${button(p.secondaryLabel, p.secondaryLink, ctx, p.layout === "split" ? "secondary" : "light")}</div>
    </div>`;

    if (p.layout === "split") {
      return html`<div class="${cx("hero", "hero-split", `hero-${p.height}`)}"><div class="container hero-split-grid">${text}
        <div class="hero-media">${imageUrl ? html`<img src="${imageUrl}" alt="" fetchpriority="high">` : html`<div class="hero-art">${icon("school", 96)}</div>`}</div>
      </div></div>`;
    }
    return html`<div class="${cx("hero", "hero-cover", `hero-${p.layout}`, `hero-${p.height}`, !imageUrl && "hero-gradient")}"${raw(imageUrl ? ` style="--hero-image:url('${imageUrl}')"` : "")}>
      <div class="container">${text}</div>
    </div>`;
  },
});

export const pageHeaderBlock = defineBlock({
  type: "pageHeader",
  label: "Page title",
  description: "Title banner for inner pages like About or Admissions",
  category: "Headers",
  icon: "file-text",
  fields: [
    { name: "heading", label: "Title", type: "text" },
    { name: "subheading", label: "Subtitle", type: "textarea", rows: 2 },
    { name: "image", label: "Background photo (optional)", type: "image" },
  ],
  defaults: { heading: "About us", subheading: "Our story, our values and the people who make our school special.", image: null },
  style: { padding: "none" },
  render: (p, ctx) => {
    const imageUrl = p.image ? ctx.fileUrl(String(p.image)) : null;
    return html`<div class="${cx("page-header", imageUrl ? "has-image" : "hero-gradient")}"${raw(imageUrl ? ` style="--hero-image:url('${imageUrl}')"` : "")}>
      <div class="container"><h1>${asString(p.heading)}</h1>${p.subheading ? html`<p>${asString(p.subheading)}</p>` : ""}</div>
    </div>`;
  },
});

export const announcementBlock = defineBlock({
  type: "announcement",
  label: "Flash news bar",
  description: "Scrolling strip for important announcements",
  category: "Headers",
  icon: "megaphone",
  fields: [
    { name: "label", label: "Label", type: "text" },
    {
      name: "items",
      label: "Announcements",
      type: "list",
      itemLabel: "Announcement",
      newItem: { text: "New announcement", link: "" },
      fields: [
        { name: "text", label: "Text", type: "text" },
        { name: "link", label: "Link (optional)", type: "link" },
      ],
    },
    { name: "useNotices", label: "Also show the latest notices", type: "toggle" },
  ],
  defaults: { label: "Flash news", items: [{ text: "Admission open for Nursery to Grade 9 — apply now", link: "#admission" }], useNotices: true },
  data: ["notices"],
  style: { padding: "none" },
  render: (p, ctx) => {
    const items = asArray<{ text: string; link?: string }>(p.items).map((i) => ({ text: i.text, href: i.link ? resolveLink(i.link, ctx) : null }));
    if (p.useNotices) {
      for (const n of ctx.data.notices.slice(0, 5)) items.push({ text: n.title, href: `${ctx.basePath}/notices/${n.slug}` });
    }
    if (items.length === 0) return html``;
    const list = items.map((i) => (i.href ? html`<a href="${i.href}">${i.text}</a>` : html`<span>${i.text}</span>`));
    return html`<div class="ticker"><div class="container ticker-inner">
      <strong class="ticker-label">${icon("megaphone", 16)} ${asString(p.label)}</strong>
      <div class="ticker-track"><div class="ticker-items">${list}${list}</div></div>
    </div></div>`;
  },
});
