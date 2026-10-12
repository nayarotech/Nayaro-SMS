import { randomBytes } from "node:crypto";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createAcademicYear } from "../src/modules/academic/academic-year.service.js";
import { createClass } from "../src/modules/academic/class.service.js";
import { createSchool } from "../src/modules/schools/school.service.js";

export const app = createApp();
export const PASSWORD = "Password@123";

/** A fresh school with an admin, a current academic year and one class/section. */
export async function createTestSchool() {
  const code = `T${randomBytes(4).toString("hex").toUpperCase()}`;
  const adminEmail = `admin-${code.toLowerCase()}@test.local`;
  const school = await createSchool({ name: `Test School ${code}`, code, admin: { fullName: "Test Admin", email: adminEmail, password: PASSWORD } });
  const admin = await prisma.user.findFirstOrThrow({ where: { schoolId: school.id } });
  const actor = { userId: admin.id, schoolId: school.id };
  const year = await createAcademicYear(actor, { name: "2083", startDate: "2026-04-14", endDate: "2027-04-13" });
  const schoolClass = await createClass(actor, { name: "Grade 1", order: 1, sections: ["A"] });
  const section = await prisma.section.findFirstOrThrow({ where: { classId: schoolClass.id } });
  const token = await login(adminEmail);
  return { school, admin, actor, year, section, token, adminEmail };
}

export async function login(identifier: string, password = PASSWORD): Promise<string> {
  const response = await request(app).post("/api/auth/login").send({ identifier, password });
  if (response.status !== 200 || !response.body.accessToken) {
    throw new Error(`Login failed for ${identifier}: ${JSON.stringify(response.body)}`);
  }
  return response.body.accessToken;
}

export const authed = (token: string) => ({
  get: (url: string) => request(app).get(url).set("Authorization", `Bearer ${token}`),
  post: (url: string, body?: object) => request(app).post(url).set("Authorization", `Bearer ${token}`).send(body),
  patch: (url: string, body?: object) => request(app).patch(url).set("Authorization", `Bearer ${token}`).send(body),
  put: (url: string, body?: object) => request(app).put(url).set("Authorization", `Bearer ${token}`).send(body),
  delete: (url: string) => request(app).delete(url).set("Authorization", `Bearer ${token}`),
});

let phoneSeq = 0;
/** A unique valid Nepali mobile number for this test run. */
export function uniquePhone(): string {
  phoneSeq++;
  return `98${String(Date.now()).slice(-6)}${String(phoneSeq).padStart(2, "0")}`;
}

export function admissionBody(sectionId: string, guardianPhone = uniquePhone()) {
  return {
    firstName: "Test",
    lastName: "Student",
    gender: "FEMALE",
    dateOfBirth: "2018-05-01",
    admissionDate: "2026-04-20",
    enrollment: { sectionId },
    guardians: [{ relation: "MOTHER", isPrimary: true, guardian: { fullName: "Test Parent", phone: guardianPhone, whatsappOptIn: true } }],
  };
}
