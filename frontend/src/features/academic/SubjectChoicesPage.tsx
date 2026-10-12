import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { Badge, Card, EmptyState, PageHeader, Spinner } from "@/components/ui/display";
import { Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/forms";
import { useClasses } from "./academic.api";

interface SubjectChoices {
  academicYear: { id: string; name: string };
  class: { id: string; name: string };
  groups: { name: string; subjects: { id: string; name: string }[] }[];
  students: { studentId: string; name: string; section: string; rollNo: number | null; choices: Record<string, string | null> }[];
}

/**
 * Which optional subject each student takes (e.g. Grade 9–10: Computer or Account).
 * Mark sheets of an optional subject list only the students who chose it.
 */
export function SubjectChoicesPage() {
  const { data: classes = [] } = useClasses();
  const [params, setParams] = useSearchParams();
  const withOptional = classes.filter((c) => c.subjects.some((s) => s.isOptional));
  const classId = params.get("class") || withOptional[0]?.id || "";
  const sectionId = params.get("section") ?? "";
  const schoolClass = classes.find((c) => c.id === classId);

  const { data, isLoading, error } = useQuery({
    queryKey: ["subject-choices", classId, sectionId],
    queryFn: () => api.get<SubjectChoices>(`/classes/${classId}/subject-choices`, { sectionId: sectionId || undefined }),
    enabled: Boolean(classId),
  });

  return (
    <div>
      <PageHeader
        title="Optional subjects"
        description="Choose which optional subject each student takes. Each mark sheet then shows only the students who chose that subject."
      />
      {classes.length > 0 && withOptional.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ListChecks className="size-8" />}
            title="No class has optional subjects"
            description="Mark subjects as optional (with a group like Optional I) under Academic setup → Classes."
            action={<Link to="/academic/classes" className="text-sm font-medium text-brand hover:underline">Go to classes</Link>}
          />
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Select value={classId} onChange={(e) => setParams({ class: e.target.value })} className="w-40" aria-label="Class">
              {withOptional.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select value={sectionId} onChange={(e) => setParams({ class: classId, ...(e.target.value && { section: e.target.value }) })} className="w-40" aria-label="Section">
              <option value="">All sections</option>
              {schoolClass?.sections.map((s) => <option key={s.id} value={s.id}>Section {s.name}</option>)}
            </Select>
          </div>
          {isLoading ? <Spinner /> : error || !data ? <Card><EmptyState title="Can't load" description={error ? errorMessage(error) : undefined} /></Card> : <ChoiceTable key={`${classId}:${sectionId}`} data={data} />}
        </>
      )}
    </div>
  );
}

function ChoiceTable({ data }: { data: SubjectChoices }) {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const editable = can("student.edit");
  const [choices, setChoices] = useState(() => Object.fromEntries(data.students.map((s) => [s.studentId, { ...s.choices }])));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const original = Object.fromEntries(data.students.map((s) => [s.studentId, s.choices]));
  const changes = data.students.flatMap((s) =>
    data.groups.filter((g) => choices[s.studentId][g.name] !== original[s.studentId][g.name]).map((g) => ({ studentId: s.studentId, group: g.name, subjectId: choices[s.studentId][g.name] })),
  );
  const notChosen = data.students.filter((s) => data.groups.some((g) => !choices[s.studentId][g.name])).length;
  const allSelected = data.students.length > 0 && data.students.every((s) => selected.has(s.studentId));

  const setChoice = (studentIds: string[], group: string, subjectId: string | null) =>
    setChoices((c) => ({ ...c, ...Object.fromEntries(studentIds.map((id) => [id, { ...c[id], [group]: subjectId }])) }));

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/classes/${data.class.id}/subject-choices`, { academicYearId: data.academicYear.id, choices: changes });
      toast.success(`Saved ${changes.length} ${changes.length === 1 ? "choice" : "choices"}`);
      await queryClient.invalidateQueries({ queryKey: ["subject-choices"] });
      await queryClient.invalidateQueries({ queryKey: ["mark-sheets"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (!data.students.length) return <Card><EmptyState title={`No students in ${data.class.name}`} /></Card>;

  return (
    <Card
      padded={false}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {data.class.name} · {data.academicYear.name}
          {data.groups.map((g) => <Badge key={g.name} tone="amber">{g.name}: {g.subjects.map((s) => s.name).join(" / ")}</Badge>)}
        </span>
      }
      actions={notChosen > 0 ? <Badge tone="red">{notChosen} not chosen yet</Badge> : <Badge tone="green">Everyone has chosen</Badge>}
    >
      {editable && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-brand/20 bg-brand-soft/60 px-5 py-2.5 text-sm">
          <span className="font-medium text-slate-900">{selected.size} selected</span>
          {data.groups.map((g) => (
            <span key={g.name} className="flex flex-wrap items-center gap-1.5">
              <span className="text-slate-500">· {g.name}:</span>
              {g.subjects.map((subject) => (
                <Button key={subject.id} size="sm" variant="secondary" onClick={() => (setChoice([...selected], g.name, subject.id), setSelected(new Set()))}>
                  {subject.name}
                </Button>
              ))}
            </span>
          ))}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>Clear selection</Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              {editable && (
                <th className="w-10 py-2 pl-5 pr-1">
                  <input
                    type="checkbox"
                    className="size-4 accent-brand"
                    aria-label="Select all students"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = selected.size > 0 && !allSelected;
                    }}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(data.students.map((s) => s.studentId)))}
                  />
                </th>
              )}
              <th className="px-3 py-2">Roll</th>
              <th className="px-3 py-2">Student</th>
              {data.groups.map((g) => <th key={g.name} className="px-3 py-2">{g.name}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.students.map((s) => (
              <tr key={s.studentId} className={cn(selected.has(s.studentId) && "bg-brand-soft/40")}>
                {editable && (
                  <td className="py-2 pl-5 pr-1">
                    <input
                      type="checkbox"
                      className="size-4 accent-brand"
                      aria-label={`Select ${s.name}`}
                      checked={selected.has(s.studentId)}
                      onChange={() => setSelected((current) => {
                        const next = new Set(current);
                        if (next.has(s.studentId)) next.delete(s.studentId);
                        else next.add(s.studentId);
                        return next;
                      })}
                    />
                  </td>
                )}
                <td className="px-3 py-2 tabular-nums text-slate-600">{s.section}-{s.rollNo ?? "—"}</td>
                <td className="px-3 py-2">
                  <Link to={`/students/${s.studentId}`} className="whitespace-nowrap font-medium text-slate-900 hover:text-brand">{s.name}</Link>
                </td>
                {data.groups.map((g) => {
                  const value = choices[s.studentId][g.name];
                  return (
                    <td key={g.name} className="px-3 py-2">
                      <Select
                        value={value ?? ""}
                        disabled={!editable}
                        onChange={(e) => setChoice([s.studentId], g.name, e.target.value || null)}
                        className={cn("h-9 w-40", !value && "border-amber-300 bg-amber-50")}
                        aria-label={`${g.name} for ${s.name}`}
                      >
                        <option value="">Not chosen</option>
                        {g.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                      </Select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editable && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white px-5 py-3">
          <p className="text-sm text-slate-500">Students who haven't chosen appear on every subject's mark sheet in that group until you choose.</p>
          <Button className="ml-auto" disabled={!changes.length} loading={saving} onClick={() => void save()}>
            {changes.length ? `Save ${changes.length} ${changes.length === 1 ? "change" : "changes"}` : "No changes"}
          </Button>
        </div>
      )}
    </Card>
  );
}
