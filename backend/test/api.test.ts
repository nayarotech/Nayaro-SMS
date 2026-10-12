import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { redis } from "../src/lib/redis.js";
import { admissionBody, app, authed, createTestSchool, login, PASSWORD, uniquePhone } from "./helpers.js";

type TestSchool = Awaited<ReturnType<typeof createTestSchool>>;
let schoolA: TestSchool;
let schoolB: TestSchool;

beforeAll(async () => {
  schoolA = await createTestSchool();
  schoolB = await createTestSchool();
});

afterAll(async () => {
  await prisma.$disconnect();
  await redis.quit();
});

describe("multi-school isolation", () => {
  it("an admin cannot see or change another school's student", async () => {
    const admitted = await authed(schoolB.token).post("/api/students", admissionBody(schoolB.section.id));
    expect(admitted.status).toBe(201);
    const studentId = admitted.body.id;

    expect((await authed(schoolA.token).get(`/api/students/${studentId}`)).status).toBe(404);
    expect((await authed(schoolA.token).patch(`/api/students/${studentId}`, { firstName: "Hacked" })).status).toBe(404);
    expect((await authed(schoolA.token).get("/api/students")).body.items.map((s: { id: string }) => s.id)).not.toContain(studentId);
  });

  it("cannot admit a student into another school's section", async () => {
    const response = await authed(schoolA.token).post("/api/students", admissionBody(schoolB.section.id));
    expect(response.status).toBe(404);
  });

  it("cannot attach another school's uploaded file", async () => {
    const upload = await request(app)
      .post("/api/files")
      .set("Authorization", `Bearer ${schoolB.token}`)
      .field("purpose", "school-logo")
      .attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: "logo.png", contentType: "image/png" });
    expect(upload.status).toBe(201);

    const response = await authed(schoolA.token).patch("/api/school", { logoKey: upload.body.key });
    expect(response.status).toBe(404);
  });

  it("only super admins can list schools", async () => {
    expect((await authed(schoolA.token).get("/api/schools")).status).toBe(403);
  });
});

describe("roles & permissions", () => {
  it("blocks a user without the permission and allows them once granted", async () => {
    const roles = (await authed(schoolA.token).get("/api/roles")).body as { id: string; key: string }[];
    const subjectTeacher = roles.find((r) => r.key === "subject_teacher")!;
    const email = `teacher-${Date.now()}@test.local`;
    const created = await authed(schoolA.token).post("/api/users", { fullName: "Test Teacher", email, password: PASSWORD, roleIds: [subjectTeacher.id] });
    expect(created.status).toBe(201);

    const teacher = authed(await login(email));
    expect((await teacher.get("/api/students")).status).toBe(200); // subject teachers have student.view
    expect((await teacher.post("/api/students", admissionBody(schoolA.section.id))).status).toBe(403);
    expect((await teacher.get("/api/audit")).status).toBe(403);

    // Individual grant takes effect immediately (no re-login)
    await authed(schoolA.token).put(`/api/users/${created.body.id}/permissions`, { overrides: [{ permission: "audit.view", effect: "GRANT" }] });
    expect((await teacher.get("/api/audit")).status).toBe(200);

    // Removing the permission from the role also takes effect immediately
    const role = (await authed(schoolA.token).get(`/api/roles/${subjectTeacher.id}`)).body;
    await authed(schoolA.token).patch(`/api/roles/${subjectTeacher.id}`, { permissions: role.permissions.filter((p: string) => p !== "student.view") });
    expect((await teacher.get("/api/students")).status).toBe(403);
  });

  it("School Admin permissions are locked", async () => {
    const roles = (await authed(schoolA.token).get("/api/roles")).body as { id: string; key: string }[];
    const adminRole = roles.find((r) => r.key === "school_admin")!;
    expect((await authed(schoolA.token).patch(`/api/roles/${adminRole.id}`, { permissions: [] })).status).toBe(403);
  });

  it("a school can't remove its last School Admin", async () => {
    expect((await authed(schoolA.token).put(`/api/users/${schoolA.admin.id}/roles`, { roleIds: [] })).status).toBe(403);
  });

  it("custom roles can be created, assigned and are audit-logged", async () => {
    const created = await authed(schoolA.token).post("/api/roles", { name: "Exam Coordinator", permissions: ["exam.manage", "student.view"] });
    expect(created.status).toBe(201);
    expect(created.body.key).toBe("exam_coordinator");

    const audit = await authed(schoolA.token).get("/api/audit?entityType=Role");
    expect(audit.body.items.some((entry: { action: string }) => entry.action === "role.create")).toBe(true);
  });

  it("rejects unknown permission keys", async () => {
    expect((await authed(schoolA.token).post("/api/roles", { name: "Bad", permissions: ["everything.ever"] })).status).toBe(400);
  });
});

describe("auth", () => {
  it("rotates refresh tokens and revokes the session when an old one is reused", async () => {
    const loginResponse = await request(app).post("/api/auth/login").send({ identifier: schoolA.adminEmail, password: PASSWORD });
    const first = loginResponse.body.refreshToken as string;

    const refreshed = await request(app).post("/api/auth/refresh").send({ refreshToken: first });
    expect(refreshed.status).toBe(200);
    const second = refreshed.body.refreshToken as string;
    expect(second).not.toBe(first);

    // Replaying the first token looks like theft → whole session revoked
    expect((await request(app).post("/api/auth/refresh").send({ refreshToken: first })).status).toBe(401);
    expect((await request(app).post("/api/auth/refresh").send({ refreshToken: second })).status).toBe(401);
  });

  it("rejects a wrong password", async () => {
    expect((await request(app).post("/api/auth/login").send({ identifier: schoolA.adminEmail, password: "wrong" })).status).toBe(401);
  });

  it("lets a parent log in with phone + OTP, and asks which school when the phone is in two schools", async () => {
    const phone = uniquePhone();
    await authed(schoolA.token).post("/api/students", admissionBody(schoolA.section.id, phone));
    await authed(schoolB.token).post("/api/students", admissionBody(schoolB.section.id, phone));

    const requested = await request(app).post("/api/auth/otp/request").send({ phone });
    expect(requested.body.devCode).toMatch(/^\d{6}$/);

    expect((await request(app).post("/api/auth/otp/verify").send({ phone, code: "000000" })).status).toBe(401);

    const verified = await request(app).post("/api/auth/otp/verify").send({ phone, code: requested.body.devCode });
    expect(verified.body.status).toBe("select_school");
    expect(verified.body.accounts).toHaveLength(2);

    const chosen = verified.body.accounts.find((a: { schoolCode: string }) => a.schoolCode === schoolA.school.code);
    const selected = await request(app).post("/api/auth/select-school").send({ selectionToken: verified.body.selectionToken, userId: chosen.userId });
    expect(selected.status).toBe(200);

    const parent = authed(selected.body.accessToken);
    const children = await parent.get("/api/my/children");
    expect(children.body).toHaveLength(1);
    expect((await parent.get(`/api/my/children/${children.body[0].id}`)).status).toBe(200);

    // Parents only ever see their own children, and have no staff permissions
    const otherChild = await authed(schoolA.token).post("/api/students", admissionBody(schoolA.section.id));
    expect((await parent.get(`/api/my/children/${otherChild.body.id}`)).status).toBe(404);
    expect((await parent.get(`/api/students/${otherChild.body.id}`)).status).toBe(403);

    // A code can only be used once
    expect((await request(app).post("/api/auth/otp/verify").send({ phone, code: requested.body.devCode })).status).toBe(401);
  });
});

describe("students & guardians", () => {
  it("generates admission and roll numbers and reuses a sibling's parent by phone", async () => {
    const phone = uniquePhone();
    const first = await authed(schoolA.token).post("/api/students", admissionBody(schoolA.section.id, phone));
    const second = await authed(schoolA.token).post("/api/students", { ...admissionBody(schoolA.section.id, phone), firstName: "Sibling" });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    expect(first.body.admissionNo).toMatch(/^2083-\d{4}$/);
    expect(second.body.admissionNo).not.toBe(first.body.admissionNo);
    expect(second.body.currentEnrollment.rollNo).toBe(first.body.currentEnrollment.rollNo + 1);
    expect(second.body.guardians[0].id).toBe(first.body.guardians[0].id);
  });

  it("requires at least one guardian with a phone when the setting is on", async () => {
    const body = admissionBody(schoolA.section.id);
    body.guardians[0].guardian.phone = "";
    expect((await authed(schoolA.token).post("/api/students", body)).status).toBe(400);
  });

  it("returns field errors for invalid input", async () => {
    const response = await authed(schoolA.token).post("/api/students", { ...admissionBody(schoolA.section.id), dateOfBirth: "01/05/2018" });
    expect(response.status).toBe(400);
    expect(response.body.error.details.fieldErrors.dateOfBirth).toBeDefined();
  });

  it("deletes a student's data on request and keeps an audit trail without personal details", async () => {
    const admitted = await authed(schoolA.token).post("/api/students", admissionBody(schoolA.section.id));
    expect((await authed(schoolA.token).delete(`/api/students/${admitted.body.id}`)).status).toBe(204);
    expect((await authed(schoolA.token).get(`/api/students/${admitted.body.id}`)).status).toBe(404);

    const audit = await authed(schoolA.token).get(`/api/audit?entityId=${admitted.body.id}&action=student.delete`);
    expect(audit.body.items[0].oldValue).toEqual({ admissionNo: admitted.body.admissionNo });
  });
});
