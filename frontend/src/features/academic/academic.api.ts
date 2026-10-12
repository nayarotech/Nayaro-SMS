import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  enrollmentCount?: number;
}

export interface Section {
  id: string;
  name: string;
  capacity: number | null;
  room: string | null;
  studentCount: number;
  classTeacher: { id: string; fullName: string } | null;
}

export interface SchoolClass {
  id: string;
  name: string;
  order: number;
  sections: Section[];
  subjects: { id: string; name: string; code: string | null; isOptional: boolean; optionGroup: string | null }[];
}

export interface Subject {
  id: string;
  name: string;
  code: string | null;
  hasPractical: boolean;
  classes: { id: string; name: string }[];
}

export interface Teacher {
  id: string;
  fullName: string;
  staffProfile: { designation: string | null } | null;
}

export interface Period {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  order: number;
  isBreak: boolean;
}

export const useAcademicYears = () => useQuery({ queryKey: ["academic-years"], queryFn: () => api.get<AcademicYear[]>("/academic-years") });
export const useClasses = () => useQuery({ queryKey: ["classes"], queryFn: () => api.get<SchoolClass[]>("/classes") });
export const useSubjects = () => useQuery({ queryKey: ["subjects"], queryFn: () => api.get<Subject[]>("/subjects") });
export const useTeachers = () => useQuery({ queryKey: ["teachers"], queryFn: () => api.get<Teacher[]>("/assignments/teachers") });
export const usePeriods = () => useQuery({ queryKey: ["periods"], queryFn: () => api.get<Period[]>("/timetable/periods") });
