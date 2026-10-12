import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Card, EmptyState, PageHeader, Spinner } from "@/components/ui/display";
import { Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/forms";
import { useAcademicYears, useTeachers } from "./academic.api";

interface AssignmentData {
  academicYear: { id: string; name: string };
  classes: {
    id: string;
    name: string;
    sections: {
      id: string;
      name: string;
      classTeacher: { id: string; fullName: string } | null;
      subjects: { subjectId: string; subjectName: string; isOptional: boolean; teachers: { assignmentId: string; id: string; fullName: string }[] }[];
    }[];
  }[];
}

export function AssignmentsPage() {
  const { data: years = [] } = useAcademicYears();
  const [yearId, setYearId] = useState("");
  const { data: teachers = [] } = useTeachers();
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const editable = can("assignment.manage");

  const { data, isLoading, error } = useQuery({
    queryKey: ["assignments", yearId],
    queryFn: () => api.get<AssignmentData>("/assignments", { academicYearId: yearId }),
    retry: false,
  });

  const mutate = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: () => Promise.all(["assignments", "classes", "dashboard"].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const academicYearId = data?.academicYear.id;
  const setClassTeacher = (sectionId: string, teacherId: string) =>
    mutate.mutate(() => api.put("/assignments/class-teacher", { academicYearId, sectionId, teacherId: teacherId || null }));
  const addSubjectTeacher = (sectionId: string, subjectId: string, teacherId: string) =>
    mutate.mutate(() => api.post("/assignments/subject-teacher", { academicYearId, sectionId, subjectId, teacherId }));
  const removeSubjectTeacher = (assignmentId: string) => mutate.mutate(() => api.delete(`/assignments/subject-teacher/${assignmentId}`));

  if (error instanceof ApiError) {
    return (
      <div>
        <PageHeader title="Teacher assignments" />
        <Card>
          <EmptyState icon={<ClipboardList className="size-8" />} title="Set up an academic year first" description={error.message} action={<Link className="text-sm text-brand hover:underline" to="/academic/years">Go to academic years</Link>} />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Teacher assignments"
        description="One class teacher per section, and the teachers for each subject. Subject teachers can only enter marks and homework for what they are assigned."
        actions={
          <Select value={yearId || academicYearId || ""} onChange={(e) => setYearId(e.target.value)} className="w-40">
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name} {y.isCurrent ? "(current)" : ""}
              </option>
            ))}
          </Select>
        }
      />

      {isLoading || !data ? (
        <Spinner />
      ) : data.classes.length === 0 ? (
        <Card>
          <EmptyState title="No classes yet" action={<Link className="text-sm text-brand hover:underline" to="/academic/classes">Add classes</Link>} />
        </Card>
      ) : (
        <div className="space-y-6">
          {data.classes.map((schoolClass) => (
            <div key={schoolClass.id}>
              <h2 className="mb-2 text-sm font-semibold text-slate-900">{schoolClass.name}</h2>
              <div className="grid gap-4 xl:grid-cols-2">
                {schoolClass.sections.map((section) => (
                  <Card key={section.id} padded={false}>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                      <span className="font-medium text-slate-900">
                        {schoolClass.name} {section.name}
                      </span>
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        Class teacher
                        <Select value={section.classTeacher?.id ?? ""} disabled={!editable} onChange={(e) => setClassTeacher(section.id, e.target.value)} className="h-8 w-48">
                          <option value="">— None —</option>
                          {teachers.map((t) => (
                            <option key={t.id} value={t.id}>{t.fullName}</option>
                          ))}
                        </Select>
                      </label>
                    </div>
                    {section.subjects.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-slate-400">
                        No subjects for this class. <Link className="text-brand hover:underline" to="/academic/classes">Choose subjects</Link>
                      </p>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {section.subjects.map((subject) => (
                          <li key={subject.subjectId} className="flex flex-wrap items-center gap-2 px-4 py-2">
                            <span className="w-36 shrink-0 text-sm text-slate-700">{subject.subjectName}</span>
                            <div className="flex flex-1 flex-wrap items-center gap-1.5">
                              {subject.teachers.map((t) => (
                                <span key={t.assignmentId} className="inline-flex items-center gap-1 rounded-md bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
                                  {t.fullName}
                                  {editable && (
                                    <button onClick={() => removeSubjectTeacher(t.assignmentId)} aria-label={`Remove ${t.fullName}`}>
                                      <X className="size-3" />
                                    </button>
                                  )}
                                </span>
                              ))}
                              {subject.teachers.length === 0 && <span className="text-xs text-amber-600">Not assigned</span>}
                              {editable && (
                                <select
                                  className="h-7 rounded-md border border-dashed border-slate-300 bg-white px-1.5 text-xs text-slate-500"
                                  value=""
                                  onChange={(e) => e.target.value && addSubjectTeacher(section.id, subject.subjectId, e.target.value)}
                                >
                                  <option value="">+ teacher</option>
                                  {teachers
                                    .filter((t) => !subject.teachers.some((st) => st.id === t.id))
                                    .map((t) => (
                                      <option key={t.id} value={t.id}>{t.fullName}</option>
                                    ))}
                                </select>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
