import { cx, html } from "../html.js";
import { asArray, asString, image, sectionHeading } from "../helpers.js";
import { defineBlock, headingFields } from "./define.js";

export const imageBlock = defineBlock({
  type: "image",
  label: "Image",
  description: "A single photo with an optional caption",
  category: "Media",
  icon: "image",
  fields: [
    { name: "image", label: "Photo", type: "image" },
    { name: "alt", label: "Description (for screen readers and Google)", type: "text" },
    { name: "caption", label: "Caption", type: "text" },
    {
      name: "width",
      label: "Width",
      type: "select",
      options: [
        { value: "narrow", label: "Narrow" },
        { value: "wide", label: "Wide" },
        { value: "full", label: "Full width" },
      ],
    },
  ],
  defaults: { image: null, alt: "", caption: "", width: "wide" },
  render: (p, ctx) =>
    html`<figure class="${cx(p.width === "full" ? "full-bleed" : "container", p.width === "narrow" && "container-narrow", "figure")}">
      ${image(p.image, p.alt, ctx, "rounded-media")}
      ${p.caption ? html`<figcaption>${asString(p.caption)}</figcaption>` : ""}
    </figure>`,
});

export const galleryBlock = defineBlock({
  type: "gallery",
  label: "Photo gallery",
  description: "Grid of photos from an album, opens full size when tapped",
  category: "Media",
  icon: "image",
  fields: [
    ...headingFields,
    { name: "albumId", label: "Album", type: "album", help: "Pick an album from Website → Gallery, or add photos below" },
    {
      name: "photos",
      label: "Photos",
      type: "list",
      itemLabel: "Photo",
      newItem: { key: null, caption: "" },
      fields: [
        { name: "key", label: "Photo", type: "image" },
        { name: "caption", label: "Caption", type: "text" },
      ],
      max: 24,
    },
    { name: "limit", label: "Photos to show", type: "number", min: 2, max: 24 },
    { name: "showAllLink", label: 'Show "View all photos" link', type: "toggle" },
  ],
  defaults: { eyebrow: "Gallery", heading: "Life at our school", intro: "", albumId: "", photos: [], limit: 8, showAllLink: true },
  data: ["albums"],
  render: (p, ctx) => {
    const album = ctx.data.albums.find((a) => a.id === p.albumId);
    const manual = asArray<{ key: string | null; caption?: string }>(p.photos).filter((ph) => ph.key) as { key: string; caption?: string }[];
    // Fall back to the newest photos across albums so a fresh site never looks empty
    const photos = (manual.length ? manual : (album?.photos ?? ctx.data.albums.flatMap((a) => a.photos))).slice(0, Number(p.limit) || 8);

    return html`<div class="container">
      ${sectionHeading(p)}
      ${photos.length === 0
        ? html`<div class="gallery">${[1, 2, 3, 4].map(() => image(null, "", ctx, "gallery-thumb"))}</div>`
        : html`<div class="gallery">${photos.map(
            (photo) => html`<a href="${ctx.fileUrl(photo.key)}" data-lightbox title="${photo.caption ?? ""}">${image(photo.key, photo.caption, ctx, "gallery-thumb")}</a>`,
          )}</div>`}
      ${p.showAllLink ? html`<p class="center more-link"><a href="${ctx.basePath}/gallery${album ? `/${album.slug}` : ""}">View all photos →</a></p>` : ""}
    </div>`;
  },
});

/** Accepts normal YouTube links and turns them into privacy-friendly embeds. */
function youtubeId(url: string): string | null {
  const match = /(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/.exec(url);
  return match?.[1] ?? null;
}

export const videoBlock = defineBlock({
  type: "video",
  label: "Video",
  description: "A YouTube video — school tour, events, interviews",
  category: "Media",
  icon: "play",
  fields: [...headingFields, { name: "url", label: "YouTube link", type: "text", placeholder: "https://www.youtube.com/watch?v=…" }],
  defaults: { eyebrow: "", heading: "Take a tour of our school", intro: "", url: "" },
  render: (p) => {
    const id = youtubeId(asString(p.url));
    return html`<div class="container container-narrow">
      ${sectionHeading(p)}
      <div class="video">${id
        ? html`<iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${asString(p.heading) || "Video"}" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
        : html`<div class="img-placeholder">Paste a YouTube link in the settings</div>`}</div>
    </div>`;
  },
});
