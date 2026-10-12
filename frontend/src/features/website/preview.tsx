import {
  googleFontsUrl,
  renderFooter,
  renderHeader,
  menuItems,
  SITE_CSS,
  themeCss,
  type FooterConfig,
  type HeaderConfig,
  type RenderContext,
  type Theme,
} from "@site-renderer";
import type { WebsitePageSummary } from "./website.api";

/** Components that show website content inside the admin app, using the public site's renderer. */

/** <style> with the theme and site CSS, plus the Google Fonts link. */
export function SiteStyles({ theme }: { theme: Theme }) {
  return (
    <>
      <link rel="stylesheet" href={googleFontsUrl(theme)} />
      <style>{themeCss(theme) + SITE_CSS}</style>
    </>
  );
}

export function PreviewHeader({ header, footer, pages, ctx }: { header: HeaderConfig; footer: FooterConfig; pages: WebsitePageSummary[]; ctx: RenderContext }) {
  const menu = menuItems(header, pages.filter((p) => p.showInMenu && p.status === "PUBLISHED"));
  return <div dangerouslySetInnerHTML={{ __html: renderHeader(header, footer, menu, ctx, "").value }} />;
}

export function PreviewFooter({ footer, ctx }: { footer: FooterConfig; ctx: RenderContext }) {
  return <div dangerouslySetInnerHTML={{ __html: renderFooter(footer, ctx).value }} />;
}
