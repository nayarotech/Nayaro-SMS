import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, MessageSquare, Printer, Send, Trophy } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { Badge, Card, EmptyState, PageHeader, Spinner } from "@/components/ui/display";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast";
import { api, downloadFile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/forms";
import { useClasses } from "../academic/academic.api";
import { SHEET_STATUS, useExams, type Results, type SheetStatus, type SheetSummary } from "./exams.api";

const RESULT = { PASS: { label: "Pass", tone: "green" }, FAIL: { label: "Fail", tone: "red" }, INCOMPLETE: { label: "Incomplete", tone: "amber" } } as const;

export function ResultsPage() {
  const { data: examData } = useExams();
  const { data: classes = [] } = useClasses();
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const examId = params.get("exam") || examData?.exams[0]?.id || "";
  const classId = params.get("class") || classes[0]?.id || "";
  const sectionId = params.get("section") ?? "";
  const schoolClass = classes.find((c) => c.id === classId);
  const setParam = (changes: Record<string, string>) => setParams({ exam: examId, class: classId, ...(sectionId && { section: sectionId }), ...changes });
  const [remarkFor, setRemarkFor] = useState<Results["students"][number] | null>(null);

  const query = { classId, sectionId: sectionId || undefined };
  const { data, isLoading, error } = useQuery({
    queryKey: ["results", examId, classId, sectionId],
    queryFn: () => api.get<Results>(`/exams/${examId}/results`, query),
    enabled: Boolean(examId && classId),
    retry: false,
  });
  const { data: sheets } = useQuery({
    queryKey: ["mark-sheets", examId, classId],
    queryFn: () => api.get<{ sheets: SheetSummary[] }>(`/exams/${examId}/sheets`, { classId }),
    enabled: Boolean(examId && classId && can(["marks.publish", "marks.verify", "exam.manage"])),
  });

  const statusCounts = (sheets?.sheets ?? []).reduce<Record<SheetStatus, number>>((acc, s) => ({ ...acc, [s.status]: acc[s.status] + 1 }), { DRAFT: 0, SUBMITTED: 0, VERIFIED: 0, PUBLISHED: 0 });
  const totalSheets = sheets?.sheets.length ?? 0;
  const readyToPublish = totalSheets > 0 && statusCounts.VERIFIED + statusCounts.PUBLISHED === totalSheets && statusCounts.VERIFIED > 0;

  const publish = useMutation({
    mutationFn: () => api.post(`/exams/${examId}/classes/${classId}/publish`),
    onSuccess: async () => {
      toast.success("Results published — parents have been notified");
      await Promise.all(["results", "mark-sheets", "exams"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const download = async (path: string, extra: Record<string, string>, open = false) => {
    try {
      await downloadFile(`/exams/${examId}${path}`, { ...query, ...extra }, { open });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div>
      <PageHeader title="Results & report cards" description="Ledger, ranks and report cards. Parents see results only after you publish them." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={examId} onChange={(e) => setParam({ exam: e.target.value })} className="w-64">
          {examData?.exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.name}</option>)}
        </Select>
        <Select value={classId} onChange={(e) => setParams({ exam: examId, class: e.target.value })} className="w-36">
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={sectionId} onChange={(e) => setParam({ section: e.target.value })} className="w-36">
          <option value="">All sections</option>
          {schoolClass?.sections.map((s) => <option key={s.id} value={s.id}>Section {s.name}</option>)}
        </Select>
        <div className="ml-auto flex flex-wrap gap-2">
          {can(["reportcard.generate", "exam.manage", "attendance.mark"]) && (
            <Button size="sm" icon={<Printer className="size-4" />} onClick={() => void download("/report-cards", {}, true)}>Report cards</Button>
          )}
          <Button size="sm" variant="secondary" icon={<FileSpreadsheet className="size-4" />} onClick={() => void download("/results/export", { format: "xlsx" })}>Ledger</Button>
          <Button size="sm" variant="secondary" icon={<FileText className="size-4" />} onClick={() => void download("/results/export", { format: "pdf" })}>PDF</Button>
        </div>
      </div>

      {totalSheets > 0 && (
        <Card className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-slate-700">Mark sheets for {schoolClass?.name}:</span>
              {(Object.keys(statusCounts) as SheetStatus[]).map((s) => statusCounts[s] > 0 && <Badge key={s} tone={SHEET_STATUS[s].tone}>{statusCounts[s]} {SHEET_STATUS[s].label.toLowerCase()}</Badge>)}
              {data?.published && <Badge tone="green">Results published</Badge>}
            </div>
            {can("marks.publish") && !data?.published && (
              <Button size="sm" icon={<Send className="size-4" />} disabled={!readyToPublish} loading={publish.isPending} onClick={() => confirm(`Publish ${schoolClass?.name} results? Parents will be notified and can see them in the app.`) && publish.mutate()}>
                {readyToPublish ? "Publish results" : "Verify all marks to publish"}
              </Button>
            )}
          </div>
        </Card>
      )}

      {isLoading ? (
        <Spinner />
      ) : error || !data ? (
        <Card><EmptyState icon={<Trophy className="size-8" />} title="Can't show results" description={error ? errorMessage(error) : undefined} /></Card>
      ) : !data.subjects.length ? (
        <Card><EmptyState icon={<Trophy className="size-8" />} title="This class isn't set up in this exam" description="Set its subjects and marks under Exam setup." /></Card>
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 text-left">Rank</th>
                  <th className="px-3 py-2 text-left">Student</th>
                  {data.subjects.map((s) => <th key={s.subjectId} className="px-2 py-2 text-center font-medium normal-case">{s.subjectName}</th>)}
                  <th className="px-2 py-2 text-right">Total</th>
                  <th className="px-2 py-2 text-right">%</th>
                  <th className="px-2 py-2 text-right">GPA</th>
                  <th className="px-2 py-2 text-center">Grade</th>
                  <th className="px-2 py-2 text-center">Result</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...data.students]
                  .sort((a, b) => (a.sectionRank ?? 999) - (b.sectionRank ?? 999) || (a.rollNo ?? 0) - (b.rollNo ?? 0))
                  .map((s) => (
                    <tr key={s.studentId}>
                      <td className="px-3 py-2 font-semibold tabular-nums text-slate-900">{s.sectionRank ?? "—"}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-900">{s.name}</p>
                        <p className="text-xs text-slate-500">Roll {s.rollNo ?? "—"} · {data.class.name} {s.sectionName}</p>
                      </td>
                      {/* Line up with the subject columns: students may take different optional subjects */}
                      {data.subjects.map((subject) => {
                        const r = s.result.subjects.find((x) => x.subjectId === subject.subjectId);
                        if (!r) return <td key={subject.subjectId} className="px-2 py-2 text-center text-slate-300" title="Doesn't take this subject">–</td>;
                        return (
                          <td key={subject.subjectId} className={cn("px-2 py-2 text-center tabular-nums", (r.outcome === "FAIL" || r.outcome === "ABSENT") && "text-red-600")}>
                            <span className="block">{r.obtained ?? "—"}</span>
                            <span className="text-xs font-semibold">{r.grade}</span>
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-right tabular-nums">{s.result.totalObtained}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{s.result.percentage}</td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">{s.result.gpa ?? "—"}</td>
                      <td className="px-2 py-2 text-center font-semibold">{s.result.grade}</td>
                      <td className="px-2 py-2 text-center"><Badge tone={RESULT[s.result.result].tone}>{RESULT[s.result.result].label}</Badge></td>
                      <td className="px-2 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button title={s.remark ? `Remark: ${s.remark}` : "Add remark"} onClick={() => setRemarkFor(s)} className={cn("rounded p-1.5 hover:bg-slate-100", s.remark ? "text-brand" : "text-slate-400")}>
                            <MessageSquare className="size-4" />
                          </button>
                          <button title="Report card" onClick={() => void download("/report-cards", { studentId: s.studentId, sectionId: s.sectionId }, true)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100">
                            <Printer className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {remarkFor && <RemarkModal examId={examId} student={remarkFor} onClose={() => setRemarkFor(null)} />}
    </div>
  );
}

function RemarkModal({ examId, student, onClose }: { examId: string; student: Results["students"][number]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [remark, setRemark] = useState(student.remark ?? "");
  const save = useMutation({
    mutationFn: () => api.put(`/exams/${examId}/remarks`, { studentId: student.studentId, remark }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["results"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Remark for ${student.name}`}
      description="Printed on the report card. Usually written by the class teacher."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button></>}
    >
      <Field label="Remark">
        <Textarea value={remark} rows={3} maxLength={500} onChange={(e) => setRemark(e.target.value)} placeholder="e.g. Hardworking and curious. Needs more practice in Mathematics." autoFocus />
      </Field>
    </Modal>
  );
}
