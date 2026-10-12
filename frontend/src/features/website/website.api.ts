import { useQuery } from "@tanstack/react-query";
import type { Block, BlockCategory, Field, FooterConfig, HeaderConfig, SectionStyle, SiteData, Theme } from "@site-renderer";
import { api } from "@/lib/api";

export interface WebsitePageSummary {
  id: string;
  title: string;
  slug: string;
  isHome: boolean;
  status: "DRAFT" | "PUBLISHED";
  showInMenu: boolean;
  menuOrder: number;
  publishedAt: string | null;
  updatedAt: string;
  hasUnpublishedChanges: boolean;
}

export interface WebsitePageDetail extends WebsitePageSummary {
  draftBlocks: Block[];
  publishedBlocks: Block[] | null;
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface WebsiteOverview {
  id: string;
  isPublished: boolean;
  customDomain: string | null;
  publishedAt: string | null;
  theme: Theme;
  header: HeaderConfig;
  footer: FooterConfig;
  seo: { title: string; description: string; imageKey: string | null; imageUrl: string | null };
  schoolCode: string;
  pages: WebsitePageSummary[];
  counts: { notices: number; news: number; events: number; albums: number; newEnquiries: number };
}

/** Block definitions as sent by the API (without the render function). */
export interface BlockMeta {
  type: string;
  label: string;
  description: string;
  category: BlockCategory;
  icon: string;
  fields: Field[];
  defaults: Record<string, unknown>;
  data?: (keyof SiteData)[];
  style?: SectionStyle;
}

export interface BuilderMeta {
  blocks: BlockMeta[];
  templates: { id: string; name: string; description: string; title: string; slug: string }[];
  themes: { id: string; name: string; theme: Theme }[];
  fonts: { name: string; category: string; note?: string }[];
}

export interface Album {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  isPublished: boolean;
  eventDate: string | null;
  photos: { key: string; caption?: string; url: string }[];
  createdAt: string;
}

export const useWebsite = () => useQuery({ queryKey: ["website"], queryFn: () => api.get<WebsiteOverview>("/website") });

export const useBuilderMeta = () => useQuery({ queryKey: ["website-builder"], queryFn: () => api.get<BuilderMeta>("/website/builder"), staleTime: Infinity });

export const useAlbums = () => useQuery({ queryKey: ["website-albums"], queryFn: () => api.get<Album[]>("/website/albums") });

/** Address of the public website (proxied through the web app in development). */
export function siteUrl(schoolCode: string, slug = "") {
  return `${window.location.origin}/sites/${schoolCode}${slug ? `/${slug}` : "/"}`;
}

/** Public URL of a website file key (same as the server uses). */
export function publicFileUrl(key: string) {
  return `${import.meta.env.VITE_API_URL ?? ""}/api/files/public/${key}`;
}
