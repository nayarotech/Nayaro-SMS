import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { redis } from "../src/lib/redis.js";
import { admissionBody, authed, createTestSchool, login, PASSWORD } from "./helpers.js";

type TestSchool = Awaited<ReturnType<typeof createTestSchool>>;
let school: TestSchool;
let admin: ReturnType<typeof authed>;
let classId: string;
let examId: string;
const subject: Record<"maths" | "computer" | "account", string> = { maths: "", computer: "", account: "" };
const teacher: Record<"computer" | "account", { id: string; token: string }> = {} as never;
const students: { asha: string; bikash: string } = { asha: "", bikash: "" };

async function makeTeacher(name: string) {
  const roles = (await admin.get("/api/roles")).body as { id: string; key: string }[];
  const email = `${name.toLowerCase()}-${Date.now()}@test.local`;
  const user = await admin.post("/api/users", { fullName: name, email, password: PASSWORD, roleIds: roles.filter((r) => r.key === "subject_teacher").map((r) => r.id) });
  return { id: user.body.id as string, token: await login(email) };
}

const sheet = (subjectId: string) => `/api/exams/${examId}/sheets/${school.section.id}/${subjectId}`;
const mark = (studentId: string, theory: number) => ({ studentId, theory, practical: null, status: "PRESENT" });
const choose = (studentId: string, subjectId: string | null) => admin.put(`/api/classes/${classId}/subject-choices`, { choices: [{ studentId, group: "Optional I", subjectId }] });

beforeAll(async () => {
  school = await createTestSchool();
  admin = authed(school.token);
  classId = school.section.classId;

  for (const name of ["maths", "computer", "account"] as const) subject[name] = (await admin.post("/api/subjects", { name: name[0].toUpperCase() + name.slice(1) })).body.id;
  await admin.put(`/api/classes/${classId}/subjects`, {
    subjects: [
      { subjectId: subject.maths, isOptional: false },
      { subjectId: subject.computer, isOptional: true, optionGroup: "Optional I" },
      { subjectId: subject.account, isOptional: true, optionGroup: "Optional I" },
    ],
  });

  teacher.computer = await makeTeacher("Computerteacher");
  teacher.account = await makeTeacher("Accountteacher");
  await admin.post("/api/assignments/subject-teacher", { sectionId: school.section.id, subjectId: subject.computer, teacherId: teacher.computer.id });
  await admin.post("/api/assignments/subject-teacher", { sectionId: school.section.id, subjectId: subject.account, teacherId: teacher.account.id });

  students.asha = (await admin.post("/api/students", { ...admissionBody(school.section.id), firstName: "Asha" })).body.id;
  students.bikash = (await admin.post("/api/students", { ...admissionBody(school.section.id), firstName: "Bikash" })).body.id;

  examId = (await admin.post("/api/exams", { name: "Final Examination" })).body.id;
});

afterAll(async () => {
  await prisma.$disconnect();
  await redis.quit();
});

describe("exam setup in bulk", () => {
  it("copies an exam's whole setup from an earlier exam", async () => {
    const first = (await admin.post("/api/exams", { name: "First Terminal" })).body.id;
    const configs = [subject.maths, subject.computer, subject.account].map((subjectId) => ({ subjectId, theoryFullMarks: 100, theoryPassMarks: 35 }));
    await admin.put(`/api/exams/${first}/classes/${classId}/subjects`, { subjects: configs });

    const copy = await admin.post(`/api/exams/${examId}/copy-from`, { fromExamId: first });
    expect(copy.status).toBe(200);
    expect(copy.body.copied[classId]).toBe(3);
    expect(await prisma.examSubject.count({ where: { examId, classId } })).toBe(3);
  });

  it("copies one class's setup to another class, only for subjects it studies", async () => {
    const other = (await admin.post("/api/classes", { name: "Grade 2", order: 2, sections: ["A"] })).body.id;
    await admin.put(`/api/classes/${other}/subjects`, { subjects: [{ subjectId: subject.maths, isOptional: false }] });
    const copy = await admin.post(`/api/exams/${examId}/classes/${classId}/copy`, { toClassIds: [other] });
    expect(copy.body.copied[other]).toBe(1);
  });
});

describe("optional subjects", () => {
  it("before students choose, everyone is on every optional sheet", async () => {
    const computer = await authed(teacher.computer.token).get(sheet(subject.computer));
    expect(computer.body.students).toHaveLength(2);
  });

  it("after choosing, a sheet lists only the students who chose that subject", async () => {
    expect((await choose(students.asha, subject.computer)).status).toBe(200);
    expect((await choose(students.bikash, subject.account)).status).toBe(200);

    const computer = await authed(teacher.computer.token).get(sheet(subject.computer));
    expect(computer.body.students.map((s: { studentId: string }) => s.studentId)).toEqual([students.asha]);
    const account = await authed(teacher.account.token).get(sheet(subject.account));
    expect(account.body.students.map((s: { studentId: string }) => s.studentId)).toEqual([students.bikash]);

    const list = await admin.get(`/api/exams/${examId}/sheets?classId=${classId}`);
    const count = (subjectId: string) => list.body.sheets.find((s: { subjectId: string }) => s.subjectId === subjectId).students;
    expect([count(subject.maths), count(subject.computer), count(subject.account)]).toEqual([2, 1, 1]);
  });

  it("only the Computer teacher enters Computer marks, and only for Computer students", async () => {
    expect((await authed(teacher.account.token).put(sheet(subject.computer), { marks: [mark(students.asha, 70)] })).status).toBe(403);
    expect((await authed(teacher.computer.token).put(sheet(subject.computer), { marks: [mark(students.bikash, 70)] })).status).toBe(400);
    expect((await authed(teacher.computer.token).put(sheet(subject.computer), { marks: [mark(students.asha, 72)] })).status).toBe(200);
    // Complete with just Asha
    expect((await authed(teacher.computer.token).post(`${sheet(subject.computer)}/submit`)).status).toBe(204);
  });

  it("results include only the subjects each student takes", async () => {
    await admin.put(sheet(subject.maths), { marks: [mark(students.asha, 80), mark(students.bikash, 60)] });
    await authed(teacher.account.token).put(sheet(subject.account), { marks: [mark(students.bikash, 65)] });

    const results = await admin.get(`/api/exams/${examId}/results?classId=${classId}`);
    const subjectsOf = (id: string) => results.body.students.find((s: { studentId: string }) => s.studentId === id).result.subjects.map((x: { subjectName: string }) => x.subjectName).sort();
    expect(subjectsOf(students.asha)).toEqual(["Computer", "Maths"]);
    expect(subjectsOf(students.bikash)).toEqual(["Account", "Maths"]);
    expect(results.body.students.every((s: { result: { result: string } }) => s.result.result === "PASS")).toBe(true);
  });

  it("a choice can't change once there are marks in the subject being left", async () => {
    const change = await choose(students.asha, subject.account);
    expect(change.status).toBe(409);
    expect(change.body.error.message).toContain("Computer");
  });

  it("shows each student's choice per group", async () => {
    const choices = await admin.get(`/api/classes/${classId}/subject-choices`);
    expect(choices.body.groups).toEqual([{ name: "Optional I", subjects: expect.arrayContaining([expect.objectContaining({ name: "Computer" })]) }]);
    expect(choices.body.students.find((s: { studentId: string }) => s.studentId === students.asha).choices).toEqual({ "Optional I": subject.computer });
  });
});

describe("verify all", () => {
  it("verifies every submitted sheet at once", async () => {
    await authed(teacher.account.token).post(`${sheet(subject.account)}/submit`);
    const result = await admin.post(`/api/exams/${examId}/verify-all`, { classId });
    expect(result.status).toBe(200);
    expect(result.body.verified).toBe(2);
    expect(await prisma.markSheet.count({ where: { examId, status: "VERIFIED" } })).toBe(2);
    expect((await authed(teacher.computer.token).post(`/api/exams/${examId}/verify-all`, {})).status).toBe(403);
  });
});
