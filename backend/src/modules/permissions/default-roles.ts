import { ALL_PERMISSIONS_WILDCARD, type Permission } from "./permission.catalog.js";

/**
 * Built-in roles created for every new school. Schools can change the
 * permissions of these roles from the dashboard (except School Admin, which
 * always has everything so a school can never lock itself out).
 *
 * Parents and students get no permissions here: what they can see is decided
 * by their relationship to a student (their own children / themselves).
 */

export const SYSTEM_ROLE_KEYS = {
  schoolAdmin: "school_admin",
  principal: "principal",
  accountant: "accountant",
  classTeacher: "class_teacher",
  subjectTeacher: "subject_teacher",
  homeworkCoordinator: "homework_coordinator",
  parent: "parent",
  student: "student",
} as const;

export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[keyof typeof SYSTEM_ROLE_KEYS];

export interface DefaultRole {
  key: SystemRoleKey;
  name: string;
  description: string;
  permissions: (Permission | typeof ALL_PERMISSIONS_WILDCARD)[];
  /** Locked roles cannot have their permissions changed. */
  locked?: boolean;
}

export const DEFAULT_ROLES: DefaultRole[] = [
  {
    key: SYSTEM_ROLE_KEYS.schoolAdmin,
    name: "School Admin",
    description: "Full access to everything in this school",
    permissions: [ALL_PERMISSIONS_WILDCARD],
    locked: true,
  },
  {
    key: SYSTEM_ROLE_KEYS.principal,
    name: "Principal",
    description: "Oversees academics, verifies and publishes results",
    permissions: [
      "school.settings.view",
      "audit.view",
      "user.view",
      "role.view",
      "academic.view",
      "academic.manage",
      "assignment.manage",
      "timetable.manage",
      "student.view",
      "student.edit",
      "student.record.view",
      "student.notes.manage",
      "guardian.view",
      "attendance.view",
      "attendance.edit",
      "attendance.proxy.assign",
      "attendance.report",
      "staff_attendance.mark",
      "exam.manage",
      "marks.verify",
      "marks.publish",
      "reportcard.generate",
      "promotion.manage",
      "notice.send",
      "message.send",
      "message.monitor",
      "website.posts",
      "website.enquiries",
      "fees.view",
      "fees.report",
      "leave.approve",
      "certificate.generate",
    ],
  },
  {
    key: SYSTEM_ROLE_KEYS.accountant,
    name: "Accountant",
    description: "Fees, payments and receipts",
    permissions: ["student.view", "guardian.view", "academic.view", "fees.view", "fees.manage", "fees.collect", "fees.report"],
  },
  {
    key: SYSTEM_ROLE_KEYS.classTeacher,
    name: "Class Teacher",
    description: "Takes attendance and looks after one section",
    permissions: [
      "academic.view",
      "student.view",
      "guardian.view",
      "attendance.view",
      "attendance.mark",
      "attendance.edit",
      "marks.enter",
      "homework.post",
      "material.upload",
      "message.send",
    ],
  },
  {
    key: SYSTEM_ROLE_KEYS.subjectTeacher,
    name: "Subject Teacher",
    description: "Teaches assigned subjects, enters marks and homework",
    permissions: ["academic.view", "student.view", "marks.enter", "homework.post", "material.upload", "message.send"],
  },
  {
    key: SYSTEM_ROLE_KEYS.homeworkCoordinator,
    name: "Homework Coordinator",
    description: "Enters homework for any class on behalf of teachers",
    permissions: ["academic.view", "student.view", "homework.post", "homework.post_on_behalf"],
  },
  {
    key: SYSTEM_ROLE_KEYS.parent,
    name: "Parent",
    description: "Sees their own children's information in the app",
    permissions: [],
  },
  {
    key: SYSTEM_ROLE_KEYS.student,
    name: "Student",
    description: "Sees their own information in the app",
    permissions: [],
  },
];

export const LOCKED_ROLE_KEYS: string[] = DEFAULT_ROLES.filter((role) => role.locked).map((role) => role.key);
