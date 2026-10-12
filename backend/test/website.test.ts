import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { redis } from "../src/lib/redis.js";
import { renderBlock } from "../src/modules/website/renderer/document.js";
import { sanitizeRichText } from "../src/modules/website/sanitize.js";
import { app, authed, createTestSchool } from "./helpers.js";

type TestSchool = Awaited<ReturnType<typeof createTestSchool>>;
let a: TestSchool;
let b: TestSchool;

beforeAll(async () => {
  a = await createTestSchool();
  b = await createTestSchool();
});

afterAll(async () => {
  await prisma.$disconnect();
  await redis.quit();
});

const site = (school: TestSchool, path = "") => request(app).get(`/sites/${school.school.code}${path}`);

async function publishedStarterSite(school: TestSchool) {
  const api = authed(school.token);
  const pages = (await api.post("/api/website/starter")).body as { id: string; isHome: boolean; slug: string }[];
  for (const page of pages) await api.post(`/api/website/pages/${page.id}/publish`);
  await api.patch("/api/website", { isPublished: true });
  return pages;
}

describe("website renderer safety", () => {
  it("escapes text fields, so typed HTML is shown as text", () => {
    const html = renderBlock(
      { id: "1", type: "hero", props: { heading: '<script>alert("x")</script>' } },
      {
        site: { schoolName: "S", schoolCode: "S", logoKey: null, address: null, phone: null, email: null, motto: "" },
        data: { notices: [], news: [], events: [], albums: [], stats: { students: 0, teachers: 0, classes: 0, parents: 0 } },
        pages: [],
        basePath: "",
        fileUrl: (k) => k,
        formatDate: (d) => d,
        mode: "public",
      },
    ).value;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("cleans rich text: no scripts, event handlers or javascript: links", () => {
    const clean = sanitizeRichText('<p onclick="x()">Hi <strong>there</strong></p><script>bad()</script><a href="javascript:alert(1)">link</a><img src=x onerror=alert(1)>');
    expect(clean).toContain("<strong>there</strong>");
    expect(clean).not.toMatch(/script|onclick|onerror|javascript:/);
  });

  it("sanitises rich text when a draft is saved", async () => {
    const api = authed(a.token);
    const page = (await api.post("/api/website/pages", { title: "XSS test" })).body;
    const saved = await api.put(`/api/website/pages/${page.id}/draft`, {
      blocks: [{ id: "b1", type: "text", props: { body: "<p>ok</p><script>steal()</script>" } }],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.draftBlocks[0].props.body).toBe("<p>ok</p>");
  });

  it("rejects unknown block types", async () => {
    const api = authed(a.token);
    const page = (await api.post("/api/website/pages", { title: "Bad block" })).body;
    expect((await api.put(`/api/website/pages/${page.id}/draft`, { blocks: [{ id: "1", type: "evil", props: {} }] })).status).toBe(400);
  });
});

describe("website builder", () => {
  it("creates a starter site, and only published content is public", async () => {
    // No website until the school creates one
    expect((await site(b)).status).toBe(404);

    const pages = await publishedStarterSite(b);
    expect(pages.map((p) => p.slug)).toEqual(["", "about", "academics", "admissions", "contact"]);

    await authed(b.token).patch("/api/website", { isPublished: false });
    expect((await site(b)).text).toContain("Coming soon");
    await authed(b.token).patch("/api/website", { isPublished: true });

    const home = await site(b, "/");
    expect(home.status).toBe(200);
    expect(home.text).toContain(b.school.name);
    expect(home.text).toContain('"@type":"School"');

    // A new, unpublished page isn't visible to visitors
    const api = authed(b.token);
    await api.post("/api/website/pages", { title: "Secret plans" });
    expect((await site(b, "/secret-plans")).status).toBe(404);
  });

  it("shows draft changes to visitors only after publishing", async () => {
    const api = authed(b.token);
    const home = (await api.get("/api/website")).body.pages.find((p: { isHome: boolean }) => p.isHome);
    const draft = (await api.get(`/api/website/pages/${home.id}`)).body;
    const blocks = draft.draftBlocks.map((block: { type: string; props: object }) =>
      block.type === "hero" ? { ...block, props: { ...block.props, heading: "Brand new headline" } } : block,
    );
    await api.put(`/api/website/pages/${home.id}/draft`, { blocks });

    expect((await site(b, "/")).text).not.toContain("Brand new headline");
    await api.post(`/api/website/pages/${home.id}/publish`);
    expect((await site(b, "/")).text).toContain("Brand new headline");

    // Each publish keeps a version that can be restored
    expect((await api.get(`/api/website/pages/${home.id}/revisions`)).body.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps one school's website out of another school's reach", async () => {
    const bPage = (await authed(b.token).get("/api/website")).body.pages[0];
    expect((await authed(a.token).get(`/api/website/pages/${bPage.id}`)).status).toBe(404);
    expect((await authed(a.token).put(`/api/website/pages/${bPage.id}/draft`, { blocks: [] })).status).toBe(404);
    expect((await authed(a.token).delete(`/api/website/pages/${bPage.id}`)).status).toBe(404);
  });

  it("won't use another school's uploaded image", async () => {
    const upload = await request(app)
      .post("/api/files")
      .set("Authorization", `Bearer ${b.token}`)
      .field("purpose", "website-image")
      .attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "photo.png", contentType: "image/png" });
    expect(upload.status).toBe(201);
    // Public website files are reachable without a login
    expect((await request(app).get(new URL(upload.body.url).pathname)).status).toBe(200);

    const api = authed(a.token);
    const page = (await api.post("/api/website/pages", { title: "Stolen photo" })).body;
    const response = await api.put(`/api/website/pages/${page.id}/draft`, { blocks: [{ id: "1", type: "image", props: { image: upload.body.key } }] });
    expect(response.status).toBe(404);
  });

  it("doesn't let pages take the addresses of built-in pages", async () => {
    const api = authed(a.token);
    const page = (await api.post("/api/website/pages", { title: "Another page" })).body;
    expect((await api.patch(`/api/website/pages/${page.id}`, { slug: "notices" })).status).toBe(400);
  });

  it("needs website permissions", async () => {
    // A parent account (no website permissions) is refused
    const parent = await prisma.user.findFirst({ where: { schoolId: a.school.id, roles: { some: { role: { key: "parent" } } } } });
    if (parent) {
      const { signAccessToken } = await import("../src/lib/tokens.js");
      const token = signAccessToken({ sub: parent.id, schoolId: a.school.id });
      expect((await authed(token).get("/api/website")).status).toBe(403);
    }
  });
});

describe("notices and enquiries", () => {
  it("publishes notices to the notice board", async () => {
    const api = authed(b.token);
    const created = await api.post("/api/website/posts", { type: "NOTICE", title: "Holiday on Friday", content: "<p>School is closed.</p>", status: "PUBLISHED" });
    expect(created.status).toBe(201);
    const board = await site(b, "/notices");
    expect(board.text).toContain("Holiday on Friday");
    expect((await site(b, `/notices/${created.body.slug}`)).text).toContain("School is closed.");

    await api.post("/api/website/posts", { type: "NOTICE", title: "Draft notice", content: "", status: "DRAFT" });
    expect((await site(b, "/notices")).text).not.toContain("Draft notice");
  });

  it("requires a start date for events", async () => {
    expect((await authed(b.token).post("/api/website/posts", { type: "EVENT", title: "Sports day", content: "", status: "PUBLISHED" })).status).toBe(400);
  });

  it("saves enquiries from the public form and ignores bots", async () => {
    const send = (body: object) => request(app).post(`/sites/${b.school.code}/enquiry`).set("Accept", "application/json").send(body);
    const ok = await send({ kind: "admission", name: "Gita Rai", phone: "9841000222", subject: "Grade 1", message: "Is there a seat available?" });
    expect(ok.status).toBe(200);

    const bot = await send({ kind: "contact", name: "Spam Bot", phone: "9841000333", message: "Buy now cheap", website: "http://spam.example" });
    expect(bot.status).toBe(200);

    expect((await send({ name: "X", phone: "123", message: "hi" })).status).toBe(400);

    const inbox = (await authed(b.token).get("/api/website/enquiries")).body.items as { name: string }[];
    expect(inbox.map((e) => e.name)).toContain("Gita Rai");
    expect(inbox.map((e) => e.name)).not.toContain("Spam Bot");
  });
});
