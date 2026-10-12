import { z } from "zod";
import { forbidden } from "../../lib/errors.js";
import { defineModule, route } from "../../http/route.js";
import { dateString, idParam, optionalText, pagination } from "../../http/schemas.js";
import * as content from "./content.service.js";
import { BLOCKS } from "./renderer/blocks/index.js";
import { PAGE_TEMPLATES } from "./renderer/templates.js";
import { FONTS, THEME_PRESETS } from "./renderer/theme.js";
import { loadSiteData, signPreviewToken } from "./public-site.service.js";
import * as website from "./website.service.js";
import { blocksSchema, footerSchema, headerSchema, seoSchema, slugSchema, themeSchema } from "./website.schemas.js";
import type { Block } from "./renderer/types.js";

const MODULE = "website";

export const websiteModule = defineModule("/website", "Website builder", [
  route({
    method: "get",
    path: "/",
    summary: "Website overview: settings, pages and content counts",
    permission: ["website.edit", "website.posts", "website.enquiries"],
    module: MODULE,
    handler: ({ schoolId }) => website.getWebsiteOverview(schoolId),
  }),

  route({
    method: "patch",
    path: "/",
    summary: "Change theme, header, footer, SEO, domain, or put the site online/offline",
    permission: "website.edit",
    module: MODULE,
    body: z
      .object({ theme: themeSchema, header: headerSchema, footer: footerSchema, seo: seoSchema, customDomain: z.string().max(190).nullable() })
      .partial()
      .extend({ isPublished: z.boolean().optional() }),
    handler: async ({ actor, auth, body }) => {
      if (body.isPublished !== undefined && !auth.permissions.has("website.publish")) {
        throw forbidden("You need permission to publish the website");
      }
      return website.updateWebsite(actor, body);
    },
  }),

  route({
    method: "get",
    path: "/builder",
    summary: "Everything the page editor needs: blocks, templates, themes and fonts",
    permission: "website.edit",
    module: MODULE,
    handler: () => ({
      blocks: BLOCKS.map(({ render: _render, ...definition }) => definition),
      templates: PAGE_TEMPLATES.map(({ blocks: _blocks, ...template }) => template),
      themes: THEME_PRESETS,
      fonts: FONTS,
    }),
  }),

  route({
    method: "post",
    path: "/preview-data",
    summary: "Live school data (notices, events, stats…) the given blocks show, for the editor preview",
    permission: "website.edit",
    module: MODULE,
    body: z.object({ blocks: blocksSchema }),
    handler: ({ schoolId, body }) => loadSiteData(schoolId, body.blocks as Block[]),
  }),

  route({
    method: "post",
    path: "/starter",
    summary: "Create the starter website (Home, About, Academics, Admissions, Contact)",
    permission: "website.edit",
    module: MODULE,
    status: 201,
    handler: ({ actor }) => website.createStarterSite(actor),
  }),

  // ─── Pages ─────────────────────────────────────────────────

  route({
    method: "post",
    path: "/pages",
    summary: "Create a page, optionally from a template",
    permission: "website.edit",
    module: MODULE,
    status: 201,
    body: z.object({ title: z.string().trim().min(1).max(80), slug: slugSchema.optional(), templateId: z.string().optional() }),
    handler: ({ actor, body }) => website.createPage(actor, body),
  }),

  route({
    method: "get",
    path: "/pages/:id",
    summary: "A page with its draft blocks",
    permission: "website.edit",
    module: MODULE,
    params: idParam,
    handler: ({ schoolId, params }) => website.getPage(schoolId, params.id),
  }),

  route({
    method: "patch",
    path: "/pages/:id",
    summary: "Change a page's title, address, SEO or menu visibility",
    permission: "website.edit",
    module: MODULE,
    params: idParam,
    body: z.object({ title: z.string().trim().min(1).max(80), slug: slugSchema, seoTitle: optionalText, seoDescription: optionalText, showInMenu: z.boolean() }).partial(),
    handler: ({ actor, params, body }) => website.updatePageSettings(actor, params.id, body),
  }),

  route({
    method: "put",
    path: "/pages/:id/draft",
    summary: "Save the page's draft (editor autosave)",
    permission: "website.edit",
    module: MODULE,
    params: idParam,
    body: z.object({ blocks: blocksSchema }),
    handler: ({ actor, params, body }) => website.saveDraft(actor, params.id, body.blocks as Block[]),
  }),

  route({
    method: "post",
    path: "/pages/:id/publish",
    summary: "Make the draft live",
    permission: "website.publish",
    module: MODULE,
    params: idParam,
    handler: ({ actor, params }) => website.publishPage(actor, params.id),
  }),

  route({
    method: "post",
    path: "/pages/:id/unpublish",
    summary: "Hide a page from visitors",
    permission: "website.publish",
    module: MODULE,
    params: idParam,
    handler: ({ actor, params }) => website.unpublishPage(actor, params.id),
  }),

  route({
    method: "post",
    path: "/pages/:id/home",
    summary: "Make this the home page",
    permission: "website.publish",
    module: MODULE,
    params: idParam,
    handler: ({ actor, params }) => website.setHomePage(actor, params.id),
  }),

  route({
    method: "post",
    path: "/pages/:id/duplicate",
    summary: "Copy a page",
    permission: "website.edit",
    module: MODULE,
    status: 201,
    params: idParam,
    handler: ({ actor, params }) => website.duplicatePage(actor, params.id),
  }),

  route({
    method: "put",
    path: "/pages-order",
    summary: "Set the menu order of pages",
    permission: "website.edit",
    module: MODULE,
    body: z.object({ pageIds: z.array(z.uuid()) }),
    handler: ({ actor, body }) => website.reorderPages(actor, body.pageIds),
  }),

  route({
    method: "delete",
    path: "/pages/:id",
    summary: "Delete a page",
    permission: "website.edit",
    module: MODULE,
    params: idParam,
    handler: ({ actor, params }) => website.deletePage(actor, params.id),
  }),

  route({
    method: "get",
    path: "/pages/:id/revisions",
    summary: "Previously published versions of a page",
    permission: "website.edit",
    module: MODULE,
    params: idParam,
    handler: ({ schoolId, params }) => website.listRevisions(schoolId, params.id),
  }),

  route({
    method: "post",
    path: "/pages/:id/revisions/:revisionId/restore",
    summary: "Copy an old version into the draft",
    permission: "website.edit",
    module: MODULE,
    params: z.object({ id: z.uuid(), revisionId: z.uuid() }),
    handler: ({ actor, params }) => website.restoreRevision(actor, params.id, params.revisionId),
  }),

  route({
    method: "get",
    path: "/pages/:id/preview-link",
    summary: "A link that shows the draft in a new tab for 10 minutes",
    permission: "website.edit",
    module: MODULE,
    params: idParam,
    handler: async ({ schoolId, params }) => {
      await website.getPage(schoolId, params.id);
      return { path: `/sites/_preview/${params.id}?token=${signPreviewToken(params.id)}` };
    },
  }),

  // ─── Notices, news, events ─────────────────────────────────

  route({
    method: "get",
    path: "/posts",
    summary: "List notices, news and events",
    permission: "website.posts",
    module: MODULE,
    query: pagination.extend({
      type: z.enum(["NOTICE", "NEWS", "EVENT"]).optional(),
      status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
      search: z.string().optional(),
    }),
    handler: ({ schoolId, query }) => content.listPosts(schoolId, query),
  }),

  route({
    method: "get",
    path: "/posts/:id",
    summary: "Get a notice, news story or event",
    permission: "website.posts",
    module: MODULE,
    params: idParam,
    handler: ({ schoolId, params }) => content.getPost(schoolId, params.id),
  }),

  route({
    method: "post",
    path: "/posts",
    summary: "Create a notice, news story or event",
    permission: "website.posts",
    module: MODULE,
    status: 201,
    body: postBody(),
    handler: ({ actor, body }) => content.createPost(actor, body),
  }),

  route({
    method: "put",
    path: "/posts/:id",
    summary: "Update a notice, news story or event",
    permission: "website.posts",
    module: MODULE,
    params: idParam,
    body: postBody(),
    handler: ({ actor, params, body }) => content.updatePost(actor, params.id, body),
  }),

  route({
    method: "delete",
    path: "/posts/:id",
    summary: "Delete a notice, news story or event",
    permission: "website.posts",
    module: MODULE,
    params: idParam,
    handler: ({ actor, params }) => content.deletePost(actor, params.id),
  }),

  // ─── Gallery ───────────────────────────────────────────────

  route({
    method: "get",
    path: "/albums",
    summary: "List photo albums",
    permission: ["website.edit", "website.posts"],
    module: MODULE,
    handler: ({ schoolId }) => content.listAlbums(schoolId),
  }),

  route({
    method: "post",
    path: "/albums",
    summary: "Create a photo album",
    permission: ["website.edit", "website.posts"],
    module: MODULE,
    status: 201,
    body: albumBody(),
    handler: ({ actor, body }) => content.createAlbum(actor, body),
  }),

  route({
    method: "get",
    path: "/albums/:id",
    summary: "Get a photo album",
    permission: ["website.edit", "website.posts"],
    module: MODULE,
    params: idParam,
    handler: ({ schoolId, params }) => content.getAlbum(schoolId, params.id),
  }),

  route({
    method: "patch",
    path: "/albums/:id",
    summary: "Update an album (title, photos, order)",
    permission: ["website.edit", "website.posts"],
    module: MODULE,
    params: idParam,
    body: albumBody().partial(),
    handler: ({ actor, params, body }) => content.updateAlbum(actor, params.id, body),
  }),

  route({
    method: "delete",
    path: "/albums/:id",
    summary: "Delete an album",
    permission: ["website.edit", "website.posts"],
    module: MODULE,
    params: idParam,
    handler: ({ actor, params }) => content.deleteAlbum(actor, params.id),
  }),

  // ─── Enquiries ─────────────────────────────────────────────

  route({
    method: "get",
    path: "/enquiries",
    summary: "Messages from the website's contact and admission forms",
    permission: "website.enquiries",
    module: MODULE,
    query: pagination.extend({ status: z.enum(["NEW", "CONTACTED", "CLOSED"]).optional(), kind: z.enum(["contact", "admission"]).optional() }),
    handler: ({ schoolId, query }) => content.listEnquiries(schoolId, query),
  }),

  route({
    method: "patch",
    path: "/enquiries/:id",
    summary: "Mark an enquiry as contacted/closed and add notes",
    permission: "website.enquiries",
    module: MODULE,
    params: idParam,
    body: z.object({ status: z.enum(["NEW", "CONTACTED", "CLOSED"]), notes: optionalText }).partial(),
    handler: ({ actor, params, body }) => content.updateEnquiry(actor, params.id, body),
  }),
]);

function postBody() {
  return z.object({
    type: z.enum(["NOTICE", "NEWS", "EVENT"]),
    title: z.string().trim().min(3).max(200),
    excerpt: optionalText,
    content: z.string().max(200_000).default(""),
    coverImageKey: z.string().nullable().optional(),
    attachments: z.array(z.object({ title: z.string().trim().min(1).max(120), fileKey: z.string() })).max(10).optional(),
    isPinned: z.boolean().optional(),
    eventStart: dateString.nullable().optional(),
    eventEnd: dateString.nullable().optional(),
    location: optionalText,
    status: z.enum(["DRAFT", "PUBLISHED"]),
  });
}

function albumBody() {
  return z.object({
    title: z.string().trim().min(2).max(120),
    description: optionalText,
    photos: z.array(z.object({ key: z.string(), caption: z.string().max(200).optional() })).max(300),
    isPublished: z.boolean().optional(),
    eventDate: dateString.nullable().optional(),
  });
}
