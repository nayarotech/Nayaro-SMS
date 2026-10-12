export type Outcome = "PROMOTE" | "DETAIN" | "GRADUATE" | "LEAVE";
export type RollNumbering = "rank" | "name" | "keep";

export const OUTCOME: Record<Outcome, { label: string; tone: "green" | "red" | "blue" | "gray" }> = {
  PROMOTE: { label: "Promote", tone: "green" },
  DETAIN: { label: "Detain", tone: "red" },
  GRADUATE: { label: "Graduate", tone: "blue" },
  LEAVE: { label: "Left school", tone: "gray" },
};

interface YearRef {
  id: string;
  name: string;
  isCurrent?: boolean;
}

export interface PromotionOverview {
  fromYear: YearRef;
  toYear: YearRef | null;
  classes: { id: string; name: string; total: number; pending: number; promoted: number; detained: number; graduated: number; left: number }[];
  runs: {
    id: string;
    className: string;
    toYear: string;
    createdAt: string;
    createdBy: string | null;
    undoneAt: string | null;
    counts: Record<Outcome, number>;
  }[];
}

interface ClassRef {
  id: string;
  name: string;
  sections: { id: string; name: string }[];
}

export interface PromotionStudent {
  studentId: string;
  enrollmentId: string;
  name: string;
  admissionNo: string;
  section: { id: string; name: string };
  rollNo: number | null;
  enrollmentStatus: string;
  result: { gpa: number | null; grade: string; result: "PASS" | "FAIL" | "INCOMPLETE"; percentage: number; sectionRank: number | null; failedSubjects: string[] } | null;
  attendancePercent: number | null;
  suggestion: { outcome: Outcome | null; reason: string };
  decided: { outcome: Outcome; runId: string; reason: string | null } | null;
  inTargetYear: { classSection: string; rollNo: number | null } | null;
}

export interface PromotionPreview {
  fromYear: YearRef;
  toYear: YearRef | null;
  class: ClassRef;
  nextClass: ClassRef | null;
  exam: { id: string; name: string; published: boolean } | null;
  rule: { basis: "finalExam" | "none"; minAttendancePercent: number };
  students: PromotionStudent[];
}
