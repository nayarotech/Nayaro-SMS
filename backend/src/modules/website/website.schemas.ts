import { z } from "zod";
import { BLOCKS_BY_TYPE } from "./renderer/blocks/index.js";
import { FONTS } from "./renderer/theme.js";

/** Validation for everything the website editor saves. */

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #1d4ed8");
const fontName = z.enum(FONTS.map((f) => f.name) as [string, ...string[]]);
const link = z.string().max(500);

export const blockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.string().refine((type) => BLOCKS_BY_TYPE.has(type), "Unknown block type"),
  props: z.record(z.string(), z.unknown()),
  style: z
    .object({
      background: z.enum(["default", "muted", "brand", "dark", "image"]).optional(),
      backgroundImage: z.string().nullable().optional(),
      padding: z.enum(["none", "sm", "md", "lg"]).optional(),
      anchor: z.string().max(40).optional(),
      hideOnMobile: z.boolean().optional(),
    })
    .optional(),
});

export const blocksSchema = z.array(blockSchema).max(80, "A page can have at most 80 sections");

export const themeSchema = z.object({
  preset: z.string().max(40),
  colors: z.object({ primary: color, secondary: color, text: color, background: color, muted: color, dark: color }),
  headingFont: fontName,
  bodyFont: fontName,
  radius: z.enum(["none", "sm", "md", "lg"]),
  buttonShape: z.enum(["square", "rounded", "pill"]),
});

const menuItem: z.ZodType<{ id: string; label: string; link: string; children?: { id: string; label: string; link: string }[] }> = z.object({
  id: z.string().max(64),
  label: z.string().trim().min(1).max(40),
  link,
  children: z.array(z.object({ id: z.string().max(64), label: z.string().trim().min(1).max(40), link })).max(12).optional(),
});

export const headerSchema = z.object({
  showTopBar: z.boolean(),
  topBarText: z.string().max(120),
  autoMenu: z.boolean(),
  menu: z.array(menuItem).max(10),
  ctaLabel: z.string().max(30),
  ctaLink: link,
});

export const footerSchema = z.object({
  about: z.string().max(400),
  columns: z.array(z.object({ title: z.string().max(40), links: z.array(z.object({ label: z.string().max(40), link })).max(10) })).max(3),
  social: z.object({ facebook: z.string().max(200), youtube: z.string().max(200), instagram: z.string().max(200) }),
  copyright: z.string().max(160),
});

export const seoSchema = z.object({
  title: z.string().max(70),
  description: z.string().max(170),
  imageKey: z.string().nullable(),
});

/** Page URL part: lowercase letters, numbers and dashes. "" is the home page. */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes, e.g. about-us")
  .max(60);

/** Paths used by the built-in pages, so pages can't take them. */
export const RESERVED_SLUGS = ["notices", "news", "events", "gallery", "enquiry", "sitemap.xml", "robots.txt", "preview", "api", "files"];
