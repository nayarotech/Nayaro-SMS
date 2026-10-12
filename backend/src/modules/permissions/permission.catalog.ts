/**
 * Every permission in the system.
 *
 * To add a permission: add it to a group below, use it in a route
 * (`permission: "x.y"`), and optionally add it to a built-in role in
 * default-roles.ts. The admin dashboard reads this catalog (GET /api/meta/permissions),
 * so it appears in the Roles screen automatically.
 *
 * Groups marked `comingSoon` belong to modules that aren't built yet. They are
 * listed now so roles can be configured up front.
 */

export interface PermissionDefinition {
  key: string;
  label: string;
  description?: string;
}

export interface PermissionGroup {
  key: string;
  label: string;
  comingSoon?: boolean;
  permissions: PermissionDefinition[];
}

export const PERMISSION_GROUPS = [
  {
    key: "school",
    label: "School & settings",
    permissions: [
      { key: "school.settings.view", label: "View school settings" },
      { key: "school.settings.edit", label: "Edit school settings and branding" },
      { key: "audit.view", label: "View audit log" },
    ],
  },
  {
    key: "users",
    label: "Users, roles & permissions",
    permissions: [
      { key: "user.view", label: "View staff and user accounts" },
      { key: "user.manage", label: "Create, edit and deactivate users" },
      { key: "role.view", label: "View roles" },
      { key: "role.manage", label: "Create and edit roles, assign roles to users" },
      {
        key: "user.permissions.manage",
        label: "Grant or revoke individual permissions",
        description: "Per-user exceptions on top of their roles",
      },
    ],
  },
  {
    key: "academic",
    label: "Academic setup",
    permissions: [
      { key: "academic.view", label: "View academic setup" },
      {
        key: "academic.manage",
        label: "Manage academic years, classes, sections, subjects and periods",
      },
      { key: "assignment.manage", label: "Assign teachers to subjects and class teachers" },
      { key: "timetable.manage", label: "Edit timetables" },
    ],
  },
  {
    key: "students",
    label: "Students & parents",
    permissions: [
      { key: "student.view", label: "View student list and basic details" },
      { key: "student.create", label: "Admit new students" },
      { key: "student.edit", label: "Edit student details" },
      { key: "student.delete", label: "Delete student data", description: "Used for data deletion requests" },
      {
        key: "student.record.view",
        label: "View full student record (360° profile)",
        description: "Marks, attendance, fees, remarks, discipline and documents",
      },
      { key: "student.documents.manage", label: "Upload and remove student documents" },
      {
        key: "student.notes.manage",
        label: "Add notes to any student's record",
        description: "Achievements, discipline, counselling and health notes. Class teachers can always add notes for their own section.",
      },
      { key: "guardian.view", label: "View parents/guardians" },
      { key: "guardian.manage", label: "Add and edit parents/guardians, link them to students" },
    ],
  },
  {
    key: "website",
    label: "School website",
    permissions: [
      { key: "website.edit", label: "Edit website pages, theme, menus and gallery" },
      { key: "website.publish", label: "Publish website changes" },
      { key: "website.posts", label: "Write and publish notices, news and events" },
      { key: "website.enquiries", label: "Read and answer website enquiries" },
    ],
  },
  {
    key: "attendance",
    label: "Attendance",
    permissions: [
      { key: "attendance.view", label: "View attendance" },
      { key: "attendance.mark", label: "Take attendance for own section (class teacher or proxy)" },
      { key: "attendance.edit", label: "Correct attendance after it was taken" },
      { key: "attendance.proxy.assign", label: "Assign proxy teachers and take/correct any section's attendance" },
      { key: "attendance.report", label: "View and export attendance reports" },
      { key: "staff_attendance.mark", label: "Mark staff attendance" },
    ],
  },
  {
    key: "exams",
    label: "Exams & marks",
    permissions: [
      { key: "exam.manage", label: "Set up terms, exams and full/pass marks" },
      { key: "marks.enter", label: "Enter marks (for assigned subjects)" },
      { key: "marks.verify", label: "Verify submitted marks" },
      { key: "marks.publish", label: "Publish results" },
      { key: "marks.edit_published", label: "Edit published marks" },
      { key: "reportcard.generate", label: "Generate report cards" },
      { key: "promotion.manage", label: "Promote, detain and graduate students at year end" },
    ],
  },
  {
    key: "learning",
    label: "Homework & materials",
    comingSoon: true,
    permissions: [
      { key: "homework.post", label: "Post homework" },
      { key: "homework.post_on_behalf", label: "Post homework on behalf of any teacher" },
      { key: "material.upload", label: "Upload course materials" },
    ],
  },
  {
    key: "communication",
    label: "Notices & messaging",
    comingSoon: true,
    permissions: [
      { key: "notice.send", label: "Send notices" },
      { key: "message.send", label: "Message parents" },
      { key: "message.monitor", label: "Read all teacher–parent messages (safeguarding)" },
      { key: "whatsapp.settings", label: "Configure WhatsApp Business" },
      { key: "whatsapp.bulk", label: "Send bulk WhatsApp messages" },
    ],
  },
  {
    key: "fees",
    label: "Fees & payments",
    comingSoon: true,
    permissions: [
      { key: "fees.view", label: "View fees and dues" },
      { key: "fees.manage", label: "Manage fee structure, discounts and fines" },
      { key: "fees.collect", label: "Collect payments and mark bills paid" },
      { key: "fees.report", label: "View collection reports" },
    ],
  },
  {
    key: "other",
    label: "Other modules",
    comingSoon: true,
    permissions: [
      { key: "leave.approve", label: "Approve leave requests" },
      { key: "library.manage", label: "Manage library" },
      { key: "transport.manage", label: "Manage transport" },
      { key: "certificate.generate", label: "Generate ID cards and certificates" },
      { key: "cctv.manage", label: "Manage CCTV cameras and access rules" },
    ],
  },
] as const satisfies readonly PermissionGroup[];

export type Permission = (typeof PERMISSION_GROUPS)[number]["permissions"][number]["key"];

/** Grants every permission, including ones added in future versions. */
export const ALL_PERMISSIONS_WILDCARD = "*";

export const ALL_PERMISSIONS: readonly Permission[] = PERMISSION_GROUPS.flatMap((group) =>
  group.permissions.map((permission) => permission.key),
);

export function isKnownPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(value);
}
