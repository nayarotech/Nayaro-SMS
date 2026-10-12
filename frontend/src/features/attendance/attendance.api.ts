import { todayAd } from "@/lib/dates";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "LEAVE";

export const STATUSES: { value: AttendanceStatus; short: string; label: string; className: string }[] = [
  { value: "PRESENT", short: "P", label: "Present", className: "bg-green-600 text-white border-green-600" },
  { value: "ABSENT", short: "A", label: "Absent", className: "bg-red-600 text-white border-red-600" },
  { value: "LATE", short: "L", label: "Late", className: "bg-amber-500 text-white border-amber-500" },
  { value: "LEAVE", short: "Lv", label: "Leave", className: "bg-blue-600 text-white border-blue-600" },
];

export interface Summary {
  total: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
}

export interface MySection {
  sectionId: string;
  label: string;
  role: "class_teacher" | "proxy" | "admin";
  proxyUntil: string | null;
  students: number;
  taken: boolean;
  summary: Summary | null;
}

export interface SectionAttendance {
  section: { id: string; name: string; className: string };
  date: string;
  dateBs: string;
  isWorkingDay: boolean;
  academicYear: { id: string; name: string };
  access: { canView: boolean; canMark: boolean; asProxy: boolean; reason: string | null };
  taken: { by: string; asProxy: boolean; at: string } | null;
  students: { studentId: string; name: string; rollNo: number | null; photoUrl: string | null; status: AttendanceStatus | null; remark: string | null }[];
  summary: Summary;
}

export const today = () => todayAd();

/** Moves an AD date by some days (for previous/next day buttons). */
export function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
