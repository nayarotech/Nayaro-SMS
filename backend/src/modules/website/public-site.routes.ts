import express, { Router, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { phoneNumber } from "../../http/schemas.js";
import { createEnquiry } from "./content.service.js";
import { loadSite, renderDraftPreview, renderSitePath, verifyPreviewToken, type LoadedSite } from "./public-site.service.js";
import { cachedPage } from "./site-cache.js";
import { html } from "./renderer/html.js";

/**
 * Serves school websites to visitors (HTML, not JSON):
 *   http://api-host/sites/DEMO/...       always
 *   http://demo.<SITES_BASE_DOMAIN>/...  when SITES_BASE_DOMAIN is set
 *   http://www.school-domain.edu.np/...  a school's custom domain (Website → Settings)
 */
export function publicSiteRouter(): Router {
  const router = Router();
  const forms = [express.urlencoded({ extended: false, limit: "20kb" }), express.json({ limit: "20kb" })];

  router.get("/sites/_preview/:pageId", async (req, res) => {
    const pageId = String(req.params.pageId);
    if (!verifyPreviewToken(pageId, String(req.query.token ?? ""))) return res.status(403).send("This preview link has expired. Open the preview again from the editor.");
    const result = await renderDraftPreview(pageId, origin(req));
    if (!result) return res.status(404).send("Page not found");
    res.setHeader("Cache-Control", "no-store");
    return res.status(result.status).type("html").send(result.html);
  });

  router.post("/sites/:code/enquiry", enquiryLimiter, ...forms, async (req, res) => {
    const site = await loadSite({ schoolCode: String(req.params.code) });
    return handleEnquiry(req, res, site, `/sites/${String(req.params.code).toUpperCase()}`);
  });

  router.get(["/sites/:code", "/sites/:code/*path"], async (req, res) => {
    const code = String(req.params.code).toUpperCase();
    const site = await loadSite({ schoolCode: code });
    if (!site) return res.status(404).type("html").send(notFoundHtml());
    const path = `/${([] as string[]).concat((req.params as { path?: string | string[] }).path ?? []).join("/")}`;
    return sendPage(req, res, site, path, `/sites/${code}`);
  });

  // School subdomains and custom domains: any non-API request on another host
  router.use(async (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/sites")) return next();
    const site = await siteForHost(req.hostname);
    if (!site) return next();
    if (req.method === "POST" && req.path === "/enquiry") {
      return enquiryLimiter(req, res, () => forms[0](req, res, () => forms[1](req, res, () => void handleEnquiry(req, res, site, ""))));
    }
    if (req.method !== "GET") return next();
    return sendPage(req, res, site, req.path, "");
  });

  return router;
}

async function sendPage(req: Request, res: Response, site: LoadedSite, path: string, basePath: string) {
  const query = new URLSearchParams(req.url.split("?")[1] ?? "");
  const cacheKey = `${basePath}${path}?${query.toString()}`;
  const result = await cachedPage(site.school.id, cacheKey, () => renderSitePath(site, path, query, basePath, origin(req)));
  const contentType = path.endsWith(".xml") ? "application/xml" : path.endsWith(".txt") ? "text/plain" : "html";
  res.setHeader("Cache-Control", "public, max-age=60");
  res.setHeader("X-Cache", result.cached ? "HIT" : "MISS");
  return res.status(result.status).type(contentType).send(result.html);
}

/** Who to find: <code>.<SITES_BASE_DOMAIN>, or a school's custom domain. Cached briefly in memory. */
const hostCache = new Map<string, { schoolCode: string | null; at: number }>();
async function siteForHost(hostname: string): Promise<LoadedSite | null> {
  const base = env.SITES_BASE_DOMAIN?.trim();
  if (base && hostname.endsWith(`.${base}`)) return loadSite({ schoolCode: hostname.slice(0, -(base.length + 1)) });

  const cached = hostCache.get(hostname);
  if (!cached || Date.now() - cached.at > 60_000) {
    const website = await prisma.website.findUnique({ where: { customDomain: hostname }, select: { school: { select: { code: true } } } });
    hostCache.set(hostname, { schoolCode: website?.school.code ?? null, at: Date.now() });
  }
  const code = hostCache.get(hostname)!.schoolCode;
  return code ? loadSite({ schoolCode: code }) : null;
}

// ─── Enquiry form ────────────────────────────────────────────

const enquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skip: () => env.NODE_ENV === "test",
  handler: (req, res) => respond(req, res, 429, "Too many messages. Please try again later or call the school."),
});

const enquirySchema = z.object({
  kind: z.enum(["contact", "admission"]).default("contact"),
  name: z.string().trim().min(2, "Please enter your name").max(120),
  phone: phoneNumber,
  email: z.union([z.email(), z.literal("")]).optional(),
  subject: z.string().trim().max(160).optional(),
  message: z.string().trim().min(5, "Please write a short message").max(2000),
  /** Honeypot: real people never fill this hidden field */
  website: z.string().max(0).optional(),
});

async function handleEnquiry(req: Request, res: Response, site: LoadedSite | null, basePath: string) {
  if (!site || !site.website.isPublished) return respond(req, res, 404, "This website is not available.");
  const parsed = enquirySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    // Pretend success to bots that fill the honeypot
    if (parsed.error.issues.some((i) => i.path[0] === "website")) return respond(req, res, 200, "Thank you!");
    return respond(req, res, 400, parsed.error.issues[0]?.message === "Enter a valid 10-digit mobile number" ? "Please enter a valid mobile number." : parsed.error.issues[0]?.message ?? "Please check the form.");
  }
  const { website: _honeypot, ...data } = parsed.data;
  await createEnquiry(site.school.id, { ...data, email: data.email || null, subject: data.subject || null }, req.ip);
  return respond(req, res, 200, "Thank you! We'll be in touch soon.", basePath, site);
}

/** JSON for the site script, or a simple page when the form was posted without JavaScript. */
function respond(req: Request, res: Response, status: number, message: string, basePath = "", site?: LoadedSite) {
  if (req.accepts(["json", "html"]) === "json") {
    return res.status(status).json(status < 400 ? { ok: true, message } : { error: { message } });
  }
  const back = req.get("referer") ?? `${basePath || "/"}`;
  const title = status < 400 ? "Thank you" : "Something went wrong";
  return res
    .status(status)
    .type("html")
    .send(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html`${title}`}</title>` +
        `<body style="font-family:system-ui;max-width:520px;margin:15vh auto;padding:0 20px;text-align:center"><h1>${html`${title}`}</h1><p>${html`${message}`}</p>` +
        `<p><a href="${html`${back}`}">← Back${site ? html` to ${site.school.name}` : ""}</a></p></body>`,
    );
}

function origin(req: Request) {
  return `${req.protocol}://${req.get("host")}`;
}

function notFoundHtml() {
  return `<!doctype html><meta charset="utf-8"><title>Website not found</title><body style="font-family:system-ui;text-align:center;margin-top:20vh"><h1>Website not found</h1><p>Check the address and try again.</p></body>`;
}

