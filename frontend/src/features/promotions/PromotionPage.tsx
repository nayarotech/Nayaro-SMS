import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CalendarPlus, CheckCheck, Copy, GraduationCap, TriangleAlert, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { Badge, Card, EmptyState, PageHeader, Spinner } from "@/components/ui/display";
import { Checkbox, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/forms";
import { useAcademicYears } from "../academic/academic.api";
import { OUTCOME, type Outcome, type PromotionOverview, type PromotionPreview, type PromotionStudent, type RollNumbering } from "./promotions.api";

/**
 * Year-end promotion, one class at a time: see each student's final result and
 * attendance with a suggestion, adjust, and confirm. Runs can be undone until
 * the new year is in use.
 */
export function PromotionPage() {
  const [params, setParams] = useSearchParams();
  const { data: years = [] } = useAcademicYears();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const setParam = (changes: Record<string, string>) => setParams(Object.fromEntries(Object.entries({ from, to, class: params.get("class") ?? "", ...changes }).filter(([, v]) => v)));

  const { data: overview, error } = useQuery({
    queryKey: ["promotions", from, to],
    queryFn: () => api.get<PromotionOverview>("/promotions", { fromYearId: from || undefined, toYearId: to || undefined }),
    retry: false,
  });
  const classId = params.get("class") || overview?.classes.find((c) => c.pending > 0)?.id || overview?.classes[0]?.id || "";

  return (
    <div>
      <PageHeader title="Promotion" description="Move students into the next academic year: promote, detain or graduate them, one class at a time." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={overview?.fromYear.id ?? from} onChange={(e) => setParam({ from: e.target.value, to: "", class: "" })} className="w-40" aria-label="From academic year">
          {years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.isCurrent ? " (current)" : ""}</option>)}
        </Select>
        <ArrowRight className="size-4 text-slate-400" />
        <Select value={overview?.toYear?.id ?? to} onChange={(e) => setParam({ to: e.target.value })} className="w-40" aria-label="To academic year">
          {!overview?.toYear && <option value="">Next year…</option>}
          {years.filter((y) => overview && y.id !== overview.fromYear.id).map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
        </Select>
      </div>

      {error ? (
        <Card><EmptyState title="Can't load promotion" description={errorMessage(error)} /></Card>
      ) : !overview ? (
        <Spinner />
      ) : !overview.toYear ? (
        <Card>
          <EmptyState
            icon={<CalendarPlus className="size-8" />}
            title={`Create the academic year after ${overview.fromYear.name} first`}
            description="Students are promoted into the next academic year, so it needs to exist. You don't have to make it current yet."
            action={<Link to="/academic/years" className="text-sm font-medium text-brand hover:underline">Go to academic years</Link>}
          />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
          <div className="space-y-4">
            <ClassList overview={overview} activeId={classId} onSelect={(id) => setParam({ class: id })} />
            <NewYearSetup overview={overview} />
          </div>
          <div className="min-w-0 space-y-6">
            {classId && <ClassPromotion fromYearId={overview.fromYear.id} toYearId={overview.toYear.id} classId={classId} />}
            <RunHistory overview={overview} />
          </div>
        </div>
      )}
    </div>
  );
}

function ClassList({ overview, activeId, onSelect }: { overview: PromotionOverview; activeId: string; onSelect: (id: string) => void }) {
  return (
    <Card title={`${overview.fromYear.name} → ${overview.toYear?.name}`} padded={false}>
      <ul className="divide-y divide-slate-100">
        {overview.classes.map((c) => {
          const done = c.total > 0 && c.pending === 0;
          return (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c.id)}
                className={cn("flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-slate-50", c.id === activeId && "bg-brand-soft/60")}
              >
                <span className={cn("font-medium", c.id === activeId ? "text-brand" : "text-slate-800")}>{c.name}</span>
                {c.total === 0 ? (
                  <span className="text-xs text-slate-400">No students</span>
                ) : done ? (
                  <Badge tone="green">Done</Badge>
                ) : (
                  <span className="text-xs text-slate-500 tabular-nums">{c.pending} of {c.total} to decide</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function NewYearSetup({ overview }: { overview: PromotionOverview }) {
  const { can } = useAuth();
  const toast = useToast();
  const copy = useMutation({
    mutationFn: () => api.post<{ copied: { classTeachers: number; subjectTeachers: number; timetable: number } }>("/assignments/copy", { fromYearId: overview.fromYear.id, toYearId: overview.toYear!.id }),
    onSuccess: ({ copied }) => toast.success(`Copied ${copied.classTeachers} class teachers, ${copied.subjectTeachers} subject teachers and ${copied.timetable} timetable periods`),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!can("assignment.manage") || !overview.toYear) return null;

  return (
    <Card title="New year setup">
      <p className="text-sm text-slate-600">Start {overview.toYear.name} with this year's class teachers, subject teachers and timetable. Anything already set for {overview.toYear.name} is kept.</p>
      <Button size="sm" variant="secondary" className="mt-3" icon={<Copy className="size-3.5" />} loading={copy.isPending} onClick={() => copy.mutate()}>
        Copy to {overview.toYear.name}
      </Button>
    </Card>
  );
}

interface Choice {
  outcome: Outcome | "";
  toSectionId: string;
  reason: string;
}

function ClassPromotion({ fromYearId, toYearId, classId }: { fromYearId: string; toYearId: string; classId: string }) {
  const [examId, setExamId] = useState("");
  const { data: exams } = useQuery({
    queryKey: ["exams", fromYearId],
    queryFn: () => api.get<{ exams: { id: string; name: string }[] }>("/exams", { academicYearId: fromYearId }),
  });
  const { data, isLoading, error } = useQuery({
    queryKey: ["promotion-preview", fromYearId, toYearId, classId, examId],
    queryFn: () => api.get<PromotionPreview>("/promotions/preview", { fromYearId, toYearId, classId, examId: examId || undefined }),
    retry: false,
  });

  if (isLoading) return <Spinner />;
  if (error || !data) return <Card><EmptyState title="Can't load this class" description={error ? errorMessage(error) : undefined} /></Card>;

  return (
    <Card
      title={`${data.class.name} → ${data.nextClass?.name ?? "graduation"}`}
      actions={
        <Select value={data.exam?.id ?? ""} onChange={(e) => setExamId(e.target.value)} className="h-8 w-56 text-xs" aria-label="Exam the suggestions are based on">
          {!data.exam && <option value="">No exam</option>}
          {exams?.exams.map((exam) => <option key={exam.id} value={exam.id}>Based on: {exam.name}</option>)}
        </Select>
      }
      padded={false}
    >
      {/* Remount when the class or exam changes so choices start from the new suggestions */}
      <DecisionTable key={`${classId}:${data.exam?.id}:${data.students.filter((s) => s.decided).length}`} preview={data} />
    </Card>
  );
}

function DecisionTable({ preview }: { preview: PromotionPreview }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const open = preview.students.filter((s) => !s.decided && !s.inTargetYear);
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(open.map((s) => [s.studentId, { outcome: s.suggestion.outcome ?? "", toSectionId: "", reason: "" }])),
  );
  const [rollNumbers, setRollNumbers] = useState<RollNumbering>("name");
  const [notifyParents, setNotifyParents] = useState(true);
  const set = (studentId: string, change: Partial<Choice>) => setChoices((c) => ({ ...c, [studentId]: { ...c[studentId], ...change } }));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (studentId: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  /** Give many students the same outcome at once; each one can still be changed afterwards. */
  const setOutcome = (studentIds: string[], outcome: Outcome | "") =>
    setChoices((c) => ({ ...c, ...Object.fromEntries(studentIds.map((id) => [id, { ...c[id], outcome, toSectionId: "" }])) }));

  const chosen = open.filter((s) => choices[s.studentId]?.outcome);
  const counts = useMemo(() => {
    const result: Partial<Record<Outcome, number>> = {};
    for (const s of chosen) result[choices[s.studentId].outcome as Outcome] = (result[choices[s.studentId].outcome as Outcome] ?? 0) + 1;
    return result;
  }, [chosen, choices]);
  const overridden = chosen.filter((s) => s.suggestion.outcome && choices[s.studentId].outcome !== s.suggestion.outcome).length;

  const run = useMutation({
    mutationFn: () =>
      api.post("/promotions", {
        fromYearId: preview.fromYear.id,
        toYearId: preview.toYear!.id,
        classId: preview.class.id,
        examId: preview.exam?.id,
        rollNumbers,
        notifyParents,
        decisions: chosen.map((s) => {
          const c = choices[s.studentId];
          return { studentId: s.studentId, outcome: c.outcome, toSectionId: c.toSectionId || null, reason: c.reason || null };
        }),
      }),
    onSuccess: async () => {
      toast.success(`${chosen.length} students moved to ${preview.toYear!.name}`);
      await Promise.all(["promotions", "promotion-preview", "students", "classes"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const targetSections = (outcome: Outcome | "") => (outcome === "PROMOTE" ? preview.nextClass?.sections : outcome === "DETAIN" ? preview.class.sections : undefined);
  const outcomes: Outcome[] = preview.nextClass ? ["PROMOTE", "DETAIN", "LEAVE"] : ["GRADUATE", "DETAIN", "LEAVE"];
  const moveUp = outcomes[0];
  const allSelected = open.length > 0 && open.every((s) => selected.has(s.studentId));

  if (!preview.students.length) return <EmptyState icon={<GraduationCap className="size-8" />} title={`No students in ${preview.class.name} in ${preview.fromYear.name}`} />;

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100 px-5 py-3 text-sm text-slate-600">
        <span>
          {preview.rule.basis === "finalExam" ? "Suggestions: pass → promote, fail → detain" : "Suggestions: promote everyone"}
          {preview.rule.minAttendancePercent > 0 && `, attendance below ${preview.rule.minAttendancePercent}% → detain`}
          . <Link to="/settings" className="text-brand hover:underline">Change</Link>
        </span>
        {preview.exam && !preview.exam.published && (
          <span className="inline-flex items-center gap-1 text-amber-700">
            <TriangleAlert className="size-4" /> {preview.exam.name} results aren't published yet
          </span>
        )}
        {open.length > 0 && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<CheckCheck className="size-4" />} onClick={() => setOutcome(open.map((s) => s.studentId), moveUp)}>
              {OUTCOME[moveUp].label} everyone
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Undo2 className="size-4" />}
              onClick={() => setChoices(Object.fromEntries(open.map((s) => [s.studentId, { outcome: s.suggestion.outcome ?? "", toSectionId: "", reason: "" }])))}
            >
              Reset to suggestions
            </Button>
          </div>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-brand/20 bg-brand-soft/60 px-5 py-2.5 text-sm">
          <span className="font-medium text-slate-900">{selected.size} selected</span>
          <span className="text-slate-500">· set to</span>
          {outcomes.map((o) => (
            <Button key={o} size="sm" variant="secondary" onClick={() => (setOutcome([...selected], o), setSelected(new Set()))}>
              {OUTCOME[o].label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => (setOutcome([...selected], ""), setSelected(new Set()))}>Decide later</Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>Clear selection</Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="w-10 py-2 pl-5 pr-1">
                {open.length > 0 && (
                  <input
                    type="checkbox"
                    className="size-4 accent-brand"
                    aria-label="Select all students"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = selected.size > 0 && !allSelected;
                    }}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(open.map((s) => s.studentId)))}
                  />
                )}
              </th>
              <th className="px-3 py-2">Roll</th>
              <th className="px-3 py-2">Student</th>
              <th className="px-3 py-2">Result</th>
              <th className="px-3 py-2 text-right">Attendance</th>
              <th className="px-3 py-2">Suggested</th>
              <th className="px-3 py-2">Decision</th>
              <th className="px-3 py-2">Section in {preview.toYear?.name}</th>
              <th className="px-3 py-2">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {preview.students.map((s) => (
              <StudentRow
                key={s.studentId}
                student={s}
                preview={preview}
                choice={choices[s.studentId]}
                outcomes={outcomes}
                sections={targetSections(choices[s.studentId]?.outcome ?? "")}
                onChange={(c) => set(s.studentId, c)}
                selected={selected.has(s.studentId)}
                onToggle={() => toggle(s.studentId)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {open.length > 0 && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white px-5 py-3">
          <div className="flex flex-wrap gap-1.5 text-sm">
            {(Object.keys(counts) as Outcome[]).map((o) => <Badge key={o} tone={OUTCOME[o].tone}>{counts[o]} {OUTCOME[o].label.toLowerCase()}</Badge>)}
            {open.length - chosen.length > 0 && <Badge tone="amber">{open.length - chosen.length} undecided</Badge>}
            {overridden > 0 && <span className="text-xs text-slate-500">{overridden} differ from the suggestion</span>}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <Select value={rollNumbers} onChange={(e) => setRollNumbers(e.target.value as RollNumbering)} className="h-8 w-48 text-xs" aria-label="Roll numbers in the new year">
              <option value="name">Roll numbers by name</option>
              <option value="rank">Roll numbers by result</option>
              <option value="keep">Keep last year's roll numbers</option>
            </Select>
            <Checkbox label="Notify parents" checked={notifyParents} onChange={(e) => setNotifyParents(e.target.checked)} />
            <Button
              size="sm"
              disabled={!chosen.length}
              loading={run.isPending}
              onClick={() => confirm(`Confirm for ${chosen.length} students? Their ${preview.toYear!.name} class and roll number will be set${notifyParents ? " and parents notified" : ""}. You can undo this until the new year is in use.`) && run.mutate()}
            >
              Confirm for {chosen.length} students
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function StudentRow({ student: s, preview, choice, outcomes, sections, onChange, selected, onToggle }: {
  selected: boolean;
  onToggle: () => void;
  student: PromotionStudent;
  preview: PromotionPreview;
  choice?: Choice;
  outcomes: Outcome[];
  sections?: { id: string; name: string }[];
  onChange: (change: Partial<Choice>) => void;
}) {
  const locked = Boolean(s.decided || s.inTargetYear);
  const autoSection = sections && (sections.find((x) => x.name === s.section.name) ?? sections[0]);
  const lowAttendance = preview.rule.minAttendancePercent > 0 && s.attendancePercent !== null && s.attendancePercent < preview.rule.minAttendancePercent;

  return (
    <tr className={cn(locked && "bg-slate-50/60 text-slate-500", selected && "bg-brand-soft/40")}>
      <td className="py-2 pl-5 pr-1">
        {!locked && <input type="checkbox" className="size-4 accent-brand" checked={selected} onChange={onToggle} aria-label={`Select ${s.name}`} />}
      </td>
      <td className="px-3 py-2 tabular-nums">{s.section.name}-{s.rollNo ?? "—"}</td>
      <td className="px-3 py-2">
        <Link to={`/students/${s.studentId}`} className="whitespace-nowrap font-medium text-slate-900 hover:text-brand">{s.name}</Link>
        <span className="block text-xs text-slate-500">{s.admissionNo}</span>
      </td>
      <td className="px-3 py-2">
        {s.result && s.result.grade !== "—" ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone={s.result.result === "PASS" ? "green" : s.result.result === "FAIL" ? "red" : "amber"}>{s.result.grade}</Badge>
            <span className="tabular-nums">{s.result.gpa ?? "—"}</span>
            {s.result.failedSubjects.length > 0 && <span className="text-xs text-red-600">{s.result.failedSubjects.join(", ")}</span>}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className={cn("px-3 py-2 text-right tabular-nums", lowAttendance && "font-medium text-red-600")}>{s.attendancePercent !== null ? `${s.attendancePercent}%` : "—"}</td>
      <td className="px-3 py-2">
        {s.suggestion.outcome ? <Badge tone={OUTCOME[s.suggestion.outcome].tone}>{OUTCOME[s.suggestion.outcome].label}</Badge> : <Badge tone="amber">Decide</Badge>}
        <span className="block max-w-48 text-xs text-slate-500">{s.suggestion.reason}</span>
      </td>
      {locked ? (
        <td colSpan={3} className="px-3 py-2">
          {s.decided ? (
            <span className="flex items-center gap-2">
              <Badge tone={OUTCOME[s.decided.outcome].tone}>{OUTCOME[s.decided.outcome].label}</Badge>
              {s.inTargetYear && <span className="text-xs">{s.inTargetYear.classSection}, roll {s.inTargetYear.rollNo ?? "—"}</span>}
              {s.decided.reason && <span className="text-xs">· {s.decided.reason}</span>}
            </span>
          ) : (
            <span className="text-xs">Already in {s.inTargetYear!.classSection} for {preview.toYear?.name}</span>
          )}
        </td>
      ) : (
        <>
          <td className="px-3 py-2">
            <Select value={choice?.outcome ?? ""} onChange={(e) => onChange({ outcome: e.target.value as Outcome | "", toSectionId: "" })} className="h-8 w-36 text-sm" aria-label={`Decision for ${s.name}`}>
              <option value="">Decide later</option>
              {outcomes.map((o) => <option key={o} value={o}>{OUTCOME[o].label}</option>)}
            </Select>
          </td>
          <td className="px-3 py-2">
            {sections ? (
              <Select value={choice?.toSectionId ?? ""} onChange={(e) => onChange({ toSectionId: e.target.value })} className="h-8 w-32 text-sm" aria-label={`Section for ${s.name}`}>
                <option value="">{choice?.outcome === "PROMOTE" ? preview.nextClass?.name : preview.class.name} {autoSection?.name}</option>
                {sections.filter((x) => x.id !== autoSection?.id).map((x) => <option key={x.id} value={x.id}>Section {x.name}</option>)}
              </Select>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </td>
          <td className="px-3 py-2">
            {choice?.outcome && choice.outcome !== "PROMOTE" && choice.outcome !== "GRADUATE" ? (
              <Input value={choice.reason} onChange={(e) => onChange({ reason: e.target.value })} className="h-8 w-44 text-sm" placeholder={choice.outcome === "LEAVE" ? "e.g. Moved to Pokhara" : "e.g. Failed Maths"} aria-label={`Reason for ${s.name}`} maxLength={500} />
            ) : null}
          </td>
        </>
      )}
    </tr>
  );
}

function RunHistory({ overview }: { overview: PromotionOverview }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const undo = useMutation({
    mutationFn: (runId: string) => api.post(`/promotions/${runId}/undo`),
    onSuccess: async () => {
      toast.success("Promotion undone");
      await Promise.all(["promotions", "promotion-preview", "students", "classes"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!overview.runs.length) return null;

  return (
    <Card title="Done so far" padded={false}>
      <ul className="divide-y divide-slate-100">
        {overview.runs.map((run) => (
          <li key={run.id} className={cn("flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm", run.undoneAt && "text-slate-400")}>
            <div>
              <p className="font-medium text-slate-900">{run.className} → {run.toYear}</p>
              <p className="text-xs text-slate-500">
                {new Date(run.createdAt).toLocaleString()} {run.createdBy && `· ${run.createdBy}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(Object.keys(run.counts) as Outcome[]).map((o) => run.counts[o] > 0 && <Badge key={o} tone={run.undoneAt ? "gray" : OUTCOME[o].tone}>{run.counts[o]} {OUTCOME[o].label.toLowerCase()}</Badge>)}
              {run.undoneAt ? (
                <Badge>Undone</Badge>
              ) : (
                <Button size="sm" variant="ghost" icon={<Undo2 className="size-3.5" />} loading={undo.isPending && undo.variables === run.id} onClick={() => confirm(`Undo the ${run.className} promotion? Their ${run.toYear} enrollments are removed and they go back to undecided.`) && undo.mutate(run.id)}>
                  Undo
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
