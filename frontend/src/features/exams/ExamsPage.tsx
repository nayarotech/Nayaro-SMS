import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { GradeBand } from "@grading";
import { Button } from "@/components/ui/Button";
import { DateInput } from "@/components/ui/DateInput";
import { Badge, Card, EmptyState, PageHeader, Spinner } from "@/components/ui/display";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/forms";
import { useFormatDate } from "@/lib/use-format-date";
import { useClasses } from "../academic/academic.api";
import { useExams, useGradingScale, type Exam } from "./exams.api";

/** Exam setup: exams of the year, full/pass marks per class, and the grading scale. */
export function ExamsPage() {
  const { data, isLoading } = useExams();
  const formatDate = useFormatDate();
  const [editing, setEditing] = useState<Exam | "new" | null>(null);
  const [setupFor, setSetupFor] = useState<Exam | null>(null);
  const [copyInto, setCopyInto] = useState<Exam | null>(null);

  if (isLoading || !data) return <Spinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exam setup"
        description={`Academic year ${data.academicYear.name}. Set full and pass marks for each class, then teachers can enter marks.`}
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>New exam</Button>}
      />

      {data.exams.length === 0 ? (
        <Card><EmptyState icon={<ClipboardList className="size-8" />} title="No exams yet" description="Create exams like First Terminal, Second Terminal and Final." /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.exams.map((exam) => {
            const total = exam.sheets.draft + exam.sheets.submitted + exam.sheets.verified + exam.sheets.published;
            return (
              <Card key={exam.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-900">{exam.name}</h2>
                    <p className="text-sm text-slate-500">
                      {exam.startDate ? `${formatDate(exam.startDate)} – ${formatDate(exam.endDate)}` : "Dates not set"} · {exam.classesConfigured} classes set up
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(exam)} aria-label="Edit exam" />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {total === 0 ? (
                    <Badge>No marks yet</Badge>
                  ) : (
                    <>
                      {exam.sheets.draft > 0 && <Badge>{exam.sheets.draft} draft</Badge>}
                      {exam.sheets.submitted > 0 && <Badge tone="amber">{exam.sheets.submitted} submitted</Badge>}
                      {exam.sheets.verified > 0 && <Badge tone="blue">{exam.sheets.verified} verified</Badge>}
                      {exam.sheets.published > 0 && <Badge tone="green">{exam.sheets.published} published</Badge>}
                    </>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setSetupFor(exam)}>Subjects & marks per class</Button>
                  {data.exams.length > 1 && (
                    <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={() => setCopyInto(exam)}>Copy setup from another exam</Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <GradingScaleCard />
      {editing && <ExamModal exam={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {setupFor && <ClassSubjectsModal exam={setupFor} onClose={() => setSetupFor(null)} />}
      {copyInto && <CopyExamModal exam={copyInto} exams={data.exams.filter((e) => e.id !== copyInto.id)} onClose={() => setCopyInto(null)} />}
    </div>
  );
}

function ExamModal({ exam, onClose }: { exam: Exam | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ name: exam?.name ?? "", startDate: exam?.startDate ?? "", endDate: exam?.endDate ?? "" });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const body = { name: form.name, startDate: form.startDate || null, endDate: form.endDate || null };
      return exam ? api.patch(`/exams/${exam.id}`, body) : api.post("/exams", body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["exams"] });
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/exams/${exam!.id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["exams"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={exam ? `Edit ${exam.name}` : "New exam"}
      footer={
        <>
          {exam && <Button variant="ghost" className="mr-auto" icon={<Trash2 className="size-4" />} onClick={() => confirm("Delete this exam?") && remove.mutate()}>Delete</Button>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!form.name.trim()} loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <Field label="Name" required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. First Terminal Examination" autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts">
            <DateInput value={form.startDate} onChange={(startDate) => setForm({ ...form, startDate })} />
          </Field>
          <Field label="Ends" hint="Report cards count attendance up to this date">
            <DateInput value={form.endDate} onChange={(endDate) => setForm({ ...form, endDate })} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/** "Same as First Terminal": copy every class's subjects and marks from another exam. */
function CopyExamModal({ exam, exams, onClose }: { exam: Exam; exams: Exam[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [fromExamId, setFromExamId] = useState(exams.find((e) => e.classesConfigured > 0)?.id ?? exams[0]?.id ?? "");
  const copy = useMutation({
    mutationFn: () => api.post<{ copied: Record<string, number> }>(`/exams/${exam.id}/copy-from`, { fromExamId }),
    onSuccess: async ({ copied }) => {
      toast.success(`Copied to ${Object.keys(copied).length} classes`);
      await queryClient.invalidateQueries({ queryKey: ["exams"] });
      await queryClient.invalidateQueries({ queryKey: ["exam-subjects"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Copy setup into ${exam.name}`}
      description="Every class gets the same subjects, full marks, pass marks and credit hours as the exam you choose. Settings already in this exam for those subjects are replaced."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!fromExamId} loading={copy.isPending} onClick={() => copy.mutate()}>Copy</Button>
        </>
      }
    >
      <Field label="Copy from">
        <Select value={fromExamId} onChange={(e) => setFromExamId(e.target.value)}>
          {exams.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.classesConfigured} classes set up)</option>)}
        </Select>
      </Field>
    </Modal>
  );
}

interface SubjectRow {
  subjectId: string;
  subjectName: string;
  isOptional: boolean;
  included: boolean;
  theoryFullMarks: number;
  theoryPassMarks: number;
  practicalFullMarks: number;
  practicalPassMarks: number;
  creditHours: number;
  examDate: string | null;
}

/** Which subjects each class sits, with full marks, pass marks and credit hours. */
function ClassSubjectsModal({ exam, onClose }: { exam: Exam; onClose: () => void }) {
  const { data: classes = [] } = useClasses();
  const [classId, setClassId] = useState("");
  const selected = classId || classes[0]?.id || "";

  return (
    <Modal open onClose={onClose} size="xl" title={`${exam.name}: subjects & marks`} description="Pick a class, then set what each subject is marked out of.">
      <div className="mb-4 flex flex-wrap gap-1">
        {classes.map((c) => (
          <button key={c.id} onClick={() => setClassId(c.id)} className={cn("rounded-full border px-3 py-1 text-sm", c.id === selected ? "border-brand bg-brand-soft text-brand" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
            {c.name}
          </button>
        ))}
      </div>
      {selected && <ClassSubjectsEditor key={selected} examId={exam.id} classId={selected} />}
    </Modal>
  );
}

function ClassSubjectsEditor({ examId, classId }: { examId: string; classId: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ["exam-subjects", examId, classId], queryFn: () => api.get<SubjectRow[]>(`/exams/${examId}/classes/${classId}/subjects`) });
  if (!data) return <Spinner />;
  return <SubjectTable key={JSON.stringify(data)} rows={data} examId={examId} classId={classId} onSave={async (rows) => {
    try {
      await api.put(`/exams/${examId}/classes/${classId}/subjects`, {
        subjects: rows.filter((r) => r.included).map(({ subjectId, theoryFullMarks, theoryPassMarks, practicalFullMarks, practicalPassMarks, creditHours, examDate }) => ({ subjectId, theoryFullMarks, theoryPassMarks, practicalFullMarks, practicalPassMarks, creditHours, examDate })),
      });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["exam-subjects", examId, classId] }), queryClient.invalidateQueries({ queryKey: ["exams"] })]);
      toast.success("Saved");
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  }} />;
}

function SubjectTable({ rows: initial, examId, classId, onSave }: { rows: SubjectRow[]; examId: string; classId: string; onSave: (rows: SubjectRow[]) => Promise<boolean> }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [copying, setCopying] = useState(false);
  const [fill, setFill] = useState({ theoryFullMarks: "", theoryPassMarks: "", practicalFullMarks: "", practicalPassMarks: "", creditHours: "" });
  const set = (index: number, changes: Partial<SubjectRow>) => setRows((r) => r.map((row, i) => (i === index ? { ...row, ...changes } : row)));
  const num = (value: string) => (value === "" ? 0 : Number(value));
  const allIncluded = rows.every((r) => r.included);

  /** Apply the filled-in values to every ticked subject (practical only where the subject has one). */
  const applyFill = () =>
    setRows((r) =>
      r.map((row) => {
        if (!row.included) return row;
        const next = { ...row };
        for (const key of ["theoryFullMarks", "theoryPassMarks", "creditHours"] as const) if (fill[key] !== "") next[key] = Number(fill[key]);
        if (row.practicalFullMarks > 0) for (const key of ["practicalFullMarks", "practicalPassMarks"] as const) if (fill[key] !== "") next[key] = Number(fill[key]);
        return next;
      }),
    );

  if (!rows.length) return <p className="text-sm text-slate-500">This class has no subjects. Choose them under Academic setup → Classes.</p>;

  const columns = ["theoryFullMarks", "theoryPassMarks", "practicalFullMarks", "practicalPassMarks", "creditHours"] as const;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-slate-500">
              <th className="py-2">
                <label className="flex items-center gap-2 normal-case">
                  <input type="checkbox" className="size-4 accent-brand" checked={allIncluded} onChange={(e) => setRows((r) => r.map((row) => ({ ...row, included: e.target.checked })))} aria-label="Include all subjects" />
                  <span className="text-xs font-medium text-slate-600">All subjects</span>
                </label>
              </th>
              <th className="px-1">Theory full</th>
              <th className="px-1">Theory pass</th>
              <th className="px-1">Practical full</th>
              <th className="px-1">Practical pass</th>
              <th className="px-1">Credit hrs</th>
            </tr>
            <tr className="bg-slate-50">
              <td className="py-2 pr-2">
                <Button size="sm" variant="secondary" onClick={applyFill} disabled={Object.values(fill).every((v) => v === "")}>
                  Apply to all ticked
                </Button>
              </td>
              {columns.map((key) => (
                <td key={key} className="px-1">
                  <Input type="number" min={0} step="0.25" placeholder="All" value={fill[key]} onChange={(e) => setFill({ ...fill, [key]: e.target.value })} className="h-9 w-24 text-xs" aria-label={`Same ${key} for all ticked subjects`} />
                </td>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr key={row.subjectId} className={row.included ? "" : "opacity-50"}>
                <td className="py-2 pr-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="size-4 accent-brand" checked={row.included} onChange={(e) => set(index, { included: e.target.checked })} />
                    <span className="font-medium text-slate-800">{row.subjectName}</span>
                    {row.isOptional && <Badge tone="amber">optional</Badge>}
                  </label>
                </td>
                {columns.map((key) => (
                  <td key={key} className="px-1">
                    <Input type="number" min={0} step="0.25" disabled={!row.included} value={row[key]} onChange={(e) => set(index, { [key]: num(e.target.value) })} className="h-9 w-24" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" icon={<Copy className="size-4" />} onClick={() => setCopying(true)} disabled={!rows.some((r) => r.included)}>
          Save & copy to other classes
        </Button>
        <Button loading={busy} onClick={async () => { setBusy(true); await onSave(rows); setBusy(false); }}>Save this class</Button>
      </div>
      {copying && <CopyToClassesModal examId={examId} classId={classId} onSaveFirst={() => onSave(rows)} onClose={() => setCopying(false)} />}
    </div>
  );
}

/** Pick classes to give the same subjects and marks (only subjects each class studies are copied). */
function CopyToClassesModal({ examId, classId, onSaveFirst, onClose }: { examId: string; classId: string; onSaveFirst: () => Promise<boolean>; onClose: () => void }) {
  const { data: classes = [] } = useClasses();
  const queryClient = useQueryClient();
  const toast = useToast();
  const others = classes.filter((c) => c.id !== classId);
  const [chosen, setChosen] = useState<Set<string>>(new Set(others.map((c) => c.id)));
  const [busy, setBusy] = useState(false);

  const copy = async () => {
    setBusy(true);
    try {
      if (!(await onSaveFirst())) return;
      const { copied } = await api.post<{ copied: Record<string, number> }>(`/exams/${examId}/classes/${classId}/copy`, { toClassIds: [...chosen] });
      const skipped = Object.entries(copied).filter(([, n]) => n === 0).length;
      toast.success(`Copied to ${Object.keys(copied).length - skipped} classes${skipped ? ` (${skipped} share no subjects with this class)` : ""}`);
      await queryClient.invalidateQueries({ queryKey: ["exam-subjects"] });
      await queryClient.invalidateQueries({ queryKey: ["exams"] });
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Copy to other classes"
      description="Each class gets the same full marks, pass marks and credit hours for the subjects it studies. Other subjects in those classes aren't changed."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!chosen.size} loading={busy} onClick={() => void copy()}>Copy to {chosen.size} classes</Button>
        </>
      }
    >
      <label className="mb-2 flex items-center gap-2 border-b border-slate-200 pb-2 text-sm font-medium">
        <input type="checkbox" className="size-4 accent-brand" checked={chosen.size === others.length} onChange={(e) => setChosen(e.target.checked ? new Set(others.map((c) => c.id)) : new Set())} />
        All classes
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {others.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-brand"
              checked={chosen.has(c.id)}
              onChange={(e) => setChosen((current) => {
                const next = new Set(current);
                if (e.target.checked) next.add(c.id);
                else next.delete(c.id);
                return next;
              })}
            />
            {c.name}
          </label>
        ))}
      </div>
    </Modal>
  );
}

/** Edit the percentage → grade → grade point table (NEB by default). */
function GradingScaleCard() {
  const { data } = useGradingScale();
  if (!data) return null;
  return <GradingScaleEditor key={JSON.stringify(data)} initial={data} />;
}

function GradingScaleEditor({ initial }: { initial: GradeBand[] }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [bands, setBands] = useState(initial);
  const dirty = JSON.stringify(bands) !== JSON.stringify(initial);
  const set = (index: number, changes: Partial<GradeBand>) => setBands((b) => b.map((band, i) => (i === index ? { ...band, ...changes } : band)));

  const save = useMutation({
    mutationFn: () => api.put<GradeBand[]>("/exams/grading-scale", { bands }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["grading-scale"] });
      toast.success("Grading scale saved");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card
      title="Grading scale"
      actions={dirty && <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>Save</Button>}
    >
      <p className="-mt-1 mb-3 text-sm text-slate-500">
        Nepal's NEB letter grading is set up by default. A subject is graded <b>NG</b> if the theory or practical part is below its pass marks. GPA is weighted by credit hours.
      </p>
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-slate-500">
              <th className="pr-2">From %</th>
              <th className="px-2">Grade</th>
              <th className="px-2">Grade point</th>
              <th className="px-2">Description</th>
            </tr>
          </thead>
          <tbody>
            {bands.map((band, i) => (
              <tr key={i}>
                <td className="py-1 pr-2"><Input type="number" className="h-8 w-20" value={band.min} onChange={(e) => set(i, { min: Number(e.target.value) })} /></td>
                <td className="px-2"><Input className="h-8 w-16" value={band.grade} onChange={(e) => set(i, { grade: e.target.value })} /></td>
                <td className="px-2"><Input type="number" step="0.1" className="h-8 w-20" value={band.gradePoint} onChange={(e) => set(i, { gradePoint: Number(e.target.value) })} /></td>
                <td className="px-2"><Input className="h-8 w-40" value={band.remark} onChange={(e) => set(i, { remark: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

