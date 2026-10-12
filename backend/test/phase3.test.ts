import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fromDateString } from "../src/lib/nepali-date.js";
import { prisma } from "../src/lib/prisma.js";
import { redis } from "../src/lib/redis.js";
import { assignRollNumbers, suggestOutcome } from "../src/modules/promotions/promotion-rules.js";
import { admissionBody, app, authed, createTestSchool, login, PASSWORD, uniquePhone } from "./helpers.js";

// ─── Rules (no database) ─────────────────────────────────────

describe("promotion suggestions", () => {
  const finalExam = { basis: "finalExam" as const, minAttendancePercent: 0 };

  it("promotes on pass, detains on fail, and leaves incomplete or missing results to staff", () => {
    expect(suggestOutcome({ isTopClass: false, examResult: "PASS", attendancePercent: 90 }, finalExam).outcome).toBe("PROMOTE");
    expect(suggestOutcome({ isTopClass: false, examResult: "FAIL", attendancePercent: 90 }, finalExam).outcome).toBe("DETAIN");
    expect(suggestOutcome({ isTopClass: false, examResult: "INCOMPLETE", attendancePercent: 90 }, finalExam).outcome).toBeNull();
    expect(suggestOutcome({ isTopClass: false, examResult: null, attendancePercent: 90 }, finalExam).outcome).toBeNull();
  });

  it("graduates students who pass the highest class", () => {
    expect(suggestOutcome({ isTopClass: true, examResult: "PASS", attendancePercent: null }, finalExam).outcome).toBe("GRADUATE");
  });

  it("detains below the minimum attendance, when that rule is on", () => {
    const rule = { basis: "finalExam" as const, minAttendancePercent: 75 };
    const low = suggestOutcome({ isTopClass: false, examResult: "PASS", attendancePercent: 60 }, rule);
    expect(low.outcome).toBe("DETAIN");
    expect(low.reason).toContain("60%");
    expect(suggestOutcome({ isTopClass: false, examResult: "PASS", attendancePercent: 80 }, rule).outcome).toBe("PROMOTE");
    // No attendance recorded → the rule can't apply
    expect(suggestOutcome({ isTopClass: false, examResult: "PASS", attendancePercent: null }, rule).outcome).toBe("PROMOTE");
  });

  it("promotes everyone when suggestions aren't based on exams", () => {
    const rule = { basis: "none" as const, minAttendancePercent: 0 };
    expect(suggestOutcome({ isTopClass: false, examResult: null, attendancePercent: null }, rule).outcome).toBe("PROMOTE");
    expect(suggestOutcome({ isTopClass: false, examResult: "FAIL", attendancePercent: null }, rule).outcome).toBe("PROMOTE");
  });
});

describe("roll numbers in the new year", () => {
  const students = [
    { studentId: "a", name: "Asha", previousRollNo: 3, gpa: 3.2, percentage: 72 },
    { studentId: "b", name: "Bikash", previousRollNo: 1, gpa: 3.6, percentage: 85 },
    { studentId: "c", name: "Chandra", previousRollNo: 2, gpa: null, percentage: null },
    { studentId: "d", name: "Dipa", previousRollNo: 4, gpa: 3.6, percentage: 81 },
  ];

  it("by rank: best result first, students without a result last", () => {
    expect(Object.fromEntries(assignRollNumbers(students, "rank"))).toEqual({ b: 1, d: 2, a: 3, c: 4 });
  });

  it("by name, after numbers already used in the section", () => {
    expect(Object.fromEntries(assignRollNumbers(students, "name", [1, 2]))).toEqual({ a: 3, b: 4, c: 5, d: 6 });
  });

  it("keeps last year's number where it's free", () => {
    expect(Object.fromEntries(assignRollNumbers(students, "keep", [2]))).toEqual({ b: 1, a: 3, d: 4, c: 5 });
  });
});

// ─── API ─────────────────────────────────────────────────────

type TestSchool = Awaited<ReturnType<typeof createTestSchool>>;
let school: TestSchool;
let admin: ReturnType<typeof authed>;
let classTeacher: { id: string; token: string };
let otherTeacher: { id: string; token: string };
let grade1Id: string;
let grade2: { id: string; sections: { id: string; name: string }[] };
let nextYearId: string;
let examId: string;
const students: { id: string; phone: string }[] = [];

async function makeTeacher(name: string) {
  const roles = (await admin.get("/api/roles")).body as { id: string; key: string }[];
  const email = `${name.toLowerCase()}-${Date.now()}@test.local`;
  const user = await admin.post("/api/users", { fullName: name, email, password: PASSWORD, roleIds: roles.filter((r) => r.key === "class_teacher").map((r) => r.id) });
  return { id: user.body.id as string, token: await login(email) };
}

async function parentLogin(phone: string) {
  const requested = await request(app).post("/api/auth/otp/request").send({ phone });
  const verified = await request(app).post("/api/auth/otp/verify").send({ phone, code: requested.body.devCode });
  return authed(verified.body.accessToken);
}

beforeAll(async () => {
  school = await createTestSchool();
  admin = authed(school.token);
  grade1Id = school.section.classId;
  const grade2Id = (await admin.post("/api/classes", { name: "Grade 2", order: 2, sections: ["A", "B"] })).body.id;
  grade2 = { id: grade2Id, sections: await prisma.section.findMany({ where: { classId: grade2Id }, orderBy: { name: "asc" }, select: { id: true, name: true } }) };
  nextYearId = (await admin.post("/api/academic-years", { name: "2084", startDate: "2027-04-14", endDate: "2028-04-13" })).body.id;

  classTeacher = await makeTeacher("Classy");
  otherTeacher = await makeTeacher("Other");
  await admin.put("/api/assignments/class-teacher", { sectionId: school.section.id, teacherId: classTeacher.id });

  for (const firstName of ["Asha", "Bikash", "Chandra", "Dipa"]) {
    const phone = uniquePhone();
    const admitted = await admin.post("/api/students", { ...admissionBody(school.section.id, phone), firstName });
    students.push({ id: admitted.body.id, phone });
  }

  // Final exam: Asha and Bikash pass, Chandra fails, Dipa has no marks yet
  const subjectId = (await admin.post("/api/subjects", { name: "Maths" })).body.id;
  await admin.put(`/api/classes/${grade1Id}/subjects`, { subjects: [{ subjectId, isOptional: false }] });
  examId = (await admin.post("/api/exams", { name: "Final Examination", order: 3 })).body.id;
  await admin.put(`/api/exams/${examId}/classes/${grade1Id}/subjects`, { subjects: [{ subjectId, theoryFullMarks: 100, theoryPassMarks: 35 }] });
  const saved = await admin.put(`/api/exams/${examId}/sheets/${school.section.id}/${subjectId}`, {
    marks: [
      { studentId: students[0].id, theory: 82, practical: null, status: "PRESENT" },
      { studentId: students[1].id, theory: 91, practical: null, status: "PRESENT" },
      { studentId: students[2].id, theory: 20, practical: null, status: "PRESENT" },
    ],
  });
  expect(saved.status).toBe(200);
});

afterAll(async () => {
  await prisma.$disconnect();
  await redis.quit();
});

const preview = () => admin.get(`/api/promotions/preview?classId=${grade1Id}`);
const byName = (body: { students: { name: string }[] }, first: string) => body.students.find((s) => s.name.startsWith(first)) as any;

describe("promotion", () => {
  it("previews the class with results, the next class and year, and suggestions", async () => {
    const response = await preview();
    expect(response.status).toBe(200);
    expect(response.body.toYear.name).toBe("2084");
    expect(response.body.nextClass.name).toBe("Grade 2");
    expect(response.body.exam.id).toBe(examId);
    expect(byName(response.body, "Asha").suggestion.outcome).toBe("PROMOTE");
    expect(byName(response.body, "Chandra").suggestion.outcome).toBe("DETAIN");
    expect(byName(response.body, "Chandra").result.failedSubjects).toEqual(["Maths"]);
    expect(byName(response.body, "Dipa").suggestion.outcome).toBeNull();
  });

  it("needs promotion.manage", async () => {
    expect((await authed(classTeacher.token).get(`/api/promotions/preview?classId=${grade1Id}`)).status).toBe(403);
    expect((await authed(classTeacher.token).post("/api/promotions", { classId: grade1Id, decisions: [{ studentId: students[0].id, outcome: "PROMOTE" }] })).status).toBe(403);
  });

  let runId: string;
  const decisions = () => [
    { studentId: students[0].id, outcome: "PROMOTE" },
    { studentId: students[1].id, outcome: "PROMOTE", toSectionId: grade2.sections.find((s) => s.name === "B")!.id },
    { studentId: students[2].id, outcome: "DETAIN", reason: "Failed Maths" },
    { studentId: students[3].id, outcome: "LEAVE", reason: "Moved to Pokhara" },
  ];

  it("promotes, detains and closes the year, keeping the old year's results", async () => {
    const response = await admin.post("/api/promotions", { classId: grade1Id, rollNumbers: "rank", notifyParents: true, decisions: decisions() });
    expect(response.status).toBe(201);
    expect(response.body.counts).toEqual({ PROMOTE: 2, DETAIN: 1, GRADUATE: 0, LEAVE: 1 });
    runId = response.body.runId;

    const next = await prisma.enrollment.findMany({ where: { academicYearId: nextYearId }, include: { class: true, section: true } });
    const placed = (i: number) => next.find((e) => e.studentId === students[i].id);
    expect(placed(0)).toMatchObject({ class: { name: "Grade 2" }, section: { name: "A" }, rollNo: 1 });
    expect(placed(1)).toMatchObject({ class: { name: "Grade 2" }, section: { name: "B" }, rollNo: 1 });
    expect(placed(2)).toMatchObject({ class: { name: "Grade 1" }, section: { name: "A" } });
    expect(placed(3)).toBeUndefined();

    const old = await prisma.enrollment.findMany({ where: { academicYearId: school.year.id } });
    expect(old.find((e) => e.studentId === students[2].id)).toMatchObject({ status: "DETAINED", remarks: "Failed Maths" });
    expect(old.find((e) => e.studentId === students[3].id)?.status).toBe("COMPLETED");
    expect((await prisma.student.findUniqueOrThrow({ where: { id: students[3].id } })).status).toBe("LEFT");

    // Last year's ledger still lists every student
    const results = await admin.get(`/api/exams/${examId}/results?classId=${grade1Id}`);
    expect(results.body.students).toHaveLength(4);

    const parent = await prisma.user.findFirstOrThrow({ where: { schoolId: school.school.id, phone: students[0].phone } });
    expect(await prisma.notification.count({ where: { userId: parent.id, type: "promotion.promote" } })).toBe(1);
  });

  it("refuses to decide the same students twice", async () => {
    const again = await admin.post("/api/promotions", { classId: grade1Id, decisions: [{ studentId: students[0].id, outcome: "PROMOTE" }] });
    expect(again.status).toBe(409);
  });

  it("shows progress per class", async () => {
    const overview = await admin.get("/api/promotions");
    const grade1 = overview.body.classes.find((c: { id: string }) => c.id === grade1Id);
    expect(grade1).toMatchObject({ total: 4, pending: 0, promoted: 2, detained: 1, left: 1 });
    expect(overview.body.runs[0]).toMatchObject({ id: runId, className: "Grade 1", counts: { PROMOTE: 2, DETAIN: 1, GRADUATE: 0, LEAVE: 1 } });
  });

  it("can be undone while the new year is unused, and run again", async () => {
    expect((await admin.post(`/api/promotions/${runId}/undo`)).status).toBe(204);
    expect(await prisma.enrollment.count({ where: { academicYearId: nextYearId } })).toBe(0);
    expect((await prisma.student.findUniqueOrThrow({ where: { id: students[3].id } })).status).toBe("ACTIVE");
    expect((await preview()).body.students.every((s: { decided: unknown; enrollmentStatus: string }) => !s.decided && s.enrollmentStatus === "ACTIVE")).toBe(true);

    const rerun = await admin.post("/api/promotions", { classId: grade1Id, rollNumbers: "name", notifyParents: false, decisions: decisions() });
    expect(rerun.status).toBe(201);
    runId = rerun.body.runId;
  });

  it("can't be undone once the new year has attendance", async () => {
    const enrollment = await prisma.enrollment.findFirstOrThrow({ where: { academicYearId: nextYearId, studentId: students[0].id } });
    const day = await prisma.attendanceDay.create({
      data: { schoolId: school.school.id, academicYearId: nextYearId, sectionId: enrollment.sectionId, date: fromDateString("2027-04-20"), takenById: school.admin.id },
    });
    await prisma.attendanceRecord.create({ data: { schoolId: school.school.id, dayId: day.id, studentId: students[0].id, status: "PRESENT" } });

    const undo = await admin.post(`/api/promotions/${runId}/undo`);
    expect(undo.status).toBe(409);
    expect(undo.body.error.message).toContain("Asha");
  });

  it("graduates the highest class and won't promote beyond it", async () => {
    const senior = await admin.post("/api/students", { ...admissionBody(grade2.sections[0].id), firstName: "Era" });
    const promote = await admin.post("/api/promotions", { classId: grade2.id, decisions: [{ studentId: senior.body.id, outcome: "PROMOTE" }] });
    expect(promote.status).toBe(400);

    const graduate = await admin.post("/api/promotions", { classId: grade2.id, decisions: [{ studentId: senior.body.id, outcome: "GRADUATE" }] });
    expect(graduate.status).toBe(201);
    expect((await prisma.student.findUniqueOrThrow({ where: { id: senior.body.id } })).status).toBe("GRADUATED");
  });
});

describe("new year setup", () => {
  it("copies class teachers from last year without overwriting the new year", async () => {
    const copy = await admin.post("/api/assignments/copy", { fromYearId: school.year.id, toYearId: nextYearId, subjectTeachers: false, timetable: false });
    expect(copy.status).toBe(200);
    expect(copy.body.copied.classTeachers).toBe(1);
    expect((await admin.post("/api/assignments/copy", { fromYearId: school.year.id, toYearId: nextYearId })).body.copied.classTeachers).toBe(0);
  });
});

describe("student 360° record", () => {
  it("shows every year with attendance, exam results and how the year ended", async () => {
    const record = await admin.get(`/api/students/${students[0].id}/record`);
    expect(record.status).toBe(200);
    expect(record.body.years.map((y: { academicYear: { name: string } }) => y.academicYear.name)).toEqual(["2084", "2083"]);
    const lastYear = record.body.years[1];
    expect(lastYear).toMatchObject({ class: { name: "Grade 1" }, status: "PROMOTED" });
    expect(lastYear.exams[0]).toMatchObject({ name: "Final Examination", grade: "A", result: "PASS", subjects: [{ name: "Maths", grade: "A" }] });
    expect(record.body.promotions[0]).toMatchObject({ fromYear: "2083", toYear: "2084", outcome: "PROMOTE" });
  });

  it("is open to the class teacher but not to other teachers", async () => {
    expect((await authed(classTeacher.token).get(`/api/students/${students[0].id}/record`)).status).toBe(200);
    expect((await authed(otherTeacher.token).get(`/api/students/${students[0].id}/record`)).status).toBe(403);
  });
});

describe("student notes", () => {
  let noteId: string;

  it("the class teacher adds notes; shared ones reach the parents", async () => {
    const teacher = authed(classTeacher.token);
    const privateNote = await teacher.post(`/api/students/${students[0].id}/notes`, { category: "COUNSELLING", title: "Talked about exam stress", date: "2026-10-01" });
    expect(privateNote.status).toBe(201);
    const shared = await teacher.post(`/api/students/${students[0].id}/notes`, { category: "ACHIEVEMENT", title: "First in the district art competition", body: "Well done!", date: "2026-10-05", sharedWithParents: true });
    expect(shared.status).toBe(201);
    noteId = shared.body.id;

    const parent = await parentLogin(students[0].phone);
    const seen = await parent.get(`/api/my/children/${students[0].id}/notes`);
    expect(seen.body.map((n: { title: string }) => n.title)).toEqual(["First in the district art competition"]);
    const notification = await prisma.notification.findFirst({ where: { type: "student.note", data: { path: "$.noteId", equals: noteId } } });
    expect(notification).not.toBeNull();

    // Parents never reach the staff endpoint
    expect((await parent.get(`/api/students/${students[0].id}/notes`)).status).toBe(403);
  });

  it("other teachers can't read or add notes, or change someone else's", async () => {
    const other = authed(otherTeacher.token);
    expect((await other.get(`/api/students/${students[0].id}/notes`)).status).toBe(403);
    expect((await other.post(`/api/students/${students[0].id}/notes`, { category: "GENERAL", title: "Hello", date: "2026-10-05" })).status).toBe(403);
    expect((await other.patch(`/api/students/${students[0].id}/notes/${noteId}`, { title: "Changed" })).status).toBe(403);
  });

  it("staff with student.notes.manage see and edit every note", async () => {
    const list = await admin.get(`/api/students/${students[0].id}/notes`);
    expect(list.body.items).toHaveLength(2);
    expect(list.body.items.every((n: { canEdit: boolean }) => n.canEdit)).toBe(true);
    expect((await admin.delete(`/api/students/${students[0].id}/notes/${noteId}`)).status).toBe(204);
  });
});
