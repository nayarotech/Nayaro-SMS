import { cx, html, raw } from "../html.js";
import { asArray, asNumber, asString, button, icon, image, sectionHeading } from "../helpers.js";
import { defineBlock, headingFields } from "./define.js";

const columnsField = {
  name: "columns",
  label: "Columns",
  type: "select" as const,
  options: [
    { value: "2", label: "2" },
    { value: "3", label: "3" },
    { value: "4", label: "4" },
  ],
};

export const textBlock = defineBlock({
  type: "text",
  label: "Text",
  description: "Heading and formatted text",
  category: "Content",
  icon: "file-text",
  fields: [
    ...headingFields,
    { name: "body", label: "Text", type: "richtext" },
    {
      name: "width",
      label: "Width",
      type: "select",
      options: [
        { value: "narrow", label: "Narrow (easy to read)" },
        { value: "wide", label: "Wide" },
      ],
    },
    {
      name: "align",
      label: "Heading alignment",
      type: "select",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
      ],
    },
  ],
  defaults: {
    eyebrow: "",
    heading: "About our school",
    intro: "",
    body: "<p>Founded in 2055 BS, our school has grown into a community of learners who care for each other. We combine strong academics with sports, arts and values education.</p>",
    width: "narrow",
    align: "left",
  },
  render: (p) =>
    html`<div class="${cx("container", p.width === "narrow" && "container-narrow")}">
      ${sectionHeading(p, p.align === "center" ? "center" : "left")}
      <div class="prose">${raw(asString(p.body))}</div>
    </div>`,
});

export const imageTextBlock = defineBlock({
  type: "imageText",
  label: "Image with text",
  description: "Photo beside a heading, text and button",
  category: "Content",
  icon: "image",
  fields: [
    ...headingFields,
    { name: "body", label: "Text", type: "richtext" },
    { name: "image", label: "Photo", type: "image" },
    {
      name: "imageSide",
      label: "Photo on the",
      type: "select",
      options: [
        { value: "left", label: "Left" },
        { value: "right", label: "Right" },
      ],
    },
    { name: "buttonLabel", label: "Button text", type: "text" },
    { name: "buttonLink", label: "Button link", type: "link" },
  ],
  defaults: {
    eyebrow: "Welcome",
    heading: "A school that feels like family",
    intro: "",
    body: "<p>Small class sizes mean every teacher knows every child. We focus on understanding, not memorising, and celebrate every student's progress.</p><ul><li>Experienced, caring teachers</li><li>Science, computer and library facilities</li><li>Sports, music, art and clubs</li></ul>",
    image: null,
    imageSide: "left",
    buttonLabel: "Learn more",
    buttonLink: "",
  },
  render: (p, ctx) =>
    html`<div class="${cx("container", "split", p.imageSide === "right" && "split-reverse")}">
      <div class="split-media">${image(p.image, p.heading, ctx, "rounded-media")}</div>
      <div class="split-text">
        ${sectionHeading(p, "left")}
        <div class="prose">${raw(asString(p.body))}</div>
        ${p.buttonLabel ? html`<div class="btn-row">${button(p.buttonLabel, p.buttonLink, ctx)}</div>` : ""}
      </div>
    </div>`,
});

export const featuresBlock = defineBlock({
  type: "features",
  label: "Feature cards",
  description: "Icons with short text — facilities, programs, why choose us",
  category: "Content",
  icon: "star",
  fields: [
    ...headingFields,
    columnsField,
    {
      name: "style",
      label: "Card style",
      type: "select",
      options: [
        { value: "cards", label: "Cards" },
        { value: "plain", label: "Plain" },
      ],
    },
    {
      name: "items",
      label: "Items",
      type: "list",
      itemLabel: "Item",
      newItem: { icon: "star", title: "New item", text: "Describe it in a sentence." },
      fields: [
        { name: "icon", label: "Icon", type: "icon" },
        { name: "title", label: "Title", type: "text" },
        { name: "text", label: "Text", type: "textarea", rows: 2 },
      ],
      max: 12,
    },
  ],
  defaults: {
    eyebrow: "Why choose us",
    heading: "Learning beyond the classroom",
    intro: "",
    columns: "3",
    style: "cards",
    items: [
      { icon: "graduation-cap", title: "Qualified teachers", text: "Trained, experienced teachers who know every student by name." },
      { icon: "flask-conical", title: "Science & computer labs", text: "Hands-on practicals from the early grades." },
      { icon: "library", title: "Library", text: "Thousands of books in English and Nepali, open every day." },
      { icon: "trophy", title: "Sports & clubs", text: "Football, basketball, music, art, debate and more." },
      { icon: "bus", title: "Safe transport", text: "School buses on major routes with trained staff." },
      { icon: "shield-check", title: "Safe campus", text: "CCTV, first aid and a caring environment." },
    ],
  },
  render: (p) =>
    html`<div class="container">
      ${sectionHeading(p)}
      <div class="${cx("grid", `cols-${asString(p.columns) || "3"}`)}">
        ${asArray<{ icon: string; title: string; text: string }>(p.items).map(
          (item) => html`<div class="${cx("feature", p.style === "cards" && "card")}">
            <span class="feature-icon">${icon(item.icon, 26)}</span>
            <h3>${item.title}</h3>
            <p>${item.text}</p>
          </div>`,
        )}
      </div>
    </div>`,
});

const STAT_SOURCES = [
  { value: "manual", label: "Type a number" },
  { value: "students", label: "Live: number of students" },
  { value: "teachers", label: "Live: number of staff" },
  { value: "classes", label: "Live: number of classes" },
  { value: "parents", label: "Live: number of parents" },
];

export const statsBlock = defineBlock({
  type: "stats",
  label: "Numbers",
  description: "Big numbers like students, teachers, years, pass rate",
  category: "Content",
  icon: "award",
  fields: [
    ...headingFields,
    {
      name: "items",
      label: "Numbers",
      type: "list",
      itemLabel: "Number",
      newItem: { source: "manual", value: "100+", label: "Something" },
      fields: [
        { name: "source", label: "Value", type: "select", options: STAT_SOURCES },
        { name: "value", label: "Number (when typed)", type: "text" },
        { name: "label", label: "Label", type: "text" },
      ],
      max: 6,
    },
  ],
  defaults: {
    eyebrow: "",
    heading: "",
    intro: "",
    items: [
      { source: "students", value: "", label: "Students" },
      { source: "teachers", value: "", label: "Teachers & staff" },
      { source: "manual", value: "28", label: "Years of excellence" },
      { source: "manual", value: "100%", label: "SEE pass rate" },
    ],
  },
  style: { background: "brand" },
  render: (p, ctx) => {
    const live = ctx.data.stats as Record<string, number>;
    return html`<div class="container">
      ${sectionHeading(p)}
      <div class="stats">
        ${asArray<{ source: string; value: string; label: string }>(p.items).map(
          (item) => html`<div class="stat"><strong>${item.source && item.source !== "manual" ? `${live[item.source] ?? 0}+` : item.value}</strong><span>${item.label}</span></div>`,
        )}
      </div>
    </div>`;
  },
});

export const ctaBlock = defineBlock({
  type: "cta",
  label: "Call to action",
  description: "Highlighted strip with a message and buttons",
  category: "Content",
  icon: "target",
  fields: [
    { name: "heading", label: "Heading", type: "text" },
    { name: "text", label: "Text", type: "textarea", rows: 2 },
    { name: "primaryLabel", label: "Button text", type: "text" },
    { name: "primaryLink", label: "Button link", type: "link" },
    { name: "secondaryLabel", label: "Second button text", type: "text" },
    { name: "secondaryLink", label: "Second button link", type: "link" },
  ],
  defaults: {
    heading: "Admissions are open for the new academic year",
    text: "Visit the school, meet our teachers and see the classrooms. We'd love to welcome your child.",
    primaryLabel: "Apply now",
    primaryLink: "#admission",
    secondaryLabel: "Contact us",
    secondaryLink: "#contact",
  },
  render: (p, ctx) =>
    html`<div class="container"><div class="cta">
      <div><h2>${asString(p.heading)}</h2>${p.text ? html`<p>${asString(p.text)}</p>` : ""}</div>
      <div class="btn-row">${button(p.primaryLabel, p.primaryLink, ctx, "light")}${button(p.secondaryLabel, p.secondaryLink, ctx, "secondary")}</div>
    </div></div>`,
});

export const faqBlock = defineBlock({
  type: "faq",
  label: "Questions & answers",
  description: "Expandable FAQ — admissions, fees, transport",
  category: "Content",
  icon: "lightbulb",
  fields: [
    ...headingFields,
    {
      name: "items",
      label: "Questions",
      type: "list",
      itemLabel: "Question",
      newItem: { question: "New question?", answer: "Answer." },
      fields: [
        { name: "question", label: "Question", type: "text" },
        { name: "answer", label: "Answer", type: "textarea", rows: 3 },
      ],
    },
  ],
  defaults: {
    eyebrow: "FAQ",
    heading: "Frequently asked questions",
    intro: "",
    items: [
      { question: "When do admissions open?", answer: "Admissions for the new academic year open in Chaitra. Seats are limited, so we recommend applying early." },
      { question: "Is transport available?", answer: "Yes, our buses cover most areas of the city. Contact the office for routes and fees." },
      { question: "What documents are needed?", answer: "Birth certificate, previous school's report card and transfer certificate, and two passport-size photos." },
    ],
  },
  render: (p) =>
    html`<div class="container container-narrow">
      ${sectionHeading(p)}
      <div class="faq">${asArray<{ question: string; answer: string }>(p.items).map(
        (item) => html`<details><summary>${item.question}${icon("chevron-down", 18)}</summary><p>${item.answer}</p></details>`,
      )}</div>
    </div>`,
});

export const testimonialsBlock = defineBlock({
  type: "testimonials",
  label: "Testimonials",
  description: "What parents, students and alumni say",
  category: "Content",
  icon: "quote",
  fields: [
    ...headingFields,
    {
      name: "items",
      label: "Testimonials",
      type: "list",
      itemLabel: "Testimonial",
      newItem: { quote: "A wonderful school.", name: "Name", role: "Parent", photo: null },
      fields: [
        { name: "quote", label: "Quote", type: "textarea", rows: 3 },
        { name: "name", label: "Name", type: "text" },
        { name: "role", label: "Who they are", type: "text" },
        { name: "photo", label: "Photo", type: "image" },
      ],
      max: 9,
    },
  ],
  defaults: {
    eyebrow: "Testimonials",
    heading: "What our families say",
    intro: "",
    items: [
      { quote: "The teachers truly care. My daughter looks forward to school every single day.", name: "Sunita Karki", role: "Parent, Grade 4", photo: null },
      { quote: "The school gave me the confidence and the foundation I needed for engineering.", name: "Bibek Thapa", role: "Alumnus, batch 2078", photo: null },
      { quote: "Regular updates on the app mean I always know how my son is doing.", name: "Ramesh Adhikari", role: "Parent, Grade 7", photo: null },
    ],
  },
  style: { background: "muted" },
  render: (p, ctx) =>
    html`<div class="container">
      ${sectionHeading(p)}
      <div class="grid cols-3">${asArray<{ quote: string; name: string; role: string; photo: string | null }>(p.items).map(
        (item) => html`<figure class="card testimonial">
          <span class="quote-mark">${icon("quote", 28)}</span>
          <blockquote>${item.quote}</blockquote>
          <figcaption>${item.photo ? image(item.photo, item.name, ctx, "avatar") : html`<span class="avatar avatar-initials">${(item.name || "?").slice(0, 1)}</span>`}
            <span><strong>${item.name}</strong><small>${item.role}</small></span></figcaption>
        </figure>`,
      )}</div>
    </div>`,
});

export const spacerBlock = defineBlock({
  type: "spacer",
  label: "Space / divider",
  description: "Empty space or a line between sections",
  category: "Content",
  icon: "menu",
  fields: [
    { name: "size", label: "Height", type: "number", min: 8, max: 200 },
    { name: "line", label: "Show a line", type: "toggle" },
  ],
  defaults: { size: 40, line: false },
  style: { padding: "none" },
  render: (p) =>
    html`<div class="container" style="height:${asNumber(p.size, 40)}px;display:flex;align-items:center">${p.line ? html`<hr class="divider">` : ""}</div>`,
});

