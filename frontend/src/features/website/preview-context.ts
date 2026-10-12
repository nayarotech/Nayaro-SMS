import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Block, PageLink, RenderContext, SiteData } from "@site-renderer";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatBsLong } from "@/lib/dates";
import { publicFileUrl, type WebsitePageSummary } from "./website.api";

/** Data and helpers for rendering website content inside the admin app. */

const EMPTY_DATA: SiteData = { notices: [], news: [], events: [], albums: [], stats: { students: 0, teachers: 0, classes: 0, parents: 0 } };

/** Live school data (notices, events, numbers…) for the given blocks. */
export function usePreviewData(blocks: Block[]) {
  // Refetch only when the set of block types changes, not on every keystroke
  const types = useMemo(() => [...new Set(blocks.map((b) => b.type))].sort().join(","), [blocks]);
  const query = useQuery({
    queryKey: ["website-preview-data", types],
    queryFn: () => api.post<SiteData>("/website/preview-data", { blocks: types.split(",").filter(Boolean).map((type, i) => ({ id: String(i), type, props: {} })) }),
    staleTime: 60_000,
  });
  return query.data ?? EMPTY_DATA;
}

/** Render context for the editor: links are inert and forms disabled. */
export function useEditorContext(data: SiteData, pages: WebsitePageSummary[], schoolCode: string): RenderContext {
  const { user } = useAuth();
  return useMemo(
    () => ({
      site: {
        schoolName: user?.school?.name ?? "",
        schoolCode,
        logoKey: logoKeyFromUrl(user?.school?.logoUrl),
        address: user?.school?.address ?? null,
        phone: user?.school?.phone ?? null,
        email: user?.school?.email ?? null,
        motto: String(user?.settings?.["branding.motto"] ?? ""),
      },
      data,
      pages: pages.map<PageLink>((p) => ({ id: p.id, title: p.title, slug: p.slug })),
      basePath: `/sites/${schoolCode}`,
      fileUrl: publicFileUrl,
      formatDate: (date) => formatBsLong(date.slice(0, 10)),
      mode: "editor",
    }),
    [user, data, pages, schoolCode],
  );
}

/** The logo's public URL ends with its storage key; the renderer works with keys. */
function logoKeyFromUrl(url: string | null | undefined): string | null {
  const match = url ? /\/api\/files\/public\/(.+)$/.exec(url) : null;
  return match ? decodeURIComponent(match[1]) : null;
}

/** Stops clicks inside a preview from following links or submitting forms. */
export function preventNavigation(event: React.MouseEvent) {
  const target = event.target as HTMLElement;
  if (target.closest("a, button, summary") && !target.closest("[data-editor-ui]")) event.preventDefault();
}
