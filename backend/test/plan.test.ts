import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import { redis } from "../src/lib/redis.js";
import { admissionBody, authed, createTestSchool, login, PASSWORD } from "./helpers.js";

type TestSchool = Awaited<ReturnType<typeof createTestSchool>>;
let school: TestSchool;
let admin: ReturnType<typeof authed>;
let owner: ReturnType<typeof authed>;

beforeAll(async () => {
  school = await createTestSchool();
  admin = authed(school.token);
  const email = `owner-${randomBytes(3).toString("hex")}@test.local`;
  await prisma.user.create({ data: { fullName: "Owner", email, isSuperAdmin: true, passwordHash: await hashPassword(PASSWORD) } });
  owner = authed(await login(email));
  await owner.patch(`/api/schools/${school.school.id}`, { studentLimit: 2 });
});

afterAll(async () => {
  await prisma.$disconnect();
  await redis.quit();
});

const admit = (firstName: string) => admin.post("/api/students", { ...admissionBody(school.section.id), firstName });

describe("student limit (plan)", () => {
  let firstId: string;

  it("admits students up to the limit, then refuses with a way to upgrade", async () => {
    firstId = (await admit("One")).body.id;
    expect((await admit("Two")).status).toBe(201);

    const third = await admit("Three");
    expect(third.status).toBe(403);
    expect(third.body.error.code).toBe("STUDENT_LIMIT_REACHED");
    expect(third.body.error.message).toContain("allows 2 active students");

    const plan = await admin.get("/api/school/plan");
    expect(plan.body).toMatchObject({ studentLimit: 2, activeStudents: 2, remaining: 0, full: true });
  });

  it("a student who leaves frees a place; bringing them back needs one", async () => {
    await admin.patch(`/api/students/${firstId}`, { status: "LEFT" });
    expect((await admit("Three")).status).toBe(201);

    const back = await admin.patch(`/api/students/${firstId}`, { status: "ACTIVE" });
    expect(back.status).toBe(403);
    expect(back.body.error.code).toBe("STUDENT_LIMIT_REACHED");
  });

  it("a school can't raise its own limit; the platform owner can", async () => {
    await admin.patch("/api/school", { studentLimit: 500 });
    expect((await prisma.school.findUniqueOrThrow({ where: { id: school.school.id } })).studentLimit).toBe(2);

    expect((await owner.patch(`/api/schools/${school.school.id}`, { studentLimit: 5 })).status).toBe(200);
    expect((await admit("Four")).status).toBe(201);
  });

  it("the platform owner sees each school's usage", async () => {
    const list = await owner.get(`/api/schools?search=${school.school.code}`);
    expect(list.body.items[0]).toMatchObject({ studentLimit: 5, studentCount: 3 });
  });
});
