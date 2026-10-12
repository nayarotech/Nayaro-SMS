import { html, raw } from "../html.js";
import { asString, icon, sectionHeading } from "../helpers.js";
import { defineBlock, headingFields } from "./define.js";

/** Only Google Maps embed links are allowed in the map iframe. */
function mapEmbedUrl(value: string): string | null {
  const src = /src="([^"]+)"/.exec(value)?.[1] ?? value.trim();
  return /^https:\/\/(www\.)?google\.com\/maps\/embed/.test(src) ? src : null;
}

export const contactBlock = defineBlock({
  type: "contact",
  label: "Contact details & map",
  description: "Address, phone, email, office hours and a Google map",
  category: "Contact",
  icon: "map-pin",
  fields: [
    ...headingFields,
    { name: "address", label: "Address (leave empty to use the school profile)", type: "text" },
    { name: "phone", label: "Phone (leave empty to use the school profile)", type: "text" },
    { name: "email", label: "Email (leave empty to use the school profile)", type: "text" },
    { name: "hours", label: "Office hours", type: "text" },
    { name: "map", label: "Google Maps embed", type: "textarea", rows: 3, help: "Google Maps → Share → Embed a map → copy HTML, and paste it here" },
  ],
  defaults: {
    eyebrow: "Contact",
    heading: "Visit or get in touch",
    intro: "",
    address: "",
    phone: "",
    email: "",
    hours: "Sunday – Friday, 9:00 AM – 4:00 PM",
    map: "",
  },
  render: (p, ctx) => {
    const address = asString(p.address) || ctx.site.address;
    const phone = asString(p.phone) || ctx.site.phone;
    const email = asString(p.email) || ctx.site.email;
    const map = mapEmbedUrl(asString(p.map));
    return html`<div class="container">
      ${sectionHeading(p)}
      <div class="contact">
        <ul class="contact-list">
          ${address ? html`<li>${icon("map-pin")}<span><strong>Address</strong>${address}</span></li>` : ""}
          ${phone ? html`<li>${icon("phone")}<span><strong>Phone</strong><a href="tel:${phone}">${phone}</a></span></li>` : ""}
          ${email ? html`<li>${icon("mail")}<span><strong>Email</strong><a href="mailto:${email}">${email}</a></span></li>` : ""}
          ${p.hours ? html`<li>${icon("clock")}<span><strong>Office hours</strong>${asString(p.hours)}</span></li>` : ""}
        </ul>
        <div class="map">${map
          ? html`<iframe src="${map}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Map"></iframe>`
          : html`<div class="img-placeholder">${icon("map-pin", 32)}<span>Add a Google map in the settings</span></div>`}</div>
      </div>
    </div>`;
  },
});

export const enquiryBlock = defineBlock({
  type: "enquiry",
  label: "Enquiry form",
  description: "Contact or admission enquiry form — messages arrive in Website → Enquiries",
  category: "Contact",
  icon: "mail",
  fields: [
    ...headingFields,
    {
      name: "kind",
      label: "Form type",
      type: "select",
      options: [
        { value: "admission", label: "Admission enquiry (asks for the class)" },
        { value: "contact", label: "General contact" },
      ],
    },
    { name: "classes", label: "Classes to choose from (comma separated)", type: "text" },
    { name: "buttonLabel", label: "Button text", type: "text" },
    { name: "successMessage", label: "Thank-you message", type: "text" },
  ],
  defaults: {
    eyebrow: "Admissions",
    heading: "Admission enquiry",
    intro: "Leave your details and our admissions team will call you within one working day.",
    kind: "admission",
    classes: "Nursery, LKG, UKG, Grade 1, Grade 2, Grade 3, Grade 4, Grade 5, Grade 6, Grade 7, Grade 8, Grade 9, Grade 11",
    buttonLabel: "Send enquiry",
    successMessage: "Thank you! We'll be in touch soon.",
  },
  style: { background: "muted", anchor: "admission" },
  render: (p, ctx) => {
    const admission = p.kind !== "contact";
    const classes = asString(p.classes)
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const disabled = ctx.mode === "editor" ? raw(" disabled") : raw("");
    return html`<div class="container container-narrow">
      ${sectionHeading(p)}
      <form class="card form" method="post" action="${ctx.basePath}/enquiry" data-enquiry data-success="${asString(p.successMessage)}">
        <input type="hidden" name="kind" value="${admission ? "admission" : "contact"}">
        <div class="hp" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off"></label></div>
        <div class="form-grid">
          <label>${admission ? "Parent's name" : "Your name"}<input name="name" required maxlength="120" autocomplete="name"></label>
          <label>Mobile number<input name="phone" type="tel" required maxlength="20" autocomplete="tel"></label>
          <label>Email (optional)<input name="email" type="email" maxlength="160" autocomplete="email"></label>
          ${admission
            ? html`<label>Class<select name="subject">${classes.map((c) => html`<option>${c}</option>`)}</select></label>`
            : html`<label>Subject<input name="subject" maxlength="160"></label>`}
          <label class="span-2">Message<textarea name="message" rows="4" required maxlength="2000"></textarea></label>
        </div>
        <p class="form-status" role="status"></p>
        <button class="btn btn-primary" type="submit"${disabled}>${asString(p.buttonLabel) || "Send"}</button>
      </form>
    </div>`;
  },
});
