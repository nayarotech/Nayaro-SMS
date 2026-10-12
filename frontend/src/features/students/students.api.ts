import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type Gender = "MALE" | "FEMALE" | "OTHER";
export type Relation = "FATHER" | "MOTHER" | "GUARDIAN" | "GRANDPARENT" | "SIBLING" | "OTHER";
export type StudentStatus = "ACTIVE" | "LEFT" | "TRANSFERRED" | "GRADUATED";

export const RELATIONS: { value: Relation; label: string }[] = [
  { value: "FATHER", label: "Father" },
  { value: "MOTHER", label: "Mother" },
  { value: "GUARDIAN", label: "Guardian" },
  { value: "GRANDPARENT", label: "Grandparent" },
  { value: "SIBLING", label: "Sibling" },
  { value: "OTHER", label: "Other" },
];

export const relationLabel = (value: Relation) => RELATIONS.find((r) => r.value === value)?.label ?? value;

export const STATUS_LABEL: Record<StudentStatus, string> = {
  ACTIVE: "Active",
  LEFT: "Left",
  TRANSFERRED: "Transferred",
  GRADUATED: "Graduated",
};

export interface StudentListItem {
  id: string;
  admissionNo: string;
  fullName: string;
  gender: Gender;
  dateOfBirth: string;
  photoUrl: string | null;
  status: StudentStatus;
  class: { id: string; name: string } | null;
  section: { id: string; name: string } | null;
  rollNo: number | null;
  primaryGuardian: { name: string; phone: string | null } | null;
}

export interface StudentDetail {
  id: string;
  admissionNo: string;
  fullName: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  gender: Gender;
  dateOfBirth: string;
  bloodGroup: string | null;
  religion: string | null;
  nationality: string | null;
  address: string | null;
  temporaryAddress: string | null;
  phone: string | null;
  email: string | null;
  photoUrl: string | null;
  admissionDate: string;
  previousSchool: string | null;
  medicalNotes: string | null;
  status: StudentStatus;
  currentEnrollment: {
    id: string;
    academicYear: { id: string; name: string };
    class: { id: string; name: string };
    section: { id: string; name: string };
    rollNo: number | null;
    status: string;
  } | null;
  guardians: {
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
    occupation: string | null;
    relation: Relation;
    isPrimary: boolean;
    whatsappOptIn: boolean;
    hasLoggedIn: boolean;
    hasPassword: boolean;
  }[];
  canSeeFullRecord: boolean;
  /** 360° record and notes (also open to the student's class teacher) */
  access: { record: boolean; notes: boolean; addNotes: boolean; manageNotes: boolean };
  history: { id: string; academicYear: string; classSection: string; rollNo: number | null; status: string; remarks: string | null }[] | null;
  documents: { id: string; title: string; url: string; createdAt: string }[] | null;
}

export interface Guardian {
  id: string;
  userId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  occupation: string | null;
  address: string | null;
  alternatePhone: string | null;
  whatsappOptIn: boolean;
  whatsappOptInAt: string | null;
  whatsappOptOutAt: string | null;
  hasLoggedIn: boolean;
  hasPassword: boolean;
  children: { id: string; name: string; admissionNo: string; status: StudentStatus; relation: Relation; isPrimary: boolean; classSection: string | null }[];
}

// ─── 360° record & notes ─────────────────────────────────────

export type NoteCategory = "ACHIEVEMENT" | "DISCIPLINE" | "COUNSELLING" | "HEALTH" | "GENERAL";

export interface ExamRecord {
  examId: string;
  name: string;
  published: boolean;
  gpa: number | null;
  grade: string;
  result: "PASS" | "FAIL" | "INCOMPLETE";
  percentage: number;
  totalObtained: number;
  totalFull: number;
  sectionRank: number | null;
  classRank: number | null;
  studentsInClass: number;
  remark: string | null;
  subjects: { subjectId: string; name: string; obtained: number | null; fullMarks: number; percentage: number | null; grade: string; outcome: string }[];
}

export interface StudentRecord {
  years: {
    academicYear: { id: string; name: string; isCurrent: boolean };
    class: { id: string; name: string };
    section: { id: string; name: string };
    rollNo: number | null;
    status: string;
    remarks: string | null;
    attendance: { present: number; absent: number; late: number; leave: number; total: number; percent: number | null };
    exams: ExamRecord[];
  }[];
  promotions: { fromYear: string; toYear: string; outcome: string; suggested: string | null; reason: string | null; decidedOn: string }[];
  notes: Partial<Record<NoteCategory, number>>;
}

export const RESULT_TONE = { PASS: "green", FAIL: "red", INCOMPLETE: "amber" } as const;
export const YEAR_STATUS: Record<string, { label: string; tone: "green" | "red" | "blue" | "gray" | "amber" }> = {
  ACTIVE: { label: "Studying", tone: "blue" },
  PROMOTED: { label: "Promoted", tone: "green" },
  DETAINED: { label: "Detained", tone: "red" },
  GRADUATED: { label: "Graduated", tone: "green" },
  COMPLETED: { label: "Completed, left", tone: "gray" },
  LEFT: { label: "Left", tone: "gray" },
  TRANSFERRED: { label: "Transferred", tone: "gray" },
};

export const useStudentRecord = (studentId: string, enabled = true) =>
  useQuery({ queryKey: ["student-record", studentId], queryFn: () => api.get<StudentRecord>(`/students/${studentId}/record`), enabled });

export const NOTE_CATEGORY: Record<NoteCategory, { label: string; tone: "green" | "red" | "blue" | "amber" | "gray" }> = {
  ACHIEVEMENT: { label: "Achievement", tone: "green" },
  DISCIPLINE: { label: "Discipline", tone: "red" },
  COUNSELLING: { label: "Counselling", tone: "blue" },
  HEALTH: { label: "Health", tone: "amber" },
  GENERAL: { label: "General", tone: "gray" },
};
