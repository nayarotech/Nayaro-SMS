/** Demo school website: starter pages (published) plus notices, news and events. */
import { prisma } from "../src/lib/prisma.js";
import type { Actor } from "../src/modules/audit/audit.service.js";
import { createPost } from "../src/modules/website/content.service.js";
import { createStarterSite, publishPage, updateWebsite } from "../src/modules/website/website.service.js";

const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const NOTICES = [
  { title: "School closed for Dashain from Ashwin 28 to Kartik 10", pinned: true, content: "<p>The school will remain closed for the Dashain holidays. Classes resume on <strong>Kartik 11</strong>. We wish all families a joyful Dashain.</p>" },
  { title: "Second terminal examination routine published", content: "<p>The routine for the second terminal examination is attached. Exams begin on Mangsir 5. Students must bring their admit cards.</p>" },
  { title: "Parent–teacher meeting for Grades 1–5 on Saturday", content: "<p>Parents are requested to meet class teachers between 10 AM and 1 PM to discuss their child's progress.</p>" },
  { title: "New bus route to Budhanilkantha from next month", content: "<p>A new school bus will serve Budhanilkantha, Golfutar and Chappal Karkhana. Contact the transport office to register.</p>" },
  { title: "Admission open for Nursery to Grade 9", content: "<p>Admission forms are available at the school office and on this website. Entrance interaction is held every Friday.</p>" },
];

const NEWS = [
  { title: "Our students win the inter-school science fair", content: "<p>Grade 9 students won first place at the Kathmandu inter-school science fair with their project on low-cost water filters. Congratulations to the team and their mentor teachers!</p>" },
  { title: "Annual sports week ends with record participation", content: "<p>Over 140 students took part in football, athletics, basketball and chess. Red House won the overall trophy.</p>" },
  { title: "New computer lab opened for primary students", content: "<p>Thirty new computers and a smart board were installed so that students from Grade 1 can start learning computing early.</p>" },
];

const EVENTS = [
  { title: "Annual Day celebration", days: 18, location: "School auditorium", content: "<p>Dances, drama and music by our students. Parents are warmly invited.</p>" },
  { title: "Science and art exhibition", days: 32, location: "School ground", content: "<p>Students display their projects and artwork. Open to visitors from 10 AM to 3 PM.</p>" },
  { title: "Inter-house football tournament final", days: 45, location: "Football ground", content: "<p>The final match of the inter-house tournament. Come and cheer!</p>" },
];

export async function buildDemoWebsite(actor: Actor): Promise<boolean> {
  let created = false;
  if (!(await prisma.websitePage.count({ where: { schoolId: actor.schoolId } }))) {
    const pages = await createStarterSite(actor);
    for (const page of pages) await publishPage(actor, page.id);
    await updateWebsite(actor, { isPublished: true });
    created = true;
  }
  if (!(await prisma.websitePost.count({ where: { schoolId: actor.schoolId } }))) {
    for (const n of NOTICES) await createPost(actor, { type: "NOTICE", title: n.title, content: n.content, isPinned: n.pinned, status: "PUBLISHED" });
    for (const n of NEWS) await createPost(actor, { type: "NEWS", title: n.title, content: n.content, status: "PUBLISHED" });
    for (const e of EVENTS) await createPost(actor, { type: "EVENT", title: e.title, content: e.content, eventStart: daysFromNow(e.days), location: e.location, status: "PUBLISHED" });
    created = true;
  }
  return created;
}
