import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { todayInNepal } from "../src/lib/nepali-date.js";
import { prisma } from "../src/lib/prisma.js";
import { redis } from "../src/lib/redis.js";
import { admissionBody, app, authed, createTestSchool, login, PASSWORD, uniquePhone } from "./helpers.js";

type TestSchool = Awaited<ReturnType<typeof createTestSchool>>;
type User = { id: string; token: string };
let school: TestSchool;
let admin: ReturnType<typeof authed>;
let sectionA: string;
let sectionB: string;
const subject = { maths: "", computer: "", account: "" };
const people = {} as Record<"maths" | "computer" | "classTeacherB" | "coordinator" | "other", User>;
const students = {} as Record<"asha" | "bikash" | "chandra", { id: string; phone: string }>;

const addDays = (days: number) => new Date(Date.parse(`${todayInNepal()}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

async function makeUser(name: string, roleKey: string): Promise<User> {
  const roles = (await admin.get("/api/roles")).body as { id: string; key: string }[];
  const email = `${name.toLowerCase()}-${Date.now()}@test.local`;
  const user = await admin.post("/api/users", { fullName: name, email, password: PASSWORD, roleIds: roles.filter((r) => r.key === roleKey).map((r) => r.id) });
  return { id: user.body.id, token: await login(email) };
}

// One session per parent: SMS codes are rate limited per phone
const parentSessions = new Map<string, ReturnType<typeof authed>>();
async function parentLogin(phone: string) {
  if (!parentSessions.has(phone)) {
    const requested = await request(app).post("/api/auth/otp/request").send({ phone });
    const verified = await request(app).post("/api/auth/otp/verify").send({ phone, code: requested.body.devCode });
    parentSessions.set(phone, authed(verified.body.accessToken));
  }
  return parentSessions.get(phone)!;
}

const notifications = async (phone: string, type: string) => {
  const parent = await prisma.user.findFirstOrThrow({ where: { schoolId: school.school.id, phone } });
  return prisma.notification.findMany({ where: { userId: parent.id, type } });
};

beforeAll(async () => {
  school = await createTestSchool();
  admin = authed(school.token);
  sectionA = school.section.id;
  const classId = school.section.classId;
  sectionB = (await admin.post(`/api/classes/${classId}/sections`, { name: "B" })).body.id;

  for (const name of ["maths", "computer", "account"] as const) subject[name] = (await admin.post("/api/subjects", { name: name[0].toUpperCase() + name.slice(1) })).body.id;
  await admin.put(`/api/classes/${classId}/subjects`, {
    subjects: [
      { subjectId: subject.maths, isOptional: false },
      { subjectId: subject.computer, isOptional: true, optionGroup: "Optional I" },
      { subjectId: subject.account, isOptional: true, optionGroup: "Optional I" },
    ],
  });

  people.maths = await makeUser("Mathsteacher", "subject_teacher");
  people.computer = await makeUser("Computerteacher", "subject_teacher");
  people.classTeacherB = await makeUser("Classteacherb", "class_teacher");
  people.coordinator = await makeUser("Coordinator", "homework_coordinator");
  people.other = await makeUser("Otherteacher", "subject_teacher");
  await admin.post("/api/assignments/subject-teacher", { sectionId: sectionA, subjectId: subject.maths, teacherId: people.maths.id });
  await admin.post("/api/assignments/subject-teacher", { sectionId: sectionA, subjectId: subject.computer, teacherId: people.computer.id });
  await admin.put("/api/assignments/class-teacher", { sectionId: sectionB, teacherId: people.classTeacherB.id });

  for (const [key, section] of [["asha", sectionA], ["bikash", sectionA], ["chandra", sectionB]] as const) {
    const phone = uniquePhone();
    const admitted = await admin.post("/api/students", { ...admissionBody(section, phone), firstName: key[0].toUpperCase() + key.slice(1) });
    students[key] = { id: admitted.body.id, phone };
  }
  await admin.put(`/api/classes/${classId}/subject-choices`, {
    choices: [
      { studentId: students.asha.id, group: "Optional I", subjectId: subject.computer },
      { studentId: students.bikash.id, group: "Optional I", subjectId: subject.account },
    ],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
  await redis.quit();
});

const homework = (sectionIds: string[], subjectId: string, extra: object = {}) => ({ sectionIds, subjectId, title: "Exercise 4.2, questions 1–10", dueDate: addDays(2), ...extra });

describe("posting homework", () => {
  let mathsHomeworkId: string;

  it("offers each teacher only the sections and subjects they teach", async () => {
    const options = await authed(people.maths.token).get("/api/homework/options");
    expect(options.body.classes).toHaveLength(1);
    expect(options.body.classes[0].subjects).toEqual([{ id: subject.maths, name: "Maths", sectionIds: [sectionA] }]);
    expect(options.body.onBehalf).toBe(false);
  });

  it("a subject teacher posts to their own section only; parents are notified", async () => {
    const posted = await authed(people.maths.token).post("/api/homework", homework([sectionA], subject.maths));
    expect(posted.status).toBe(201);
    mathsHomeworkId = posted.body[0].id;
    expect((await authed(people.maths.token).post("/api/homework", homework([sectionB], subject.maths))).status).toBe(403);
    expect(await notifications(students.asha.phone, "homework.posted")).toHaveLength(1);
    expect(await notifications(students.chandra.phone, "homework.posted")).toHaveLength(0);
  });

  it("a class teacher can post any subject for their own section", async () => {
    expect((await authed(people.classTeacherB.token).post("/api/homework", homework([sectionB], subject.maths))).status).toBe(201);
  });

  it("optional-subject homework reaches only students who chose that subject", async () => {
    const posted = await authed(people.computer.token).post("/api/homework", homework([sectionA], subject.computer, { title: "Draw a flowchart" }));
    expect(posted.status).toBe(201);
    const roster = await authed(people.computer.token).get(`/api/homework/${posted.body[0].id}/checks`);
    expect(roster.body.students.map((s: { studentId: string }) => s.studentId)).toEqual([students.asha.id]);
    expect((await notifications(students.bikash.phone, "homework.posted")).map((n) => n.title)).toEqual(["Maths homework for Bikash"]);
  });

  it("refuses a due date before the day it's given", async () => {
    expect((await authed(people.maths.token).post("/api/homework", homework([sectionA], subject.maths, { dueDate: addDays(-1) }))).status).toBe(400);
  });

  it("a coordinator posts on behalf of a teacher; teachers can't", async () => {
    const onBehalf = await authed(people.coordinator.token).post("/api/homework", homework([sectionA], subject.maths, { teacherId: people.maths.id }));
    expect(onBehalf.status).toBe(201);
    expect(onBehalf.body[0].teacher.id).toBe(people.maths.id);
    expect((await authed(people.maths.token).post("/api/homework", homework([sectionA], subject.maths, { teacherId: people.other.id }))).status).toBe(403);
  });

  it("attaches uploaded files, but never another school's", async () => {
    const upload = await request(app)
      .post("/api/files")
      .set("Authorization", `Bearer ${people.maths.token}`)
      .field("purpose", "homework-file")
      .attach("file", Buffer.from("%PDF-1.4 test"), { filename: "worksheet.pdf", contentType: "application/pdf" });
    expect(upload.status).toBe(201);
    const posted = await authed(people.maths.token).post("/api/homework", homework([sectionA], subject.maths, { attachments: [upload.body.key] }));
    expect(posted.body[0].attachments).toEqual([expect.objectContaining({ name: "worksheet.pdf", mimeType: "application/pdf", url: expect.stringContaining("/api/files/raw") })]);
    expect((await authed(people.maths.token).post("/api/homework", homework([sectionA], subject.maths, { attachments: ["schools/other/x.pdf"] }))).status).toBe(400);
  });

  it("teachers list only their classes' homework; other teachers can't check it", async () => {
    expect((await authed(people.other.token).get("/api/homework")).body.total).toBe(0);
    expect((await authed(people.maths.token).get("/api/homework")).body.items.every((h: { section: { id: string } }) => h.section.id === sectionA)).toBe(true);
    expect((await authed(people.other.token).put(`/api/homework/${mathsHomeworkId}/checks`, { checks: [{ studentId: students.asha.id, status: "DONE" }] })).status).toBe(403);
  });

  it("checking: parents hear when homework wasn't done", async () => {
    const saved = await authed(people.maths.token).put(`/api/homework/${mathsHomeworkId}/checks`, {
      checks: [
        { studentId: students.asha.id, status: "NOT_DONE", remark: "Notebook forgotten" },
        { studentId: students.bikash.id, status: "DONE" },
      ],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.students.find((s: { studentId: string }) => s.studentId === students.asha.id).status).toBe("NOT_DONE");
    expect(await notifications(students.asha.phone, "homework.not_done")).toHaveLength(1);
    expect(await notifications(students.bikash.phone, "homework.not_done")).toHaveLength(0);
  });

  it("parents see their child's homework with its status, and only subjects the child takes", async () => {
    const asha = await (await parentLogin(students.asha.phone)).get(`/api/my/children/${students.asha.id}/homework`);
    expect(asha.status).toBe(200);
    expect(asha.body.find((h: { id: string }) => h.id === mathsHomeworkId)).toMatchObject({ status: "NOT_DONE", remark: "Notebook forgotten", subject: { name: "Maths" } });
    expect(asha.body.some((h: { subject: { name: string } }) => h.subject.name === "Computer")).toBe(true);

    const bikash = await (await parentLogin(students.bikash.phone)).get(`/api/my/children/${students.bikash.id}/homework`);
    expect(bikash.body.some((h: { subject: { name: string } }) => h.subject.name === "Computer")).toBe(false);
  });
});

describe("course materials", () => {
  it("teachers add materials for subjects they teach; parents see them by class", async () => {
    const added = await authed(people.maths.token).post("/api/materials", { classId: school.section.classId, subjectId: subject.maths, title: "Algebra notes", link: "https://www.youtube.com/watch?v=abc" });
    expect(added.status).toBe(201);
    expect((await authed(people.other.token).post("/api/materials", { classId: school.section.classId, subjectId: subject.maths, title: "Not mine", description: "x" })).status).toBe(403);
    await authed(people.computer.token).post("/api/materials", { classId: school.section.classId, subjectId: subject.computer, title: "Python basics", description: "Chapter 1" });

    const chandra = await (await parentLogin(students.chandra.phone)).get(`/api/my/children/${students.chandra.id}/materials`);
    expect(chandra.body.map((m: { title: string }) => m.title)).toContain("Algebra notes");
    const bikash = await (await parentLogin(students.bikash.phone)).get(`/api/my/children/${students.bikash.id}/materials`);
    expect(bikash.body.map((m: { title: string }) => m.title)).not.toContain("Python basics");
  });
});
