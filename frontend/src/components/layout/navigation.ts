import {
  BookOpen,
  BarChart3,
  FileCog,
  PenLine,
  Trophy,
  TrendingUp,
  Building2,
  ClipboardCheck,
  UserCheck,
  Globe,
  Megaphone,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  GraduationCap,
  History,
  LayoutDashboard,
  Layers,
  ListChecks,
  School,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

/**
 * Sidebar menu. Each item is shown only if the user has one of its
 * `permission`s, and (when `module` is set) the module is switched on in settings.
 * To add a page: add a route in src/routes.tsx and an item here.
 */
export interface NavItem {
  labelKey: string;
  path: string;
  icon: LucideIcon;
  permission?: string | string[];
  module?: string;
  superAdminOnly?: boolean;
}

export interface NavSection {
  labelKey?: string;
  items: NavItem[];
}

export const NAVIGATION: NavSection[] = [
  {
    items: [
      { labelKey: "nav.dashboard", path: "/", icon: LayoutDashboard },
      { labelKey: "nav.schools", path: "/platform/schools", icon: Building2, superAdminOnly: true },
    ],
  },
  {
    labelKey: "nav.dailyWork",
    items: [
      { labelKey: "nav.takeAttendance", path: "/attendance", icon: ClipboardCheck, permission: ["attendance.mark", "attendance.proxy.assign"], module: "attendance" },
      { labelKey: "nav.attendanceReports", path: "/attendance/reports", icon: BarChart3, permission: ["attendance.view", "attendance.report", "attendance.proxy.assign"], module: "attendance" },
      { labelKey: "nav.proxies", path: "/attendance/proxies", icon: UserCheck, permission: "attendance.proxy.assign", module: "attendance" },
    ],
  },
  {
    labelKey: "nav.exams",
    items: [
      { labelKey: "nav.marksEntry", path: "/exams/marks", icon: PenLine, permission: ["marks.enter", "marks.verify", "exam.manage"], module: "exams" },
      { labelKey: "nav.results", path: "/exams/results", icon: Trophy, permission: ["exam.manage", "marks.verify", "marks.publish", "reportcard.generate", "attendance.mark"], module: "exams" },
      { labelKey: "nav.examSetup", path: "/exams", icon: FileCog, permission: "exam.manage", module: "exams" },
      { labelKey: "nav.promotion", path: "/promotions", icon: TrendingUp, permission: "promotion.manage" },
    ],
  },
  {
    labelKey: "nav.people",
    items: [
      { labelKey: "nav.students", path: "/students", icon: GraduationCap, permission: "student.view" },
      { labelKey: "nav.admission", path: "/students/new", icon: UserPlus, permission: "student.create" },
      { labelKey: "nav.guardians", path: "/guardians", icon: UsersRound, permission: "guardian.view" },
      { labelKey: "nav.staff", path: "/staff", icon: Users, permission: "user.view" },
    ],
  },
  {
    labelKey: "nav.academic",
    items: [
      { labelKey: "nav.academicYears", path: "/academic/years", icon: CalendarRange, permission: "academic.view" },
      { labelKey: "nav.classes", path: "/academic/classes", icon: Layers, permission: "academic.view" },
      { labelKey: "nav.subjects", path: "/academic/subjects", icon: BookOpen, permission: "academic.view" },
      { labelKey: "nav.optionalSubjects", path: "/academic/optional-subjects", icon: ListChecks, permission: ["student.view", "academic.view"] },
      { labelKey: "nav.assignments", path: "/academic/assignments", icon: ClipboardList, permission: "academic.view" },
      { labelKey: "nav.timetable", path: "/academic/timetable", icon: CalendarDays, permission: "academic.view" },
    ],
  },
  {
    labelKey: "nav.websiteSection",
    items: [
      { labelKey: "nav.website", path: "/website", icon: Globe, permission: ["website.edit", "website.posts", "website.enquiries"], module: "website" },
      { labelKey: "nav.websitePosts", path: "/website/posts", icon: Megaphone, permission: "website.posts", module: "website" },
    ],
  },
  {
    labelKey: "nav.administration",
    items: [
      { labelKey: "nav.roles", path: "/roles", icon: ShieldCheck, permission: "role.view" },
      { labelKey: "nav.schoolProfile", path: "/settings/school", icon: School, permission: "school.settings.view" },
      { labelKey: "nav.settings", path: "/settings", icon: Settings, permission: "school.settings.view" },
      { labelKey: "nav.auditLog", path: "/audit", icon: History, permission: "audit.view" },
    ],
  },
];
