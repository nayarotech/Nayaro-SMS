import { getBlock } from "./blocks/index.js";
import type { Block, SectionStyle } from "./types.js";

/**
 * Ready-made pages. Each is a list of blocks using the blocks' defaults plus
 * a few overrides. Used by "New page → template" and "Create my website".
 */

export const newBlockId = () => globalThis.crypto.randomUUID();

/** A block of `type` with its default props, optionally overridden. */
export function createBlock(type: string, props: Record<string, unknown> = {}, style?: SectionStyle): Block {
  const definition = getBlock(type);
  if (!definition) throw new Error(`Unknown block type "${type}"`);
  return {
    id: newBlockId(),
    type,
    props: structuredClone({ ...definition.defaults, ...props }),
    style: { ...(definition.style ?? {}), ...(style ?? {}) },
  };
}

export interface PageTemplate {
  id: string;
  name: string;
  description: string;
  title: string;
  slug: string;
  blocks: () => Block[];
}

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "blank",
    name: "Blank page",
    description: "Start from nothing and add blocks",
    title: "New page",
    slug: "new-page",
    blocks: () => [createBlock("pageHeader", { heading: "New page", subheading: "" })],
  },
  {
    id: "home",
    name: "Home page",
    description: "Welcome banner, numbers, about, facilities, news, events, gallery and admissions",
    title: "Home",
    slug: "",
    blocks: () => [
      createBlock("announcement"),
      createBlock("hero"),
      createBlock("stats"),
      createBlock("imageText", {}, { anchor: "about" }),
      createBlock("features", {}, { background: "muted" }),
      createBlock("message"),
      createBlock("notices", {}, { background: "muted" }),
      createBlock("news"),
      createBlock("events", {}, { background: "muted" }),
      createBlock("gallery"),
      createBlock("testimonials"),
      createBlock("cta", {}, { padding: "sm" }),
      createBlock("enquiry"),
    ],
  },
  {
    id: "about",
    name: "About us",
    description: "History, vision and values, principal's message and team",
    title: "About us",
    slug: "about",
    blocks: () => [
      createBlock("pageHeader"),
      createBlock("imageText", {
        eyebrow: "Our story",
        heading: "Over two decades of learning together",
        body: "<p>Our school started with a handful of students and a big dream. Today we are proud to serve hundreds of families, while keeping the warmth of a small community.</p><p>We believe every child is capable of great things when they feel safe, valued and challenged.</p>",
        buttonLabel: "",
      }),
      createBlock(
        "features",
        {
          eyebrow: "What we stand for",
          heading: "Vision, mission and values",
          items: [
            { icon: "target", title: "Our vision", text: "To nurture confident, compassionate learners ready for a changing world." },
            { icon: "lightbulb", title: "Our mission", text: "Quality teaching, strong values and every child's individual growth." },
            { icon: "heart", title: "Our values", text: "Respect, honesty, curiosity and service to the community." },
          ],
        },
        { background: "muted" },
      ),
      createBlock("message"),
      createBlock("team", {}, { background: "muted" }),
      createBlock("stats"),
    ],
  },
  {
    id: "academics",
    name: "Academics",
    description: "Programs from pre-primary to secondary and facilities",
    title: "Academics",
    slug: "academics",
    blocks: () => [
      createBlock("pageHeader", { heading: "Academics", subheading: "A strong curriculum from the first day of school to the SEE." }),
      createBlock("features", {
        eyebrow: "Programs",
        heading: "Learning at every stage",
        columns: "4",
        items: [
          { icon: "baby", title: "Pre-primary", text: "Nursery, LKG and UKG — learning through play, songs and stories." },
          { icon: "book-open", title: "Primary (1–5)", text: "Strong foundations in language, maths and curiosity about the world." },
          { icon: "brain", title: "Lower secondary (6–8)", text: "Science, computers and projects that build independent thinking." },
          { icon: "graduation-cap", title: "Secondary (9–10)", text: "Focused SEE preparation with regular tests and extra support." },
        ],
      }),
      createBlock(
        "imageText",
        { eyebrow: "Facilities", heading: "Spaces that help children learn", imageSide: "right", buttonLabel: "" },
        { background: "muted" },
      ),
      createBlock("features"),
      createBlock("downloads", { heading: "Academic documents", files: [{ title: "Academic calendar 2083", link: "" }, { title: "Book list 2083", link: "" }] }),
    ],
  },
  {
    id: "admissions",
    name: "Admissions",
    description: "How to apply, documents, fees, FAQ and the enquiry form",
    title: "Admissions",
    slug: "admissions",
    blocks: () => [
      createBlock("pageHeader", { heading: "Admissions", subheading: "Joining our school is simple. Here's how." }),
      createBlock("features", {
        eyebrow: "How to apply",
        heading: "Four simple steps",
        columns: "4",
        style: "cards",
        items: [
          { icon: "file-text", title: "1. Enquire", text: "Fill the form below or visit the school office." },
          { icon: "calendar", title: "2. Visit", text: "Tour the school and meet our teachers." },
          { icon: "check", title: "3. Assessment", text: "A friendly interaction to understand your child." },
          { icon: "school", title: "4. Admission", text: "Submit documents and complete enrolment." },
        ],
      }),
      createBlock("downloads", {}, { background: "muted" }),
      createBlock("faq"),
      createBlock("enquiry"),
    ],
  },
  {
    id: "contact",
    name: "Contact us",
    description: "Contact details, map and a message form",
    title: "Contact",
    slug: "contact",
    blocks: () => [
      createBlock("pageHeader", { heading: "Contact us", subheading: "We're happy to answer your questions." }),
      createBlock("contact", {}, { anchor: "contact" }),
      createBlock("enquiry", { eyebrow: "Write to us", heading: "Send us a message", intro: "", kind: "contact", buttonLabel: "Send message", successMessage: "Thank you! We'll reply soon." }, { anchor: "message" }),
    ],
  },
];

/** The pages created by "Create my website", in menu order. */
export const STARTER_SITE = ["home", "about", "academics", "admissions", "contact"];

export function getTemplate(id: string) {
  return PAGE_TEMPLATES.find((t) => t.id === id);
}
