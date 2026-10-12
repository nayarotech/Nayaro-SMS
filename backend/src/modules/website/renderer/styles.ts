/**
 * Stylesheet for every school website. Colours, fonts and corner radius come
 * from the theme's CSS variables (theme.ts), so this file never hard-codes a brand.
 *
 * Everything is scoped under .sms-site so the same CSS can be used inside the
 * admin's page editor. Layout responds to the width of .sms-site (container
 * queries), which lets the editor preview phone/tablet/desktop sizes.
 */
export const SITE_CSS = String.raw`
.sms-site{container:site/inline-size;background:var(--c-bg);color:var(--c-text);font-family:var(--font-body);font-size:16px;line-height:1.65;-webkit-font-smoothing:antialiased}
.sms-site *,.sms-site *::before,.sms-site *::after{box-sizing:border-box;margin:0;padding:0;border:0 solid}
.sms-site img,.sms-site svg,.sms-site iframe{display:block;max-width:100%}
.sms-site a{color:inherit;text-decoration:none}
.sms-site h1,.sms-site h2,.sms-site h3,.sms-site h4{font-family:var(--font-heading);color:var(--c-heading);line-height:1.2;font-weight:700;letter-spacing:-.01em}
.sms-site button,.sms-site input,.sms-site select,.sms-site textarea{font:inherit;color:inherit}

/* Layout */
.sms-site .container{width:100%;max-width:1180px;margin-inline:auto;padding-inline:20px}
.sms-site .container-narrow{max-width:820px}
.sms-site .full-bleed{width:100%}
.sms-site .center{text-align:center}
.sms-site .muted{color:var(--c-muted-text)}
.sms-site .block{position:relative}
.sms-site .pad-none{padding-block:0}
.sms-site .pad-sm{padding-block:32px}
.sms-site .pad-md{padding-block:56px}
.sms-site .pad-lg{padding-block:88px}
@container site (min-width:768px){.sms-site .pad-md{padding-block:80px}.sms-site .pad-lg{padding-block:120px}}
.sms-site .bg-muted{background:var(--c-muted)}
.sms-site .bg-brand{background:var(--c-primary);color:#fff}
.sms-site .bg-dark{background:var(--c-dark);color:#fff}
.sms-site .bg-image{background:linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,.55)),var(--section-image) center/cover;color:#fff}
.sms-site :is(.bg-brand,.bg-dark,.bg-image) :is(h1,h2,h3,.intro,.eyebrow){color:#fff}
.sms-site :is(.bg-brand,.bg-dark,.bg-image) .card{color:var(--c-text)}
.sms-site :is(.bg-brand,.bg-dark,.bg-image) .card h3{color:var(--c-heading)}
@container site (max-width:639px){.sms-site .hide-mobile{display:none}}

/* Section headings */
.sms-site .section-heading{text-align:center;max-width:720px;margin:0 auto 40px}
.sms-site .section-heading.is-left{text-align:left;margin-left:0}
.sms-site .eyebrow{display:inline-block;font-size:.8rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--c-primary);margin-bottom:10px}
.sms-site .bg-brand .eyebrow{color:var(--c-secondary)}
.sms-site .section-heading h2{font-size:clamp(1.6rem,4cqi,2.4rem)}
.sms-site .intro{margin-top:14px;font-size:1.08rem;color:var(--c-muted-text)}

/* Buttons */
.sms-site .btn-row{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}
.sms-site .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:12px 26px;border-radius:var(--btn-radius);font-weight:600;font-size:.98rem;cursor:pointer;transition:transform .15s,background .15s,box-shadow .15s}
.sms-site .btn:hover{transform:translateY(-1px)}
.sms-site .btn-primary{background:var(--c-primary);color:#fff;box-shadow:0 6px 20px -8px var(--c-primary)}
.sms-site .btn-primary:hover{background:var(--c-primary-dark)}
.sms-site .bg-brand .btn-primary,.sms-site .cta .btn-light{background:#fff;color:var(--c-primary)}
.sms-site .btn-secondary{border:2px solid currentColor;color:var(--c-primary)}
.sms-site :is(.bg-brand,.bg-dark,.cta,.hero-cover) .btn-secondary{color:#fff}
.sms-site .btn-light{background:#fff;color:var(--c-primary)}
.sms-site .btn[disabled]{opacity:.6;cursor:not-allowed}

/* Hero */
.sms-site .hero{position:relative;display:flex;align-items:center;overflow:hidden}
.sms-site .hero-md{min-height:420px}
.sms-site .hero-lg{min-height:560px}
.sms-site .hero-full{min-height:88vh}
.sms-site .hero-cover{background:linear-gradient(100deg,rgba(0,0,0,.72),rgba(0,0,0,.25)),var(--hero-image) center/cover;color:#fff;padding-block:80px}
.sms-site .hero-gradient{background:radial-gradient(circle at 85% 15%,color-mix(in srgb,var(--c-secondary) 55%,transparent),transparent 40%),linear-gradient(135deg,var(--c-primary),var(--c-dark))}
.sms-site .hero-cover h1,.sms-site .page-header h1{color:#fff;font-size:clamp(2.1rem,6.5cqi,4rem)}
.sms-site .hero-center{text-align:center}
.sms-site .hero-center .hero-text{max-width:820px;margin-inline:auto}
.sms-site .hero-center .btn-row{justify-content:center}
.sms-site .hero-left .hero-text{max-width:640px}
.sms-site .hero-eyebrow{display:inline-block;padding:6px 14px;border-radius:999px;background:rgba(255,255,255,.16);backdrop-filter:blur(4px);font-size:.85rem;font-weight:600;margin-bottom:20px}
.sms-site .hero-sub{margin-top:18px;font-size:clamp(1.02rem,2.2cqi,1.25rem);opacity:.92;max-width:640px}
.sms-site .hero-center .hero-sub{margin-inline:auto}
.sms-site .hero-split{background:var(--c-primary-soft);padding-block:56px}
.sms-site .hero-split h1{font-size:clamp(2rem,6cqi,3.4rem)}
.sms-site .hero-split .hero-eyebrow{background:var(--c-primary);color:#fff}
.sms-site .hero-split-grid{display:grid;gap:40px;align-items:center}
@container site (min-width:900px){.sms-site .hero-split-grid{grid-template-columns:1.05fr 1fr}}
.sms-site .hero-media img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:calc(var(--radius) * 2);box-shadow:0 30px 60px -30px rgba(0,0,0,.45)}
.sms-site .hero-art{aspect-ratio:4/3;display:grid;place-items:center;border-radius:calc(var(--radius) * 2);background:linear-gradient(135deg,var(--c-primary),var(--c-secondary));color:rgba(255,255,255,.9)}
.sms-site .page-header{color:#fff;padding-block:72px 64px;text-align:center}
.sms-site .page-header.has-image{background:linear-gradient(rgba(0,0,0,.6),rgba(0,0,0,.6)),var(--hero-image) center/cover}
.sms-site .page-header p{margin:14px auto 0;max-width:680px;opacity:.9;font-size:1.1rem}

/* Flash news */
.sms-site .ticker{background:var(--c-dark);color:#fff;font-size:.93rem}
.sms-site .ticker-inner{display:flex;align-items:center;gap:16px;min-height:46px}
.sms-site .ticker-label{display:inline-flex;align-items:center;gap:6px;background:var(--c-secondary);color:var(--c-dark);padding:4px 12px;border-radius:999px;white-space:nowrap;font-size:.82rem}
.sms-site .ticker-track{overflow:hidden;flex:1;mask-image:linear-gradient(90deg,transparent,#000 4%,#000 96%,transparent)}
.sms-site .ticker-items{display:flex;gap:48px;width:max-content;animation:sms-ticker 38s linear infinite}
.sms-site .ticker-items:hover{animation-play-state:paused}
.sms-site .ticker-items a:hover{text-decoration:underline}
@keyframes sms-ticker{to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:reduce){.sms-site .ticker-items{animation:none}}

/* Text */
.sms-site .prose{font-size:1.04rem}
.sms-site .prose > * + *{margin-top:1em}
.sms-site .prose h2{font-size:1.6rem;margin-top:1.6em}
.sms-site .prose h3{font-size:1.25rem;margin-top:1.4em}
.sms-site .prose ul,.sms-site .prose ol{padding-left:1.4em}
.sms-site .prose ul{list-style:disc}
.sms-site .prose ol{list-style:decimal}
.sms-site .prose li + li{margin-top:.35em}
.sms-site .prose li::marker{color:var(--c-primary)}
.sms-site .prose a{color:var(--c-primary);text-decoration:underline;text-underline-offset:3px}
.sms-site .prose blockquote{border-left:4px solid var(--c-primary);padding:4px 0 4px 18px;font-style:italic;color:var(--c-muted-text)}
.sms-site .prose img{border-radius:var(--radius)}
.sms-site .prose table{width:100%;border-collapse:collapse}
.sms-site .prose th,.sms-site .prose td{border:1px solid var(--c-border);padding:8px 10px;text-align:left}

/* Image + text */
.sms-site .split{display:grid;gap:40px;align-items:center}
@container site (min-width:860px){.sms-site .split{grid-template-columns:1fr 1fr;gap:64px}.sms-site .split-reverse .split-media{order:2}}
.sms-site .rounded-media{width:100%;border-radius:calc(var(--radius) * 1.6);object-fit:cover;aspect-ratio:4/3}
.sms-site .img-placeholder{display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;aspect-ratio:4/3;width:100%;border-radius:var(--radius);background:repeating-linear-gradient(45deg,var(--c-muted),var(--c-muted) 12px,color-mix(in srgb,var(--c-muted) 70%,white) 12px,color-mix(in srgb,var(--c-muted) 70%,white) 24px);color:var(--c-muted-text);font-size:.9rem;text-align:center;padding:16px}

/* Grids & cards */
.sms-site .grid{display:grid;gap:24px}
@container site (min-width:640px){.sms-site .grid.cols-2,.sms-site .grid.cols-3,.sms-site .grid.cols-4{grid-template-columns:repeat(2,1fr)}}
@container site (min-width:960px){.sms-site .grid.cols-3{grid-template-columns:repeat(3,1fr)}.sms-site .grid.cols-4{grid-template-columns:repeat(4,1fr)}}
.sms-site .card{background:#fff;border:1px solid var(--c-border);border-radius:calc(var(--radius) * 1.4);padding:28px;transition:transform .2s,box-shadow .2s}
.sms-site a.card:hover,.sms-site .feature.card:hover{transform:translateY(-3px);box-shadow:0 18px 40px -24px rgba(15,23,42,.35)}
.sms-site .feature-icon{display:inline-grid;place-items:center;width:52px;height:52px;border-radius:var(--radius);background:var(--c-primary-soft);color:var(--c-primary);margin-bottom:18px}
.sms-site .feature h3{font-size:1.15rem;margin-bottom:8px}
.sms-site .feature p{color:var(--c-muted-text)}
.sms-site .bg-brand .feature:not(.card) p,.sms-site .bg-dark .feature:not(.card) p{color:rgba(255,255,255,.8)}

/* Numbers */
.sms-site .stats{display:grid;grid-template-columns:repeat(2,1fr);gap:28px;text-align:center}
@container site (min-width:860px){.sms-site .stats{grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}}
.sms-site .stat strong{display:block;font-family:var(--font-heading);font-size:clamp(2.2rem,6cqi,3.2rem);line-height:1.1}
.sms-site .stat span{opacity:.85}
.sms-site .bg-default .stat strong,.sms-site .bg-muted .stat strong{color:var(--c-primary)}

/* Call to action */
.sms-site .cta{display:flex;flex-wrap:wrap;gap:24px;align-items:center;justify-content:space-between;padding:44px;border-radius:calc(var(--radius) * 2);background:linear-gradient(120deg,var(--c-primary),var(--c-primary-dark));color:#fff}
.sms-site .cta h2{color:#fff;font-size:clamp(1.4rem,3.5cqi,2rem)}
.sms-site .cta p{margin-top:8px;opacity:.9;max-width:620px}
.sms-site .cta .btn-row{margin-top:0}

/* FAQ */
.sms-site .faq{display:grid;gap:12px}
.sms-site .faq details{background:#fff;border:1px solid var(--c-border);border-radius:var(--radius);padding:4px 20px}
.sms-site .faq summary{display:flex;justify-content:space-between;align-items:center;gap:16px;cursor:pointer;list-style:none;font-weight:600;padding:14px 0;color:var(--c-heading)}
.sms-site .faq summary::-webkit-details-marker{display:none}
.sms-site .faq details[open] summary svg{transform:rotate(180deg)}
.sms-site .faq details p{padding-bottom:16px;color:var(--c-muted-text)}

/* Testimonials & people */
.sms-site .testimonial{display:flex;flex-direction:column;gap:18px}
.sms-site .quote-mark{color:var(--c-secondary)}
.sms-site .testimonial blockquote{font-size:1.05rem;flex:1}
.sms-site .testimonial figcaption{display:flex;align-items:center;gap:12px}
.sms-site .testimonial figcaption span{display:flex;flex-direction:column}
.sms-site .testimonial small{color:var(--c-muted-text)}
.sms-site .avatar{width:46px;height:46px;border-radius:50%;object-fit:cover;aspect-ratio:1}
.sms-site .avatar-initials{display:grid;place-items:center;background:var(--c-primary-soft);color:var(--c-primary);font-weight:700}
.sms-site .person{text-align:center}
.sms-site .person-photo{width:100%;aspect-ratio:1;object-fit:cover;border-radius:calc(var(--radius) * 1.6);margin-bottom:14px;font-size:2.4rem}
.sms-site .person h3{font-size:1.05rem}
.sms-site .person p{color:var(--c-muted-text);font-size:.92rem}
.sms-site .message{display:grid;gap:40px;align-items:start}
@container site (min-width:860px){.sms-site .message{grid-template-columns:340px 1fr;gap:64px}}
.sms-site .message-photo .rounded-media{aspect-ratio:4/5}
.sms-site .signature{margin-top:24px;display:flex;flex-direction:column}
.sms-site .signature strong{font-family:var(--font-heading);font-size:1.15rem;color:var(--c-heading)}
.sms-site .signature span{color:var(--c-muted-text)}
.sms-site .divider{width:100%;height:1px;background:var(--c-border)}

/* Media */
.sms-site .figure figcaption{margin-top:10px;text-align:center;color:var(--c-muted-text);font-size:.92rem}
.sms-site .full-bleed .rounded-media{border-radius:0;aspect-ratio:21/9}
.sms-site .gallery{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
@container site (min-width:760px){.sms-site .gallery{grid-template-columns:repeat(4,1fr);gap:14px}}
.sms-site .gallery a{overflow:hidden;border-radius:var(--radius)}
.sms-site .gallery-thumb{width:100%;aspect-ratio:1;object-fit:cover;transition:transform .3s}
.sms-site .gallery a:hover .gallery-thumb{transform:scale(1.05)}
.sms-site .more-link{margin-top:28px}
.sms-site .more-link a{color:var(--c-primary);font-weight:600}
.sms-site .bg-brand .more-link a{color:#fff}
.sms-site .video{aspect-ratio:16/9;border-radius:calc(var(--radius) * 1.4);overflow:hidden;background:#000}
.sms-site .video iframe,.sms-site .video .img-placeholder{width:100%;height:100%;aspect-ratio:auto}

/* Downloads & notices */
.sms-site .file-list,.sms-site .notice-list{list-style:none;display:grid;gap:10px}
.sms-site .file-list a,.sms-site .notice-list a{display:flex;align-items:center;gap:14px;background:#fff;border:1px solid var(--c-border);border-radius:var(--radius);padding:14px 18px;transition:border-color .15s}
.sms-site .file-list a:hover,.sms-site .notice-list a:hover{border-color:var(--c-primary)}
.sms-site .file-list span,.sms-site .notice-title{flex:1;font-weight:500;color:var(--c-heading)}
.sms-site .file-list svg{color:var(--c-primary)}
.sms-site .notice-date{font-size:.82rem;font-weight:600;color:var(--c-primary);min-width:110px}
.sms-site .pin{display:inline-flex;color:var(--c-secondary);margin-right:6px;vertical-align:middle}
@container site (max-width:560px){.sms-site .notice-list a{flex-wrap:wrap;gap:4px 12px}.sms-site .notice-date{min-width:0;width:100%}}

/* Posts & events */
.sms-site .post-card{padding:0;overflow:hidden;display:flex;flex-direction:column}
.sms-site .post-cover{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:0}
.sms-site .post-body{padding:20px 22px 24px}
.sms-site .post-date{display:inline-flex;align-items:center;gap:6px;font-size:.82rem;font-weight:600;color:var(--c-primary);margin-bottom:8px}
.sms-site .post-body h3{font-size:1.12rem;margin-bottom:8px}
.sms-site .post-body p{color:var(--c-muted-text);font-size:.95rem}
.sms-site .events{display:grid;gap:16px}
@container site (min-width:860px){.sms-site .events{grid-template-columns:repeat(3,1fr)}}
.sms-site .event{display:flex;gap:18px;align-items:center;padding:20px}
.sms-site .event-date{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:76px;padding:10px 6px;border-radius:var(--radius);background:var(--c-primary);color:#fff;text-align:center;line-height:1.15}
.sms-site .event-date strong{font-size:1.7rem;font-family:var(--font-heading)}
.sms-site .event-date small{font-size:.72rem;opacity:.9}
.sms-site .event h3{font-size:1.05rem}
.sms-site .event small{display:inline-flex;align-items:center;gap:4px;color:var(--c-muted-text);margin-top:4px}

/* Contact & forms */
.sms-site .contact{display:grid;gap:32px}
@container site (min-width:860px){.sms-site .contact{grid-template-columns:1fr 1.4fr}}
.sms-site .contact-list{list-style:none;display:grid;gap:22px}
.sms-site .contact-list li{display:flex;gap:16px}
.sms-site .contact-list li > svg{flex:none;color:var(--c-primary);background:var(--c-primary-soft);padding:10px;width:44px;height:44px;border-radius:var(--radius)}
.sms-site .contact-list span{display:flex;flex-direction:column}
.sms-site .contact-list strong{color:var(--c-heading)}
.sms-site .contact-list a{color:var(--c-primary)}
.sms-site .map{min-height:320px;border-radius:calc(var(--radius) * 1.4);overflow:hidden;border:1px solid var(--c-border)}
.sms-site .map iframe,.sms-site .map .img-placeholder{width:100%;height:100%;min-height:320px;aspect-ratio:auto;border-radius:0}
.sms-site .form{display:grid;gap:18px}
.sms-site .form-grid{display:grid;gap:16px}
@container site (min-width:640px){.sms-site .form-grid{grid-template-columns:1fr 1fr}.sms-site .span-2{grid-column:span 2}}
.sms-site .form label{display:flex;flex-direction:column;gap:6px;font-size:.9rem;font-weight:500;color:var(--c-heading)}
.sms-site .form :is(input,select,textarea){width:100%;border:1px solid var(--c-border);border-radius:calc(var(--radius) * .8);padding:12px 14px;background:#fff;font-size:1rem}
.sms-site .form :is(input,select,textarea):focus{outline:2px solid var(--c-primary);outline-offset:1px}
.sms-site .form .btn{justify-self:start}
.sms-site .hp{position:absolute;left:-9999px}
.sms-site .form-status:empty{display:none}
.sms-site .form-status{padding:12px 14px;border-radius:var(--radius);background:var(--c-primary-soft);color:var(--c-primary);font-weight:500}

/* Site header */
.sms-site .topbar{background:var(--c-dark);color:rgba(255,255,255,.85);font-size:.85rem}
.sms-site .topbar .container{display:flex;flex-wrap:wrap;gap:6px 22px;align-items:center;justify-content:space-between;min-height:40px;padding-block:6px}
.sms-site .topbar-items{display:flex;flex-wrap:wrap;gap:6px 20px}
.sms-site .topbar a,.sms-site .topbar span{display:inline-flex;align-items:center;gap:6px}
.sms-site .topbar a:hover{color:#fff}
.sms-site .social{display:flex;gap:10px}
.sms-site .site-header{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--c-bg) 94%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--c-border)}
.sms-site .site-header .container{display:flex;align-items:center;gap:20px;min-height:76px}
.sms-site .brand{display:flex;align-items:center;gap:12px;margin-right:auto;min-width:0}
.sms-site .brand img{height:52px;width:auto}
.sms-site .brand-mark{display:grid;place-items:center;width:48px;height:48px;border-radius:var(--radius);background:var(--c-primary);color:#fff;font-weight:800;font-family:var(--font-heading)}
.sms-site .brand-text{display:flex;flex-direction:column;min-width:0}
.sms-site .brand-text strong{font-family:var(--font-heading);font-size:1.08rem;line-height:1.2;color:var(--c-heading);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sms-site .brand-text small{color:var(--c-muted-text);font-size:.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sms-site .nav{display:none}
.sms-site .nav > ul{list-style:none;display:flex;gap:4px;align-items:center}
.sms-site .nav li{position:relative}
.sms-site .nav a{display:flex;align-items:center;gap:4px;padding:10px 14px;border-radius:var(--radius);font-weight:500;font-size:.95rem}
.sms-site .nav a:hover,.sms-site .nav a.active{color:var(--c-primary);background:var(--c-primary-soft)}
.sms-site .nav .submenu{list-style:none;position:absolute;top:100%;left:0;min-width:220px;padding:8px;background:#fff;border:1px solid var(--c-border);border-radius:var(--radius);box-shadow:0 20px 40px -20px rgba(15,23,42,.3);opacity:0;visibility:hidden;transform:translateY(6px);transition:.15s}
.sms-site .nav li:hover > .submenu,.sms-site .nav li:focus-within > .submenu{opacity:1;visibility:visible;transform:none}
.sms-site .header-cta{display:none}
.sms-site .menu-toggle{display:grid;place-items:center;width:44px;height:44px;border-radius:var(--radius);background:var(--c-primary-soft);color:var(--c-primary);cursor:pointer}
.sms-site .mobile-nav{display:none;border-top:1px solid var(--c-border);background:var(--c-bg)}
.sms-site .mobile-nav.open{display:block}
.sms-site .mobile-nav ul{list-style:none;padding:8px 20px 20px}
.sms-site .mobile-nav a{display:block;padding:12px 0;border-bottom:1px solid var(--c-border);font-weight:500}
.sms-site .mobile-nav ul ul{padding:0 0 0 16px}
.sms-site .mobile-nav .btn{margin-top:16px;width:100%}
@container site (min-width:900px){.sms-site .nav,.sms-site .header-cta{display:flex}.sms-site .menu-toggle,.sms-site .mobile-nav.open{display:none}}

/* Footer */
.sms-site .site-footer{background:var(--c-dark);color:rgba(255,255,255,.75);padding-block:64px 0;font-size:.95rem}
.sms-site .footer-grid{display:grid;gap:36px}
@container site (min-width:860px){.sms-site .footer-grid{grid-template-columns:1.4fr repeat(var(--footer-cols,2),1fr) 1.2fr}}
.sms-site .site-footer h4{color:#fff;font-size:1rem;margin-bottom:16px}
.sms-site .site-footer ul{list-style:none;display:grid;gap:10px}
.sms-site .site-footer a:hover{color:#fff}
.sms-site .footer-brand{display:flex;align-items:center;gap:12px;margin-bottom:14px;color:#fff;font-family:var(--font-heading);font-weight:700;font-size:1.1rem}
.sms-site .footer-brand img{height:44px;width:auto;background:#fff;border-radius:var(--radius);padding:4px}
.sms-site .footer-contact li{display:flex;gap:10px;align-items:flex-start}
.sms-site .footer-contact svg{flex:none;margin-top:3px;color:var(--c-secondary)}
.sms-site .site-footer .social a{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.1)}
.sms-site .site-footer .social a:hover{background:var(--c-primary)}
.sms-site .footer-bottom{margin-top:48px;border-top:1px solid rgba(255,255,255,.12);padding-block:20px;display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;font-size:.85rem}

/* Built-in pages: articles, lists, albums */
.sms-site .breadcrumbs{font-size:.88rem;color:var(--c-muted-text);margin-bottom:18px}
.sms-site .breadcrumbs a{color:var(--c-primary)}
.sms-site .article-meta{display:flex;flex-wrap:wrap;gap:8px 18px;color:var(--c-muted-text);font-size:.92rem;margin:14px 0 28px}
.sms-site .article-meta span{display:inline-flex;align-items:center;gap:6px}
.sms-site .article h1{font-size:clamp(1.8rem,5cqi,2.6rem)}
.sms-site .article-cover{width:100%;border-radius:calc(var(--radius) * 1.4);margin-bottom:28px;aspect-ratio:16/9;object-fit:cover}
.sms-site .attachments{margin-top:32px}
.sms-site .tabs{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:32px}
.sms-site .tabs a{padding:8px 18px;border-radius:999px;border:1px solid var(--c-border);font-weight:500}
.sms-site .tabs a.active{background:var(--c-primary);border-color:var(--c-primary);color:#fff}
.sms-site .pagination{display:flex;justify-content:center;gap:12px;margin-top:36px}
.sms-site .pagination a{padding:10px 18px;border:1px solid var(--c-border);border-radius:var(--radius);font-weight:500}
.sms-site .album-card .post-body{padding:16px 18px}
.sms-site .empty-state{text-align:center;padding:60px 20px;color:var(--c-muted-text)}
.sms-site .empty-state h1{font-size:3rem;color:var(--c-primary)}

/* Lightbox */
.sms-lightbox{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.9);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;gap:14px;color:#fff;font-family:system-ui,sans-serif}
.sms-lightbox img{max-width:100%;max-height:82vh;border-radius:8px}
.sms-lightbox button{position:absolute;background:rgba(255,255,255,.12);color:#fff;border:0;width:48px;height:48px;border-radius:50%;font-size:24px;cursor:pointer}
.sms-lightbox .lb-close{top:16px;right:16px}
.sms-lightbox .lb-prev{left:16px;top:50%}
.sms-lightbox .lb-next{right:16px;top:50%}
`;
