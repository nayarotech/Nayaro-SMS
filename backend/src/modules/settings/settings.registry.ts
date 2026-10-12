import { z } from "zod";

/**
 * Every per-school setting, with its type and default.
 *
 * To add a setting: add one entry below. The admin dashboard renders the
 * settings screen from this list (GET /api/settings/definitions), validation
 * is generated from it, and readers get the default until a school changes it.
 * Read settings in code with `getSchoolSettings(schoolId)` (settings.service.ts).
 */

interface BaseSetting<T> {
  key: string;
  group: SettingGroupKey;
  label: string;
  description?: string;
  default: T;
}

export type SettingDefinition =
  | (BaseSetting<boolean> & { type: "boolean" })
  | (BaseSetting<number> & { type: "number"; min?: number; max?: number })
  | (BaseSetting<string> & { type: "text"; maxLength?: number })
  | (BaseSetting<string> & { type: "color" })
  | (BaseSetting<string> & { type: "select"; options: SettingOption[] })
  | (BaseSetting<string[]> & { type: "multiselect"; options: SettingOption[] });

export interface SettingOption {
  value: string;
  label: string;
}

export const SETTING_GROUPS = [
  { key: "branding", label: "Branding" },
  { key: "localization", label: "Language & dates" },
  { key: "academic", label: "Academic" },
  { key: "students", label: "Students & admission" },
  { key: "attendance", label: "Attendance" },
  { key: "exams", label: "Exams & report cards" },
  { key: "promotion", label: "Promotion" },
  { key: "security", label: "Login & security" },
  { key: "dashboard", label: "Dashboard" },
  { key: "modules", label: "Modules", description: "Turn whole features on or off for this school" },
] as const;

export type SettingGroupKey = (typeof SETTING_GROUPS)[number]["key"];

const WEEK_DAYS: SettingOption[] = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

/** Widgets the admin dashboard can show. The web app maps each key to a component. */
export const DASHBOARD_WIDGETS: SettingOption[] = [
  { value: "myWork", label: "My work (attendance to take, marks to enter or check)" },
  { value: "attendanceToday", label: "Attendance today" },
  { value: "stats", label: "Totals (students, staff, classes, parents)" },
  { value: "studentsByClass", label: "Students by class" },
  { value: "genderSplit", label: "Gender split" },
  { value: "recentAdmissions", label: "Recent admissions" },
  { value: "recentActivity", label: "Recent activity (audit log)" },
  { value: "setupChecklist", label: "Setup checklist" },
];

/** Feature switches. Disabled modules are hidden from menus and their APIs refuse requests. */
const moduleSetting = (key: string, label: string, enabled = true): SettingDefinition => ({
  key: `modules.${key}`,
  group: "modules",
  type: "boolean",
  label,
  default: enabled,
});

export const SETTINGS: SettingDefinition[] = [
  // Branding
  { key: "branding.primaryColor", group: "branding", type: "color", label: "Primary colour", default: "#2563eb" },
  { key: "branding.motto", group: "branding", type: "text", label: "School motto", default: "", maxLength: 200 },
  {
    key: "branding.shortName",
    group: "branding",
    type: "text",
    label: "Short name",
    description: "Shown in the app header and on SMS messages",
    default: "",
    maxLength: 30,
  },

  // Language & dates
  {
    key: "localization.defaultLanguage",
    group: "localization",
    type: "select",
    label: "Default language",
    options: [
      { value: "en", label: "English" },
      { value: "ne", label: "नेपाली" },
    ],
    default: "en",
  },
  {
    key: "localization.dateDisplay",
    group: "localization",
    type: "select",
    label: "Show dates in",
    options: [
      { value: "bs", label: "Bikram Sambat (BS)" },
      { value: "ad", label: "AD" },
      { value: "both", label: "Both (BS with AD)" },
    ],
    default: "bs",
  },

  // Academic
  {
    key: "academic.workingDays",
    group: "academic",
    type: "multiselect",
    label: "Working days",
    options: WEEK_DAYS,
    default: ["0", "1", "2", "3", "4", "5"],
  },

  // Students & admission
  {
    key: "students.autoAdmissionNo",
    group: "students",
    type: "boolean",
    label: "Generate admission numbers automatically",
    default: true,
  },
  {
    key: "students.admissionNoPrefix",
    group: "students",
    type: "text",
    label: "Admission number prefix",
    description: 'e.g. "ADM-" gives ADM-2082-0001',
    default: "",
    maxLength: 20,
  },
  {
    key: "students.requireGuardianPhone",
    group: "students",
    type: "boolean",
    label: "Require at least one guardian phone number on admission",
    default: true,
  },
  {
    key: "students.createStudentLogin",
    group: "students",
    type: "boolean",
    label: "Allow students to have their own app login",
    default: false,
  },

  // Attendance
  {
    key: "attendance.editWindowDays",
    group: "attendance",
    type: "number",
    label: "Days a class teacher can go back to take or correct attendance",
    description: "0 means no limit. Admins can always correct attendance. Every change is recorded in the audit log.",
    min: 0,
    max: 365,
    default: 7,
  },
  {
    key: "attendance.notifyParentsOnAbsence",
    group: "attendance",
    type: "boolean",
    label: "Notify parents when their child is marked absent",
    default: true,
  },
  {
    key: "attendance.lateCountsAsPresent",
    group: "attendance",
    type: "boolean",
    label: "Count late arrivals as present in attendance percentages",
    default: true,
  },

  // Exams & report cards
  { key: "exams.showRank", group: "exams", type: "boolean", label: "Show rank on report cards", default: true },
  { key: "exams.showAttendance", group: "exams", type: "boolean", label: "Show attendance on report cards", default: true },
  { key: "exams.showPercentage", group: "exams", type: "boolean", label: "Show percentage alongside GPA", default: true },
  {
    key: "exams.signatures",
    group: "exams",
    type: "text",
    label: "Signature lines on report cards",
    description: "Comma separated, e.g. Class Teacher, Exam Coordinator, Principal",
    default: "Class Teacher, Exam Coordinator, Principal",
    maxLength: 200,
  },
  { key: "exams.reportCardNote", group: "exams", type: "text", label: "Note printed at the bottom of report cards", default: "", maxLength: 300 },

  // Promotion (suggestions only — staff decide for every student)
  {
    key: "promotion.basis",
    group: "promotion",
    type: "select",
    label: "Suggest promotion based on",
    options: [
      { value: "finalExam", label: "Final exam result (pass → promote, fail → detain)" },
      { value: "none", label: "Nothing — suggest promoting everyone" },
    ],
    default: "finalExam",
  },
  {
    key: "promotion.minAttendancePercent",
    group: "promotion",
    type: "number",
    label: "Minimum attendance to be promoted (%)",
    description: "Students below this are suggested for detention. 0 turns the rule off.",
    default: 0,
    min: 0,
    max: 100,
  },

  // Login & security
  {
    key: "security.otpLoginEnabled",
    group: "security",
    type: "boolean",
    label: "Allow login with phone + OTP",
    default: true,
  },
  {
    key: "security.passwordMinLength",
    group: "security",
    type: "number",
    label: "Minimum password length",
    min: 8,
    max: 64,
    default: 8,
  },

  // Dashboard
  {
    key: "dashboard.adminWidgets",
    group: "dashboard",
    type: "multiselect",
    label: "Widgets on the admin dashboard",
    options: DASHBOARD_WIDGETS,
    default: DASHBOARD_WIDGETS.map((widget) => widget.value),
  },

  // Modules
  moduleSetting("attendance", "Attendance"),
  moduleSetting("exams", "Exams & marks"),
  moduleSetting("homework", "Homework & materials"),
  moduleSetting("notices", "Notices"),
  moduleSetting("website", "School website"),
  moduleSetting("messaging", "Teacher–parent messaging"),
  moduleSetting("fees", "Fees & payments"),
  moduleSetting("whatsapp", "WhatsApp automation", false),
  moduleSetting("cctv", "Live classroom view (CCTV)", false),
  moduleSetting("transport", "Transport"),
  moduleSetting("library", "Library"),
];

export type SchoolSettings = Record<string, boolean | number | string | string[]>;

export const DEFAULT_SETTINGS: SchoolSettings = Object.fromEntries(SETTINGS.map((s) => [s.key, s.default]));

/** Zod schema for one setting's value, built from its definition. */
function valueSchema(setting: SettingDefinition): z.ZodType {
  switch (setting.type) {
    case "boolean":
      return z.boolean();
    case "number": {
      let schema = z.number().int();
      if (setting.min !== undefined) schema = schema.min(setting.min);
      if (setting.max !== undefined) schema = schema.max(setting.max);
      return schema;
    }
    case "text":
      return z.string().max(setting.maxLength ?? 500);
    case "color":
      return z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a colour like #2563eb");
    case "select":
      return z.enum(setting.options.map((o) => o.value) as [string, ...string[]]);
    case "multiselect":
      return z.array(z.enum(setting.options.map((o) => o.value) as [string, ...string[]]));
  }
}

/** Validates a partial update: only known keys, each with a valid value. */
export const settingsUpdateSchema = z
  .object(Object.fromEntries(SETTINGS.map((s) => [s.key, valueSchema(s).optional()])))
  .strict();
