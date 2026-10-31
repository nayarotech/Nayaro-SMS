export interface Me {
  id: string;
  fullName: string;
  phone: string | null;
  preferredLanguage: "en" | "ne";
  roles: { key: string; name: string }[];
  permissions: string[];
  school: { id: string; name: string; code: string; logoUrl: string | null } | null;
  settings: Record<string, unknown> | null;
}

export interface Child {
  id: string;
  fullName: string;
  admissionNo: string;
  relation: string;
  classSection: string | null;
  rollNo: number | null;
  photoUrl: string | null;
}

export interface ChildProfile {
  id: string;
  fullName: string;
  admissionNo: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  dateOfBirth: string;
  bloodGroup: string | null;
  address: string | null;
  photoUrl: string | null;
  admissionDate: string;
  currentEnrollment: { academicYear: { name: string }; class: { name: string }; section: { name: string }; rollNo: number | null } | null;
  guardians: { id: string; fullName: string; phone: string | null; relation: string; isPrimary: boolean; whatsappOptIn: boolean }[];
  /** Every year at the school, newest first */
  history?: { id: string; academicYear: string; classSection: string; rollNo: number | null; status: string }[];
}

export type NoteCategory = "ACHIEVEMENT" | "DISCIPLINE" | "COUNSELLING" | "HEALTH" | "GENERAL";

export interface SchoolNote {
  id: string;
  category: NoteCategory;
  title: string;
  body: string | null;
  date: string;
  dateBs: string;
  author: string;
}

export type LoginResult =
  | { status: "ok"; accessToken: string; refreshToken: string }
  | { status: "select_school"; selectionToken: string; accounts: { userId: string; schoolName: string; schoolCode: string }[] };

export type SheetStatus = "DRAFT" | "SUBMITTED" | "VERIFIED" | "PUBLISHED";

export interface MySheet {
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  subjectId: string;
  subjectName: string;
  status: SheetStatus;
  entered: number;
  students: number;
  returnNote: string | null;
}

export interface MySheets {
  exams: { id: string; name: string; sheets: MySheet[] }[];
}

export interface GradeBand {
  min: number;
  grade: string;
  gradePoint: number;
}

export interface Attachment {
  key: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
}

export type HomeworkStatus = "DONE" | "PARTIAL" | "NOT_DONE";

/** Homework as a parent sees it */
export interface ChildHomework {
  id: string;
  subject: { id: string; name: string };
  teacher: string;
  title: string;
  description: string | null;
  assignedDate: string;
  dueDate: string;
  dueDateBs: string;
  attachments: Attachment[];
  status: HomeworkStatus | null;
  remark: string | null;
}

/** Homework as a teacher sees it */
export interface TeacherHomework {
  id: string;
  section: { id: string; name: string; className: string };
  subject: { id: string; name: string };
  title: string;
  dueDate: string;
  attachments: Attachment[];
  checked: number;
  students?: number;
}

export interface StudyMaterial {
  id: string;
  subject: { id: string; name: string };
  section: { id: string; name: string } | null;
  title: string;
  description: string | null;
  link: string | null;
  attachments: Attachment[];
  postedBy: { fullName: string };
  createdAt: string;
}

export interface PostingOptions {
  onBehalf: boolean;
  classes: { id: string; name: string; subjects: { id: string; name: string; sectionIds: string[] }[]; sections: { id: string; name: string }[] }[];
}
