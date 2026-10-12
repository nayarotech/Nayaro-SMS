import type { SafeHtml } from "./html.js";

/**
 * Shapes shared by the block renderer (server) and the page editor (browser).
 * Nothing here may import server-only code.
 */

/** One section of a page, as stored in WebsitePage.draftBlocks / publishedBlocks. */
export interface Block {
  id: string;
  type: string;
  props: Record<string, unknown>;
  style?: SectionStyle;
}

/** Settings every block has, shown under "Section style" in the editor. */
export interface SectionStyle {
  background?: "default" | "muted" | "brand" | "dark" | "image";
  backgroundImage?: string | null;
  padding?: "none" | "sm" | "md" | "lg";
  anchor?: string;
  hideOnMobile?: boolean;
}

// ─── Editor fields ───────────────────────────────────────────
// Each block declares its settings as fields; the editor builds its form from them
// and the server uses them to sanitise rich text.

interface BaseField {
  name: string;
  label: string;
  help?: string;
}

export type Field =
  | (BaseField & { type: "text"; placeholder?: string })
  | (BaseField & { type: "textarea"; rows?: number })
  | (BaseField & { type: "richtext" })
  | (BaseField & { type: "image" })
  | (BaseField & { type: "link" })
  | (BaseField & { type: "icon" })
  | (BaseField & { type: "toggle" })
  | (BaseField & { type: "number"; min?: number; max?: number })
  | (BaseField & { type: "select"; options: { value: string; label: string }[] })
  | (BaseField & { type: "album" })
  | (BaseField & { type: "list"; itemLabel: string; fields: Field[]; newItem: Record<string, unknown>; max?: number });

export type BlockCategory = "Headers" | "Content" | "Media" | "School" | "Notices & events" | "Contact";

export interface BlockDefinition<P extends Record<string, unknown> = Record<string, unknown>> {
  type: string;
  label: string;
  description: string;
  category: BlockCategory;
  /** Name from icons.ts, shown in the block library */
  icon: string;
  fields: Field[];
  defaults: P;
  /** Live data this block shows (loaded by the server for public pages) */
  data?: (keyof SiteData)[];
  /** Default section style when the block is added */
  style?: SectionStyle;
  render: (props: P, ctx: RenderContext) => SafeHtml;
}

// ─── Render context ──────────────────────────────────────────

export interface PostSummary {
  id: string;
  type: "NOTICE" | "NEWS" | "EVENT";
  title: string;
  slug: string;
  excerpt: string | null;
  coverImageKey: string | null;
  isPinned: boolean;
  publishedAt: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  location: string | null;
}

export interface AlbumSummary {
  id: string;
  title: string;
  slug: string;
  coverKey: string | null;
  photoCount: number;
  photos: { key: string; caption?: string }[];
}

/** Live school data that dynamic blocks can show. */
export interface SiteData {
  notices: PostSummary[];
  news: PostSummary[];
  events: PostSummary[];
  albums: AlbumSummary[];
  stats: { students: number; teachers: number; classes: number; parents: number };
}

export interface SiteInfo {
  schoolName: string;
  schoolCode: string;
  logoKey: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  motto: string;
}

export interface PageLink {
  id: string;
  title: string;
  slug: string;
}

export interface RenderContext {
  site: SiteInfo;
  data: SiteData;
  pages: PageLink[];
  /** "/sites/DEMO" in development, "" on the school's own domain */
  basePath: string;
  /** Public URL for an uploaded file key */
  fileUrl: (key: string) => string;
  /** Formats an AD date for visitors (BS by default) */
  formatDate: (isoDate: string) => string;
  /** "editor" disables forms and links */
  mode: "public" | "editor";
}
