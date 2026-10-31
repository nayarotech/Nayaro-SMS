import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Attachment {
  key: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
}

export type HomeworkStatus = "DONE" | "PARTIAL" | "NOT_DONE";

export const HOMEWORK_STATUS: Record<HomeworkStatus, { label: string; tone: "green" | "amber" | "red" }> = {
  DONE: { label: "Done", tone: "green" },
  PARTIAL: { label: "Partly", tone: "amber" },
  NOT_DONE: { label: "Not done", tone: "red" },
};

export interface Homework {
  id: string;
  section: { id: string; name: string; classId: string; className: string };
  subject: { id: string; name: string };
  teacher: { id: string; fullName: string };
  title: string;
  description: string | null;
  assignedDate: string;
  dueDate: string;
  attachments: Attachment[];
  checked: number;
  students?: number;
  canManage?: boolean;
  createdAt: string;
}

export interface PostingOptions {
  academicYear: { id: string; name: string };
  onBehalf: boolean;
  classes: { id: string; name: string; subjects: { id: string; name: string; sectionIds: string[] }[]; sections: { id: string; name: string }[] }[];
  teachers: { id: string; fullName: string }[];
}

export interface Material {
  id: string;
  class: { id: string; name: string };
  section: { id: string; name: string } | null;
  subject: { id: string; name: string };
  title: string;
  description: string | null;
  link: string | null;
  attachments: Attachment[];
  postedBy: { id: string; fullName: string };
  createdAt: string;
  canManage?: boolean;
}

export const usePostingOptions = () => useQuery({ queryKey: ["homework-options"], queryFn: () => api.get<PostingOptions>("/homework/options"), staleTime: 60_000 });

export function fileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
