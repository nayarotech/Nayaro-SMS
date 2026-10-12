import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { todayInNepal } from "../src/lib/nepali-date.js";
import { prisma } from "../src/lib/prisma.js";
import { redis } from "../src/lib/redis.js";
import { admissionBody, authed, createTestSchool, login, PASSWORD, uniquePhone } from "./helpers.js";

type TestSchool = Awaited<ReturnType<typeof createTestSchool>>;
let school: TestSchool;
let classTeacher: { id: string; token: string };
let otherTeacher: { id: string; token: string };
let parentPhone: string;
let studentIds: string[] = [];

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

async function makeTeacher(name: string) {
  const roles = (await authed(school.token).get("/api/roles")).body as { id: string; key: string }[];
  const email = `${name.toLowerCase()}-${Date.now()}@test.local`;
  const user = await authed(school.token).post("/api/users", {
    fullName: name,
    email,
    password: PASSWORD,
    roleIds: roles.filter((r) => r.key === "class_teacher" || r.key === "subject_teacher").map((r) => r.id),
  });
  return { id: user.body.id as string, token: await login(email) };
}

beforeAll(async () => {
  school = await createTestSchool();
  classTeacher = await makeTeacher("Classy");
  otherTeacher = await makeTeacher("Other");
  await authed(school.token).put("/api/assignments/class-teacher", { sectionId: school.section.id, teacherId: classTeacher.id });

  parentPhone = uniquePhone();
  for (const phone of [parentPhone, uniquePhone(), uniquePhone()]) {
    const admitted = await authed(school.token).post("/api/students", admissionBody(school.section.id, phone));
    studentIds.push(admitted.body.id);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
  await redis.quit();
});

const records = (status: string, firstStatus = status) => studentIds.map((studentId, i) => ({ studentId, status: i === 0 ? firstStatus : status }));

describe("attendance access", () => {
  it("the class teacher takes today's attendance and the absent child's parent is notified", async () => {
    const saved = await authed(classTeacher.token).put(`/api/attendance/sections/${school.section.id}`, { date: todayInNepal(), records: records("PRESENT", "ABSENT") });
    expect(saved.status).toBe(200);
    expect(saved.body.summary).toMatchObject({ present: 2, absent: 1 });

    const parent = await prisma.user.findFirstOrThrow({ where: { schoolId: school.school.id, phone: parentPhone } });
    const notes = await prisma.notification.findMany({ where: { userId: parent.id, type: "attendance.absent" } });
    expect(notes).toHaveLength(1);
  });

  it("another teacher can't take or see this section's attendance", async () => {
    expect((await authed(otherTeacher.token).put(`/api/attendance/sections/${school.section.id}`, { date: todayInNepal(), records: records("PRESENT") })).status).toBe(403);
    expect((await authed(otherTeacher.token).get(`/api/attendance/sections/${school.section.id}`)).status).toBe(403);
  });

  it("nobody can take attendance for a future date", async () => {
    const response = await authed(school.token).put(`/api/attendance/sections/${school.section.id}`, { date: addDays(todayInNepal(), 1), records: records("PRESENT") });
    expect(response.status).toBe(403);
  });

  it("class teachers can only go back within the edit window", async () => {
    await authed(school.token).patch("/api/settings", { "attendance.editWindowDays": 3 });
    const old = addDays(todayInNepal(), -10);
    const recent = addDays(todayInNepal(), -2);
    expect((await authed(classTeacher.token).put(`/api/attendance/sections/${school.section.id}`, { date: old, records: records("PRESENT") })).status).toBe(403);
    expect((await authed(classTeacher.token).put(`/api/attendance/sections/${school.section.id}`, { date: recent, records: records("PRESENT") })).status).toBe(200);
    // Admins can correct any past day
    expect((await authed(school.token).put(`/api/attendance/sections/${school.section.id}`, { date: old, records: records("PRESENT") })).status).toBe(200);
  });

  it("a proxy teacher can mark only their assigned dates and sees earlier days read-only", async () => {
    const today = todayInNepal();
    const created = await authed(school.token).post("/api/attendance/proxies", { sectionId: school.section.id, teacherId: otherTeacher.id, startDate: today, endDate: today });
    expect(created.status).toBe(201);

    expect((await authed(otherTeacher.token).put(`/api/attendance/sections/${school.section.id}`, { date: today, records: records("PRESENT") })).status).toBe(200);

    const yesterday = await authed(otherTeacher.token).get(`/api/attendance/sections/${school.section.id}?date=${addDays(today, -2)}`);
    expect(yesterday.status).toBe(200);
    expect(yesterday.body.access.canMark).toBe(false);
    expect((await authed(otherTeacher.token).put(`/api/attendance/sections/${school.section.id}`, { date: addDays(today, -2), records: records("PRESENT") })).status).toBe(403);

    // Revoked → access ends
    await authed(school.token).delete(`/api/attendance/proxies/${created.body.id}`);
    expect((await authed(otherTeacher.token).put(`/api/attendance/sections/${school.section.id}`, { date: today, records: records("PRESENT") })).status).toBe(403);
  });

  it("records corrections in the audit log", async () => {
    await authed(classTeacher.token).put(`/api/attendance/sections/${school.section.id}`, { date: todayInNepal(), records: records("PRESENT") });
    const audit = await authed(school.token).get("/api/audit?action=attendance.edit");
    expect(audit.body.items.length).toBeGreaterThan(0);
  });

  it("computes the monthly register", async () => {
    const [bsYear, bsMonth] = (await authed(school.token).get("/api/meta/today")).body.bs.split("-").map(Number);
    const register = await authed(school.token).get(`/api/attendance/reports/monthly?sectionId=${school.section.id}&bsYear=${bsYear}&bsMonth=${bsMonth}`);
    expect(register.status).toBe(200);
    expect(register.body.students).toHaveLength(3);
  });
});

describe("marks workflow", () => {
  let examId: string;
  let subjectId: string;
  const sheetPath = () => `/api/exams/${examId}/sheets/${school.section.id}/${subjectId}`;

  beforeAll(async () => {
    const admin = authed(school.token);
    subjectId = (await admin.post("/api/subjects", { name: "Science", hasPractical: true })).body.id;
    const classId = (await prisma.section.findUniqueOrThrow({ where: { id: school.section.id } })).classId;
    await admin.put(`/api/classes/${classId}/subjects`, { subjects: [{ subjectId, isOptional: false }] });
    await admin.post("/api/assignments/subject-teacher", { sectionId: school.section.id, subjectId, teacherId: classTeacher.id });
    examId = (await admin.post("/api/exams", { name: "First Terminal" })).body.id;
    await admin.put(`/api/exams/${examId}/classes/${classId}/subjects`, {
      subjects: [{ subjectId, theoryFullMarks: 75, theoryPassMarks: 26.25, practicalFullMarks: 25, practicalPassMarks: 8.75, creditHours: 4 }],
    });
  });

  const marks = (theory: number, practical: number) => ({ marks: studentIds.map((studentId) => ({ studentId, theory, practical, status: "PRESENT" })) });

  it("lists a teacher's own mark sheets for the phone app", async () => {
    const mine = await authed(classTeacher.token).get("/api/exams/my-sheets");
    expect(mine.status).toBe(200);
    expect(mine.body.exams[0].sheets).toEqual([expect.objectContaining({ sectionId: school.section.id, subjectId, mine: true })]);
    const other = await authed(otherTeacher.token).get("/api/exams/my-sheets");
    expect(other.body.exams).toEqual([]);
  });

  it("only the assigned subject teacher can enter marks", async () => {
    expect((await authed(otherTeacher.token).put(sheetPath(), marks(50, 20))).status).toBe(403);
    expect((await authed(classTeacher.token).put(sheetPath(), marks(50, 20))).status).toBe(200);
  });

  it("rejects marks above full marks", async () => {
    const response = await authed(classTeacher.token).put(sheetPath(), marks(80, 20));
    expect(response.status).toBe(400);
  });

  it("goes Draft → Submitted → Verified → Published, locking marks on the way", async () => {
    expect((await authed(classTeacher.token).post(`${sheetPath()}/submit`)).status).toBe(204);
    // Teacher can't change submitted marks
    expect((await authed(classTeacher.token).put(sheetPath(), marks(60, 20))).status).toBe(403);
    // A teacher can't verify their own marks
    expect((await authed(classTeacher.token).post(`${sheetPath()}/verify`)).status).toBe(403);

    // Results aren't visible to parents yet
    expect(await prisma.markSheet.count({ where: { examId, status: "PUBLISHED" } })).toBe(0);

    expect((await authed(school.token).post(`${sheetPath()}/verify`)).status).toBe(204);
    const classId = (await prisma.section.findUniqueOrThrow({ where: { id: school.section.id } })).classId;
    expect((await authed(school.token).post(`/api/exams/${examId}/classes/${classId}/publish`)).status).toBe(204);

    const results = await authed(school.token).get(`/api/exams/${examId}/results?classId=${classId}`);
    expect(results.body.published).toBe(true);
    // 50 + 20 = 70% → B+, GP 3.2
    expect(results.body.students[0].result.subjects[0].grade).toBe("B+");
    expect(results.body.students[0].result.gpa).toBe(3.2);

    // The parent was told, and can now see results in the app
    const parent = await prisma.user.findFirstOrThrow({ where: { schoolId: school.school.id, phone: parentPhone } });
    expect(await prisma.notification.count({ where: { userId: parent.id, type: "results.published" } })).toBe(1);
  });

  it("produces a report card PDF", async () => {
    const classId = (await prisma.section.findUniqueOrThrow({ where: { id: school.section.id } })).classId;
    const pdf = await authed(school.token).get(`/api/exams/${examId}/report-cards?classId=${classId}&studentId=${studentIds[0]}`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
  }, 60_000);
});
