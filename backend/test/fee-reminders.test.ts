import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { buildRouter } from "../src/http/router.js";
import { errorHandler } from "../src/http/error-handler.js";
import { signAccessToken } from "../src/lib/tokens.js";
import { feesModule } from "../src/modules/fees/fees.routes.js";
import * as reminders from "../src/modules/fees/reminder.service.js";
import { sms, SmsDeliveryError } from "../src/lib/sms/index.js";
import { listBills } from "../src/modules/fees/fees.service.js";
import { todayInNepal } from "../src/lib/nepali-date.js";
import { notificationsModule } from "../src/modules/notifications/notification.routes.js";

let schoolId: string;
let foreignSchoolId: string;
let userId: string;
let yearId: string;
let classId: string;
let sectionA: string;
let sectionB: string;
let feeId: string;
let a: string;
let b: string;
let c: string;
const app = express();
app.use(express.json(), buildRouter([feesModule, notificationsModule]), errorHandler);
const actor = () => ({ schoolId, userId });
const post = (path: string, body: object) => request(app).post(path).set("Authorization", `Bearer ${signAccessToken({ sub: userId, schoolId })}`).send(body);

beforeAll(async () => {
  schoolId = (await prisma.school.create({ data: { name: "Bulk test", code: randomUUID(), settings: {} } })).id;
  foreignSchoolId = (await prisma.school.create({ data: { name: "Other school", code: randomUUID(), settings: {} } })).id;
  userId = (await prisma.user.create({ data: { schoolId, fullName: "Accountant" } })).id;
  yearId = (await prisma.academicYear.create({ data: { schoolId, name: "2083", startDate: new Date("2026-04-14"), endDate: new Date("2027-04-13"), isCurrent: true } })).id;
  classId = (await prisma.schoolClass.create({ data: { schoolId, name: "Grade 1", order: 1 } })).id;
  sectionA = (await prisma.section.create({ data: { schoolId, classId, name: "A" } })).id;
  sectionB = (await prisma.section.create({ data: { schoolId, classId, name: "B" } })).id;
  feeId = (await prisma.feeStructure.create({ data: { schoolId, name: "Tuition", amount: 100_000 } })).id;
  for (const [index, sectionId] of [sectionA, sectionA, sectionB].entries()) {
    const student = await prisma.student.create({ data: { schoolId, admissionNo: `B${index}`, firstName: `Student ${index}`, lastName: "Test", gender: "FEMALE", dateOfBirth: new Date("2018-01-01"), admissionDate: new Date("2026-04-14") } });
    await prisma.enrollment.create({ data: { schoolId, academicYearId: yearId, classId, sectionId, studentId: student.id, rollNo: index + 1 } });
    if (index === 0) a = student.id;
    if (index === 1) b = student.id;
    if (index === 2) c = student.id;
  }
});
afterAll(async () => {
  if (schoolId && foreignSchoolId) {
    const schools = { in: [schoolId, foreignSchoolId] };
    await prisma.feeReminder.deleteMany({ where: { schoolId: schools } });
    await prisma.notification.deleteMany({ where: { schoolId: schools } });
    await prisma.feeBill.deleteMany({ where: { schoolId: schools } });
    await prisma.feeStructure.deleteMany({ where: { schoolId: schools } });
    await prisma.auditLog.deleteMany({ where: { schoolId: schools } });
    await prisma.student.deleteMany({ where: { schoolId: schools } });
    await prisma.section.deleteMany({ where: { schoolId: schools } });
    await prisma.schoolClass.deleteMany({ where: { schoolId: schools } });
    await prisma.academicYear.deleteMany({ where: { schoolId: schools } });
    await prisma.guardian.deleteMany({ where: { schoolId: schools } });
    await prisma.user.deleteMany({ where: { schoolId: schools } });
    await prisma.school.deleteMany({ where: { id: schools } });
  }
  await prisma.$disconnect();
});


let parentId: string;
beforeAll(async () => {
  parentId = (await prisma.user.create({ data: { schoolId, fullName: "Parent", preferredLanguage: "ne" } })).id;
  const guardian = await prisma.guardian.create({ data: { schoolId, userId: parentId } });
  await prisma.studentGuardian.createMany({ data: [a, b, c].map((studentId) => ({ studentId, guardianId: guardian.id, relation: "MOTHER" as const })) });
  const inactive = await prisma.user.create({ data: { schoolId, fullName: "Inactive parent", isActive: false } });
  const otherGuardian = await prisma.guardian.create({ data: { schoolId, userId: inactive.id } });
  await prisma.studentGuardian.create({ data: { studentId: a, guardianId: otherGuardian.id, relation: "FATHER" } });
});
async function bill(studentId = a, dueDate = "2020-01-01", paid = 0) {
  return prisma.feeBill.create({ data: { schoolId, studentId, feeStructureId: feeId, title: "Tuition", period: randomUUID(), dueDate: new Date(dueDate), amount: 100000, total: 100000, paid } });
}
const item = (id: string, expectedBalance = 100000) => ({ billId: id, expectedBalance, userIds: [parentId] });

describe("fee reminders and overdue filters", () => {
  it("filters outstanding and overdue bills using Nepal dates and current class/section", async () => {
    const overdue = await bill(a);
    const today = await bill(b, todayInNepal());
    const paid = await bill(c, "2020-01-01", 100000);
    const filter = { page: 1, pageSize: 100 };
    expect((await listBills(schoolId, { ...filter, status: "overdue" })).items.map((b) => b.id)).toEqual([overdue.id]);
    expect((await listBills(schoolId, { ...filter, status: "outstanding" })).items).toHaveLength(2);
    expect((await listBills(schoolId, { ...filter, status: "paid" })).items.map((b) => b.id)).toEqual([paid.id]);
    expect((await listBills(schoolId, { ...filter, classId, sectionId: sectionB, status: "outstanding" })).items).toHaveLength(0);
    expect((await listBills(schoolId, { ...filter, classId, sectionId: sectionA, status: "outstanding" })).items.map((b) => b.id)).toContain(today.id);
    expect((await listBills(foreignSchoolId, { ...filter, status: "outstanding", classId })).items).toHaveLength(0);
  });
  it("previews only active linked parents and sends localized in-app messages with bill links", async () => {
    const row = await bill();
    const preview = await reminders.previewReminders(schoolId, [row.id]);
    expect(preview[0].recipients).toEqual([{ userId: parentId, name: "Parent", lastSentAt: null, sentToday: false }]);
    expect(await reminders.sendReminders(actor(), [item(row.id)])).toMatchObject({ sent: 1, remindedBills: 1, skippedRecipients: 0 });
    const notification = await prisma.notification.findFirstOrThrow({ where: { schoolId, userId: parentId, type: "fees.reminder", data: { path: "$.billId", equals: row.id } } });
    expect(notification.title).toBe("शुल्क भुक्तानी सम्झना");
    expect(notification.data).toMatchObject({ studentId: a, billId: row.id, balance: 100000 });
    expect((await reminders.previewReminders(schoolId, [row.id]))[0].recipients[0].sentToday).toBe(true);
    expect((await reminders.reminderHistory(schoolId, row.id))[0]).toMatchObject({ recipientName: "Parent", balance: 100000 });
    expect(await prisma.auditLog.count({ where: { schoolId, action: "fees.reminders.send" } })).toBeGreaterThan(0);
  });
  it("deduplicates concurrent and repeated sends but allows a later calendar day", async () => {
    const row = await bill();
    const results = await Promise.all([reminders.sendReminders(actor(), [item(row.id)]), reminders.sendReminders(actor(), [item(row.id)])]);
    expect(results.reduce((sum, r) => sum + r.sent, 0)).toBe(1);
    expect((await reminders.sendReminders(actor(), [item(row.id)])).sent).toBe(0);
    const yesterday = new Date(`${todayInNepal()}T00:00:00Z`); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await prisma.feeReminder.updateMany({ where: { schoolId, billId: row.id }, data: { reminderDay: yesterday } });
    expect((await reminders.sendReminders(actor(), [item(row.id)])).sent).toBe(1);
  });
  it("skips paid, changed balances, unlinked parents and unpreviewed recipients", async () => {
    const paid = await bill(a, "2020-01-01", 100000);
    const changed = await bill(a, "2020-01-01", 100);
    const row = await bill();
    const result = await reminders.sendReminders(actor(), [item(paid.id), item(changed.id), { ...item(row.id), userIds: [userId] }]);
    expect(result).toMatchObject({ sent: 0, skippedRecipients: 3 });
    expect(await prisma.feeReminder.count({ where: { schoolId, billId: { in: [paid.id, changed.id, row.id] } } })).toBe(0);
  });
  it("waits for a concurrent payment before deciding whether to remind", async () => {
    const row = await bill();
    let send: ReturnType<typeof reminders.sendReminders> | undefined;
    await prisma.$transaction(async (tx) => {
      await tx.feeBill.update({ where: { id: row.id }, data: { paid: 100000 } });
      send = reminders.sendReminders(actor(), [item(row.id)]);
    });
    expect((await send!).sent).toBe(0);
  });
  it("isolates schools and requires fee management permission and an enabled module", async () => {
    const row = await bill();
    await expect(reminders.previewReminders(foreignSchoolId, [row.id])).rejects.toMatchObject({ status: 404 });
    await expect(reminders.reminderHistory(foreignSchoolId, row.id)).rejects.toMatchObject({ status: 404 });
    await expect(reminders.sendReminders({ schoolId: foreignSchoolId, userId }, [item(row.id)])).rejects.toMatchObject({ status: 404 });
    expect((await post("/fees/reminders/preview", { billIds: [row.id] })).status).toBe(403);
    await prisma.userPermissionOverride.create({ data: { userId, permission: "fees.manage", effect: "GRANT" } });
    expect((await post("/fees/reminders/preview", { billIds: [row.id] })).status).toBe(200);
    expect((await post("/fees/reminders/preview", { billIds: [row.id, row.id] })).status).toBe(400);
    expect((await post("/fees/reminders/send", { items: [] })).status).toBe(400);
    await prisma.school.update({ where: { id: schoolId }, data: { settings: { "modules.fees": false } } });
    expect((await post("/fees/reminders/send", { items: [item(row.id)] })).status).toBe(403);
    await prisma.school.update({ where: { id: schoolId }, data: { settings: {} } });
  });
  it("previews exact SMS destinations/text, simulates submission and deduplicates independently of in-app", async () => {
    await prisma.user.update({ where: { id: parentId }, data: { phone: "9801234567" } });
    const row = await bill();
    const preview = await reminders.previewReminders(schoolId, [row.id], "SMS");
    expect(preview[0]).toMatchObject({ channel: "SMS", simulated: true, smsConfigured: true });
    expect(preview[0].recipients[0]).toMatchObject({ phone: "9801234567", message: expect.stringContaining("NPR 1000.00"), sentToday: false });
    const input = { ...item(row.id), expectedPhones: { [parentId]: "9801234567" } };
    const mock = vi.spyOn(sms, "send").mockResolvedValue();
    try {
      const results = await Promise.all([reminders.sendReminders(actor(), [input], "SMS"), reminders.sendReminders(actor(), [input], "SMS")]);
      expect(mock).toHaveBeenCalledTimes(1);
      expect(mock).toHaveBeenCalledWith("9801234567", preview[0].recipients[0].message);
      expect(results.reduce((sum, result) => sum + result.sent, 0)).toBe(1);
      expect((await reminders.reminderHistory(schoolId, row.id))[0]).toMatchObject({ channel: "SMS", deliveryStatus: "SIMULATED" });
      expect((await reminders.sendReminders(actor(), [item(row.id)])).sent).toBe(1);
      expect((await reminders.sendReminders(actor(), [input], "SMS")).sent).toBe(0);
      expect(mock).toHaveBeenCalledTimes(1);
    } finally { mock.mockRestore(); }
  });
  it("records rejected and uncertain SMS attempts without replaying them on retries", async () => {
    const rejected = await bill();
    const uncertain = await bill();
    const mock = vi.spyOn(sms, "send").mockRejectedValueOnce(new SmsDeliveryError("REJECTED", "PROVIDER_1013")).mockRejectedValueOnce(new SmsDeliveryError("UNKNOWN", "NETWORK_OR_TIMEOUT"));
    try {
      const rejectedInput = { ...item(rejected.id), expectedPhones: { [parentId]: "9801234567" } };
      expect(await reminders.sendReminders(actor(), [rejectedInput], "SMS")).toMatchObject({ sent: 0, failed: 1, unknown: 0 });
      const uncertainInput = { ...item(uncertain.id), expectedPhones: { [parentId]: "9801234567" } };
      expect(await reminders.sendReminders(actor(), [uncertainInput], "SMS")).toMatchObject({ sent: 0, failed: 0, unknown: 1 });
      expect((await reminders.sendReminders(actor(), [uncertainInput], "SMS")).sent).toBe(0);
      expect(mock).toHaveBeenCalledTimes(2);
      expect((await reminders.reminderHistory(schoolId, rejected.id))[0]).toMatchObject({ channel: "SMS", deliveryStatus: "FAILED", errorCode: "PROVIDER_1013" });
      expect((await reminders.reminderHistory(schoolId, uncertain.id))[0].deliveryStatus).toBe("UNKNOWN");
    } finally { mock.mockRestore(); }
  });
  it("skips stale phone numbers, settled balances and invalid SMS destinations before submission", async () => {
    const row = await bill();
    const paid = await bill(a, "2020-01-01", 100000);
    const mock = vi.spyOn(sms, "send").mockResolvedValue();
    try {
      const input = { ...item(row.id), expectedPhones: { [parentId]: "9800000000" } };
      expect((await reminders.sendReminders(actor(), [input], "SMS")).sent).toBe(0);
      expect((await reminders.sendReminders(actor(), [{ ...item(paid.id), expectedPhones: { [parentId]: "9801234567" } }], "SMS")).sent).toBe(0);
      await prisma.user.update({ where: { id: parentId }, data: { phone: null } });
      expect((await reminders.previewReminders(schoolId, [row.id], "SMS"))[0].recipients[0].phone).toBeNull();
      expect((await reminders.sendReminders(actor(), [input], "SMS")).sent).toBe(0);
      expect(mock).not.toHaveBeenCalled();
    } finally { mock.mockRestore(); }
  });

  it("enforces the SMS batch limit before reserving messages or calling the provider", async () => {
    await prisma.user.update({ where: { id: parentId }, data: { phone: "9801234567" } });
    const bills = await Promise.all(Array.from({ length: 51 }, () => bill()));
    const mock = vi.spyOn(sms, "send").mockResolvedValue();
    try {
      await expect(reminders.sendReminders(actor(), bills.map((row) => ({ ...item(row.id), expectedPhones: { [parentId]: "9801234567" } })), "SMS")).rejects.toMatchObject({ status: 400 });
      expect(mock).not.toHaveBeenCalled();
      expect(await prisma.feeReminder.count({ where: { schoolId, billId: { in: bills.map((b) => b.id) } } })).toBe(0);
      const preview = await post("/fees/reminders/preview", { billIds: [bills[0].id], channel: "SMS" });
      expect(preview.status).toBe(200);
      expect(preview.body[0]).toMatchObject({ channel: "SMS", simulated: true });
      expect((await post("/fees/reminders/send", { items: [item(bills[0].id)], channel: "INVALID" })).status).toBe(400);
    } finally { mock.mockRestore(); }
  });

});
