import { useQuery } from "@tanstack/react-query";
import type { GradeBand, StudentResult, SubjectConfig } from "@grading";
import { api } from "@/lib/api";

export type SheetStatus = "DRAFT" | "SUBMITTED" | "VERIFIED" | "PUBLISHED";

export const SHEET_STATUS: Record<SheetStatus, { label: string; tone: "gray" | "amber" | "blue" | "green" }> = {
  DRAFT: { label: "Draft", tone: "gray" },
  SUBMITTED: { label: "Submitted", tone: "amber" },
  VERIFIED: { label: "Verified", tone: "blue" },
  PUBLISHED: { label: "Published", tone: "green" },
};

export interface Exam {
  id: string;
  name: string;
  order: number;
  startDate: string | null;
  endDate: string | null;
  classesConfigured: number;
  sheets: { draft: number; submitted: number; verified: number; published: number };
}

export interface SheetSummary {
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  subjectId: string;
  subjectName: string;
  teachers: { id: string; fullName: string }[];
  status: SheetStatus;
  entered: number;
  students: number;
  returnNote: string | null;
  mine: boolean;
}

export interface MarkRow {
  studentId: string;
  name: string;
  rollNo: number | null;
  theory: number | null;
  practical: number | null;
  status: "PRESENT" | "ABSENT" | "MEDICAL";
}

export interface MarkSheet {
  exam: { id: string; name: string };
  section: { id: string; label: string };
  subject: { id: string; name: string; theoryFullMarks: number; theoryPassMarks: number; practicalFullMarks: number; practicalPassMarks: number; creditHours: number };
  status: SheetStatus;
  returnNote: string | null;
  history: Record<"submitted" | "verified" | "published", { by: string | null; at: string } | null>;
  access: { canView: boolean; canEdit: boolean; canSubmit: boolean; canVerify: boolean; canReturn: boolean; reason: string | null };
  students: MarkRow[];
  updatedAt: string | null;
}

export interface Results {
  exam: { id: string; name: string; academicYear: string };
  class: { id: string; name: string };
  subjects: SubjectConfig[];
  bands: GradeBand[];
  published: boolean;
  students: {
    studentId: string;
    name: string;
    admissionNo: string;
    rollNo: number | null;
    sectionId: string;
    sectionName: string;
    remark: string | null;
    result: StudentResult;
    classRank: number | null;
    sectionRank: number | null;
  }[];
}

export const useExams = () =>
  useQuery({ queryKey: ["exams"], queryFn: () => api.get<{ academicYear: { id: string; name: string }; exams: Exam[] }>("/exams") });

export const useGradingScale = () => useQuery({ queryKey: ["grading-scale"], queryFn: () => api.get<GradeBand[]>("/exams/grading-scale"), staleTime: 300_000 });
