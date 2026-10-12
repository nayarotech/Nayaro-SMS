import { getBlock } from "./blocks/index.js";
import { html, raw, type SafeHtml } from "./html.js";
import { sectionWrapper } from "./helpers.js";
import { renderFooter, renderHeader, type FooterConfig, type HeaderConfig, type MenuItem } from "./layout.js";
import { SITE_CSS } from "./styles.js";
import { googleFontsUrl, themeCss, type Theme } from "./theme.js";
import type { Block, RenderContext } from "./types.js";

/** Renders one block inside its section. Unknown block types render nothing. */
export function renderBlock(block: Block, ctx: RenderContext): SafeHtml {
  const definition = getBlock(block.type);
  if (!definition) return html``;
  const props = { ...definition.defaults, ...block.props };
  return sectionWrapper(block, definition.render(props, ctx), ctx);
}

export function renderBlocks(blocks: Block[], ctx: RenderContext): SafeHtml {
  return html`${blocks.map((block) => renderBlock(block, ctx))}`;
}

export interface DocumentInput {
  ctx: RenderContext;
  theme: Theme;
  header: HeaderConfig;
  footer: FooterConfig;
  menu: MenuItem[];
  currentPath: string;
  title: string;
  description: string;
  canonicalUrl: string;
  ogImageUrl?: string | null;
  body: SafeHtml;
  /** e.g. noindex for unpublished previews */
  robots?: string;
}

/** A complete HTML page for visitors: head (SEO, theme), header, content, footer, script. */
export function renderDocument(input: DocumentInput): string {
  const { ctx, theme } = input;
  const favicon = ctx.site.logoKey ? ctx.fileUrl(ctx.site.logoKey) : null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "School",
    name: ctx.site.schoolName,
    url: input.canonicalUrl,
    ...(ctx.site.address && { address: ctx.site.address }),
    ...(ctx.site.phone && { telephone: ctx.site.phone }),
    ...(ctx.site.email && { email: ctx.site.email }),
    ...(favicon && { logo: favicon }),
  };

  return `<!doctype html>${html`<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${input.title}</title>
<meta name="description" content="${input.description}">
<link rel="canonical" href="${input.canonicalUrl}">
${input.robots ? html`<meta name="robots" content="${input.robots}">` : ""}
<meta property="og:type" content="website">
<meta property="og:title" content="${input.title}">
<meta property="og:description" content="${input.description}">
<meta property="og:url" content="${input.canonicalUrl}">
<meta property="og:site_name" content="${ctx.site.schoolName}">
${input.ogImageUrl ? html`<meta property="og:image" content="${input.ogImageUrl}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="${theme.colors.primary}">
${favicon ? html`<link rel="icon" href="${favicon}">` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${googleFontsUrl(theme)}">
<style>body{margin:0}${raw(themeCss(theme))}${raw(SITE_CSS)}</style>
<script type="application/ld+json">${raw(JSON.stringify(jsonLd).replace(/</g, "\\u003c"))}</script>
</head>
<body>
<div class="sms-site">
${renderHeader(input.header, input.footer, input.menu, ctx, input.currentPath)}
<main>${input.body}</main>
${renderFooter(input.footer, ctx)}
</div>
<script>${raw(SITE_SCRIPT)}</script>
</body>
</html>`}`;
}

/**
 * The only JavaScript visitors download (~1 KB): mobile menu, photo lightbox,
 * and sending enquiry forms without a page reload. Everything works without it.
 */
const SITE_SCRIPT = `
(function(){
  var toggle=document.querySelector('[data-menu-toggle]'),nav=document.querySelector('[data-mobile-nav]');
  if(toggle&&nav)toggle.addEventListener('click',function(){var o=nav.classList.toggle('open');toggle.setAttribute('aria-expanded',o)});
  var photos=[].slice.call(document.querySelectorAll('[data-lightbox]'));
  photos.forEach(function(a,i){a.addEventListener('click',function(e){e.preventDefault();open(i)})});
  function open(i){
    var box=document.createElement('div');box.className='sms-lightbox';
    box.innerHTML='<button class="lb-close" aria-label="Close">×</button><button class="lb-prev" aria-label="Previous">‹</button><img alt=""><p></p><button class="lb-next" aria-label="Next">›</button>';
    function show(n){i=(n+photos.length)%photos.length;box.querySelector('img').src=photos[i].href;box.querySelector('p').textContent=photos[i].title||''}
    function close(){box.remove();document.removeEventListener('keydown',key)}
    function key(e){if(e.key==='Escape')close();if(e.key==='ArrowRight')show(i+1);if(e.key==='ArrowLeft')show(i-1)}
    box.querySelector('.lb-close').onclick=close;box.querySelector('.lb-prev').onclick=function(){show(i-1)};box.querySelector('.lb-next').onclick=function(){show(i+1)};
    box.addEventListener('click',function(e){if(e.target===box)close()});document.addEventListener('keydown',key);
    document.body.appendChild(box);show(i);
  }
  [].forEach.call(document.querySelectorAll('[data-enquiry]'),function(form){
    form.addEventListener('submit',function(e){
      e.preventDefault();var status=form.querySelector('.form-status'),btn=form.querySelector('button[type=submit]');
      btn.disabled=true;status.textContent='Sending…';
      fetch(form.action,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))})
        .then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error&&d.error.message||'Could not send');})})
        .then(function(){form.reset();status.textContent=form.dataset.success||'Thank you!'})
        .catch(function(err){status.textContent=err.message})
        .finally(function(){btn.disabled=false});
    });
  });
})();`;
