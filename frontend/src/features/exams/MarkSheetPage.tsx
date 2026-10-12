import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CheckCircle2, CloudOff, Loader2, Lock, MessageSquareWarning, Send, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useParams } from "react-router";
import { subjectResult, type GradeBand } from "@grading";
import { Button } from "@/components/ui/Button";
import { Badge, Card, Spinner } from "@/components/ui/display";
import { Field, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/forms";
import { SHEET_STATUS, useGradingScale, type MarkRow, type MarkSheet } from "./exams.api";

export function MarkSheetPage() {
  const { examId, sectionId, subjectId } = useParams<{ examId: string; sectionId: string; subjectId: string }>();
  const path = `/exams/${examId}/sheets/${sectionId}/${subjectId}`;
  const { data: sheet, error } = useQuery({ queryKey: ["mark-sheet", path], queryFn: () => api.get<MarkSheet>(path) });
  const { data: bands } = useGradingScale();

  if (error) return <p className="text-slate-500">{errorMessage(error)}</p>;
  if (!sheet || !bands) return <Spinner />;
  return <MarkGrid key={`${sheet.status}:${sheet.access.canEdit}`} sheet={sheet} bands={bands} path={path} />;
}

/** What's typed in each cell (strings, so half-typed numbers like "4." are kept). */
interface RowDraft {
  theory: string;
  practical: string;
  status: MarkRow["status"];
}

const toText = (n: number | null) => (n === null ? "" : String(n));

function parseMark(text: string, full: number): { value: number | null; error: string | null } {
  if (text.trim() === "") return { value: null, error: null };
  const value = Number(text);
  if (!Number.isFinite(value)) return { value: null, error: "Not a number" };
  if (value < 0) return { value: null, error: "Can't be negative" };
  if (value > full) return { value: null, error: `More than ${full}` };
  if (Math.round(value * 100) !== value * 100) return { value: null, error: "Too many decimals" };
  return { value, error: null };
}

type SaveState = "saved" | "saving" | "unsaved" | "error";

function MarkGrid({ sheet, bands, path }: { sheet: MarkSheet; bands: GradeBand[]; path: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { subject } = sheet;
  const hasPractical = subject.practicalFullMarks > 0;
  const editable = sheet.access.canEdit;
  const [returning, setReturning] = useState(false);

  const [rows, setRows] = useState<Record<string, RowDraft>>(() =>
    Object.fromEntries(sheet.students.map((s) => [s.studentId, { theory: toText(s.theory), practical: toText(s.practical), status: s.status }])),
  );
  // Rows changed since they were last saved
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const saveState: SaveState = saving ? "saving" : saveFailed ? "error" : dirty.size ? "unsaved" : "saved";

  const parsed = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(rows).map(([id, row]) => {
          const theory = parseMark(row.theory, subject.theoryFullMarks);
          const practical = hasPractical ? parseMark(row.practical, subject.practicalFullMarks) : { value: null, error: null };
          return [id, { theory, practical, status: row.status }];
        }),
      ),
    [rows, subject, hasPractical],
  );

  const update = (studentId: string, changes: Partial<RowDraft>) => {
    setRows((r) => ({ ...r, [studentId]: { ...r[studentId], ...changes } }));
    setDirty((d) => new Set(d).add(studentId));
    setSaveFailed(false);
  };

  // ─── Autosave (valid changed rows, a moment after typing stops) ───
  const latest = useRef({ dirty, parsed, rows });
  useEffect(() => {
    latest.current = { dirty, parsed, rows };
  }, [dirty, parsed, rows]);

  const save = useCallback(async () => {
    const { dirty: ids, parsed: values, rows: sent } = latest.current;
    const ready = [...ids].filter((id) => !values[id].theory.error && !values[id].practical.error);
    if (!ready.length) return true;
    setSaving(true);
    try {
      await api.put(path, {
        marks: ready.map((id) => ({ studentId: id, theory: values[id].theory.value, practical: values[id].practical.value, status: values[id].status })),
      });
      // A row typed into again while saving stays unsaved
      const now = latest.current.rows;
      setDirty((d) => new Set([...d].filter((id) => !ready.includes(id) || now[id] !== sent[id])));
      return true;
    } catch (e) {
      setSaveFailed(true);
      toast.error(errorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  }, [path, toast]);

  useEffect(() => {
    if (!dirty.size || saving || saveFailed) return;
    const timer = setTimeout(() => void save(), 800);
    return () => clearTimeout(timer);
  }, [rows, dirty, saving, saveFailed, save]);

  // ─── Keyboard navigation ───
  const grid = useRef<HTMLTableSectionElement>(null);
  const focusCell = (row: number, col: number) => {
    const el = grid.current?.querySelector<HTMLInputElement>(`[data-row="${row}"][data-col="${col}"]`);
    if (el) {
      el.focus();
      el.select();
    }
  };
  const columns = hasPractical ? 2 : 1;
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>, row: number, col: number, studentId: string) => {
    const input = e.currentTarget;
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      focusCell(row + 1, col);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusCell(row - 1, col);
    } else if (e.key === "ArrowRight" && input.selectionStart === input.value.length && col < columns - 1) {
      e.preventDefault();
      focusCell(row, col + 1);
    } else if (e.key === "ArrowLeft" && input.selectionStart === 0 && col > 0) {
      e.preventDefault();
      focusCell(row, col - 1);
    } else if (e.key.toLowerCase() === "a" || e.key.toLowerCase() === "m") {
      // Shortcuts: A = absent, M = medical
      e.preventDefault();
      update(studentId, { status: e.key.toLowerCase() === "a" ? "ABSENT" : "MEDICAL", theory: "", practical: "" });
      focusCell(row + 1, col);
    }
  };

  // ─── Live results ───
  const results = useMemo(
    () =>
      Object.fromEntries(
        sheet.students.map((s) => {
          const p = parsed[s.studentId];
          return [s.studentId, subjectResult({ subjectId: subject.id, subjectName: subject.name, ...subject }, { theory: p.theory.value, practical: p.practical.value, status: p.status }, bands)];
        }),
      ),
    [sheet.students, parsed, subject, bands],
  );
  const all = Object.values(results);
  const scored = all.filter((r) => r.percentage !== null && r.outcome !== "ABSENT");
  const stats = {
    entered: all.filter((r) => r.outcome !== "MISSING").length,
    passed: all.filter((r) => r.outcome === "PASS").length,
    failed: all.filter((r) => r.outcome === "FAIL" || r.outcome === "ABSENT").length,
    average: scored.length ? Math.round((scored.reduce((sum, r) => sum + (r.obtained ?? 0), 0) / scored.length) * 10) / 10 : null,
    highest: scored.length ? Math.max(...scored.map((r) => r.obtained ?? 0)) : null,
  };
  const errors = Object.values(parsed).filter((p) => p.theory.error || p.practical.error).length;

  // ─── Workflow ───
  const workflow = useMutation({
    mutationFn: async (action: "submit" | "verify") => {
      if (dirty.size && !(await save())) throw new Error("Fix the marks first");
      return api.post(`${path}/${action}`);
    },
    onSuccess: async (_, action) => {
      toast.success(action === "submit" ? "Submitted for checking" : "Verified");
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["mark-sheet", path] }), queryClient.invalidateQueries({ queryKey: ["mark-sheets"] })]);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="pb-24">
      <Link to={`/exams/marks?exam=${sheet.exam.id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Mark sheets
      </Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {subject.name} · {sheet.section.label}
          </h1>
          <p className="text-sm text-slate-500">
            {sheet.exam.name} · Theory {subject.theoryFullMarks} (pass {subject.theoryPassMarks})
            {hasPractical && ` · Practical ${subject.practicalFullMarks} (pass ${subject.practicalPassMarks})`} · {subject.creditHours} credit hours
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={SHEET_STATUS[sheet.status].tone}>{SHEET_STATUS[sheet.status].label}</Badge>
          {editable && <SaveIndicator state={saveState} />}
          {sheet.access.canReturn && (
            <Button size="sm" variant="secondary" icon={<Undo2 className="size-4" />} onClick={() => setReturning(true)}>
              Send back
            </Button>
          )}
          {sheet.access.canVerify && (
            <Button size="sm" icon={<CheckCircle2 className="size-4" />} loading={workflow.isPending} onClick={() => workflow.mutate("verify")}>
              Verify
            </Button>
          )}
          {sheet.access.canSubmit && (
            <Button size="sm" icon={<Send className="size-4" />} loading={workflow.isPending} disabled={errors > 0} onClick={() => confirm("Submit these marks for checking? You won't be able to change them unless they're sent back.") && workflow.mutate("submit")}>
              Submit
            </Button>
          )}
        </div>
      </div>

      <div className="mb-4 space-y-2">
        {sheet.returnNote && sheet.status === "DRAFT" && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <MessageSquareWarning className="mt-0.5 size-4 shrink-0" /> <span><b>Sent back:</b> {sheet.returnNote}</span>
          </div>
        )}
        {!editable && sheet.access.reason && (
          <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
            <Lock className="size-4" /> {sheet.access.reason}
          </div>
        )}
        {editable && (
          <p className="text-xs text-slate-500">
            Type marks and press <kbd className="rounded border px-1">Enter</kbd> to go down. Press <kbd className="rounded border px-1">A</kbd> for absent or <kbd className="rounded border px-1">M</kbd> for medical. Saved automatically.
          </p>
        )}
      </div>

      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="w-12 px-3 py-2">Roll</th>
                <th className="px-3 py-2">Student</th>
                <th className="w-32 px-2 py-2">Theory /{subject.theoryFullMarks}</th>
                {hasPractical && <th className="w-32 px-2 py-2">Practical /{subject.practicalFullMarks}</th>}
                <th className="w-32 px-2 py-2">Status</th>
                <th className="w-20 px-2 py-2 text-right">Total</th>
                <th className="w-16 px-3 py-2 text-center">Grade</th>
              </tr>
            </thead>
            <tbody ref={grid} className="divide-y divide-slate-100">
              {sheet.students.map((student, rowIndex) => {
                const row = rows[student.studentId];
                const p = parsed[student.studentId];
                const result = results[student.studentId];
                const present = row.status === "PRESENT";
                return (
                  <tr key={student.studentId} className={cn(result.outcome === "FAIL" && "bg-red-50/40", !present && "bg-slate-50")}>
                    <td className="px-3 py-1.5 tabular-nums text-slate-400">{student.rollNo ?? ""}</td>
                    <td className="px-3 py-1.5 font-medium text-slate-800">{student.name}</td>
                    <MarkCell
                      value={row.theory}
                      error={p.theory.error}
                      below={present && p.theory.value !== null && p.theory.value < subject.theoryPassMarks}
                      disabled={!editable || !present}
                      row={rowIndex}
                      col={0}
                      onChange={(theory) => update(student.studentId, { theory })}
                      onKeyDown={(e) => onKeyDown(e, rowIndex, 0, student.studentId)}
                    />
                    {hasPractical && (
                      <MarkCell
                        value={row.practical}
                        error={p.practical.error}
                        below={present && p.practical.value !== null && p.practical.value < subject.practicalPassMarks}
                        disabled={!editable || !present}
                        row={rowIndex}
                        col={1}
                        onChange={(practical) => update(student.studentId, { practical })}
                        onKeyDown={(e) => onKeyDown(e, rowIndex, 1, student.studentId)}
                      />
                    )}
                    <td className="px-2 py-1">
                      <select
                        value={row.status}
                        disabled={!editable}
                        onChange={(e) => update(student.studentId, { status: e.target.value as RowDraft["status"], ...(e.target.value !== "PRESENT" && { theory: "", practical: "" }) })}
                        className={cn("h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm", row.status === "ABSENT" && "text-red-600", row.status === "MEDICAL" && "text-blue-600")}
                      >
                        <option value="PRESENT">Present</option>
                        <option value="ABSENT">Absent</option>
                        <option value="MEDICAL">Medical</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-slate-900">{result.obtained ?? "—"}</td>
                    <td className={cn("px-3 py-1.5 text-center font-semibold", result.outcome === "FAIL" || result.outcome === "ABSENT" ? "text-red-600" : "text-slate-900")}>{result.outcome === "MISSING" ? "—" : result.grade}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 text-sm text-slate-600 sm:px-6 lg:px-8">
          <span><b className="text-slate-900">{stats.entered}</b>/{sheet.students.length} entered</span>
          <span><b className="text-green-700">{stats.passed}</b> passed</span>
          <span><b className="text-red-600">{stats.failed}</b> not passed</span>
          {stats.average !== null && <span>Average <b className="text-slate-900">{stats.average}</b></span>}
          {stats.highest !== null && <span>Highest <b className="text-slate-900">{stats.highest}</b></span>}
          {errors > 0 && <span className="font-medium text-red-600">{errors} mark(s) need fixing</span>}
        </div>
      </div>

      {returning && <ReturnModal path={path} onClose={() => setReturning(false)} />}
    </div>
  );
}

function MarkCell(props: {
  value: string;
  error: string | null;
  below: boolean;
  disabled: boolean;
  row: number;
  col: number;
  onChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <td className="px-2 py-1">
      <input
        inputMode="decimal"
        value={props.value}
        disabled={props.disabled}
        data-row={props.row}
        data-col={props.col}
        title={props.error ?? (props.below ? "Below pass marks" : undefined)}
        onChange={(e) => props.onChange(e.target.value.replace(/[^\d.]/g, ""))}
        onKeyDown={props.onKeyDown}
        onFocus={(e) => e.target.select()}
        className={cn(
          "h-9 w-full rounded-md border px-2 text-right font-medium tabular-nums focus:outline-none focus:ring-2",
          props.error ? "border-red-400 bg-red-50 text-red-700 focus:ring-red-200" : "border-slate-200 focus:border-brand focus:ring-brand/20",
          props.below && !props.error && "text-red-600",
          props.disabled && "bg-slate-50 text-slate-500",
        )}
      />
    </td>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") return <span className="flex items-center gap-1 text-xs text-slate-500"><Loader2 className="size-3.5 animate-spin" /> Saving…</span>;
  if (state === "error") return <span className="flex items-center gap-1 text-xs text-red-600"><CloudOff className="size-3.5" /> Not saved</span>;
  if (state === "unsaved") return <span className="text-xs text-slate-500">Unsaved</span>;
  return <span className="flex items-center gap-1 text-xs text-slate-500"><Check className="size-3.5" /> Saved</span>;
}

function ReturnModal({ path, onClose }: { path: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState("");
  const send = useMutation({
    mutationFn: () => api.post(`${path}/return`, { note }),
    onSuccess: async () => {
      toast.success("Sent back to the teacher");
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["mark-sheet", path] }), queryClient.invalidateQueries({ queryKey: ["mark-sheets"] })]);
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Send marks back"
      description="The teacher can edit the marks again and will see your note."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={note.trim().length < 3} loading={send.isPending} onClick={() => send.mutate()}>Send back</Button>
        </>
      }
    >
      <Field label="What needs to change?">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="e.g. Roll 4's practical marks look wrong" autoFocus />
      </Field>
    </Modal>
  );
}
