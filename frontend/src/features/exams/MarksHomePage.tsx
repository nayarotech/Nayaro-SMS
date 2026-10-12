import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, ChevronRight, ClipboardList, MessageSquareWarning } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Badge, Card, EmptyState, PageHeader, Spinner } from "@/components/ui/display";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/forms";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { SHEET_STATUS, useExams, type SheetStatus, type SheetSummary } from "./exams.api";

/** Mark sheets for an exam. Teachers see their own subjects; principals see everything to verify. */
export function MarksHomePage() {
  const { data: examData } = useExams();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const examId = params.get("exam") || examData?.exams[0]?.id || "";
  const isReviewer = can(["marks.verify", "exam.manage"]);
  const [status, setStatus] = useState<SheetStatus | "">(isReviewer ? "SUBMITTED" : "");

  const { data, isLoading } = useQuery({
    queryKey: ["mark-sheets", examId],
    queryFn: () => api.get<{ sheets: SheetSummary[] }>(`/exams/${examId}/sheets`),
    enabled: Boolean(examId),
  });

  const sheets = useMemo(() => (data?.sheets ?? []).filter((s) => !status || s.status === status), [data, status]);
  const byClass = useMemo(() => {
    const groups = new Map<string, SheetSummary[]>();
    for (const sheet of sheets) groups.set(sheet.className, [...(groups.get(sheet.className) ?? []), sheet]);
    return [...groups.entries()];
  }, [sheets]);

  const counts = (s: SheetStatus) => data?.sheets.filter((x) => x.status === s).length ?? 0;
  const toast = useToast();
  const queryClient = useQueryClient();
  const verifyAll = useMutation({
    mutationFn: (classId?: string) => api.post<{ verified: number }>(`/exams/${examId}/verify-all`, { classId }),
    onSuccess: async ({ verified }) => {
      toast.success(`Verified ${verified} mark ${verified === 1 ? "sheet" : "sheets"}`);
      await Promise.all(["mark-sheets", "exams", "results"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const submittedIn = (list: SheetSummary[]) => list.filter((x) => x.status === "SUBMITTED").length;

  return (
    <div>
      <PageHeader
        title="Marks entry"
        description={isReviewer ? "Check submitted marks, verify them or send them back with a note." : "Enter marks for the subjects you teach, then submit them for checking."}
        actions={
          <Select value={examId} onChange={(e) => setParams({ exam: e.target.value })} className="w-64">
            {examData?.exams.map((exam) => (
              <option key={exam.id} value={exam.id}>{exam.name}</option>
            ))}
          </Select>
        }
      />

      {can("marks.verify") && counts("SUBMITTED") > 0 && (
        <Card className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-700">
              <span className="font-semibold">{counts("SUBMITTED")} mark {counts("SUBMITTED") === 1 ? "sheet is" : "sheets are"} waiting for you.</span> Check a few, then verify the rest together.
            </p>
            <Button
              icon={<CheckCheck className="size-4" />}
              loading={verifyAll.isPending && verifyAll.variables === undefined}
              onClick={() => confirm(`Verify all ${counts("SUBMITTED")} submitted mark sheets? Teachers can't change them after this unless you send one back.`) && verifyAll.mutate(undefined)}
            >
              Verify all {counts("SUBMITTED")} submitted
            </Button>
          </div>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 text-sm w-fit">
        {(["", "DRAFT", "SUBMITTED", "VERIFIED", "PUBLISHED"] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={cn("rounded-md px-3 py-1.5 font-medium", status === s ? "bg-white shadow-sm" : "text-slate-500")}>
            {s ? `${SHEET_STATUS[s].label} (${counts(s)})` : `All (${data?.sheets.length ?? 0})`}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Spinner />
      ) : !byClass.length ? (
        <Card>
          <EmptyState
            icon={<ClipboardList className="size-8" />}
            title={data?.sheets.length ? "Nothing with this status" : "No mark sheets for you"}
            description={data?.sheets.length ? undefined : "Mark sheets appear for subjects you're assigned to teach once the exam is set up."}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {byClass.map(([className, list]) => (
            <div key={className}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-700">{className}</h2>
                {can("marks.verify") && submittedIn(list) > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<CheckCheck className="size-3.5" />}
                    loading={verifyAll.isPending && verifyAll.variables === list[0].classId}
                    onClick={() => confirm(`Verify all ${submittedIn(list)} submitted ${className} sheets?`) && verifyAll.mutate(list[0].classId)}
                  >
                    Verify {className} ({submittedIn(list)})
                  </Button>
                )}
              </div>
              <Card padded={false}>
                <ul className="divide-y divide-slate-100">
                  {list.map((sheet) => (
                    <li key={`${sheet.sectionId}:${sheet.subjectId}`}>
                      <Link to={`/exams/${examId}/marks/${sheet.sectionId}/${sheet.subjectId}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900">
                            {sheet.subjectName} <span className="font-normal text-slate-500">· {sheet.className} {sheet.sectionName}</span>
                          </p>
                          <p className="text-xs text-slate-500">{sheet.teachers.map((t) => t.fullName).join(", ") || "No teacher assigned"}</p>
                          {sheet.returnNote && sheet.status === "DRAFT" && (
                            <p className="mt-1 flex items-center gap-1 text-xs text-amber-700"><MessageSquareWarning className="size-3.5" /> Returned: {sheet.returnNote}</p>
                          )}
                        </div>
                        <span className="text-xs tabular-nums text-slate-500">{sheet.entered}/{sheet.students} entered</span>
                        {sheet.status === "DRAFT" && sheet.entered === 0 ? <Badge>Not started</Badge> : <Badge tone={SHEET_STATUS[sheet.status].tone}>{SHEET_STATUS[sheet.status].label}</Badge>}
                        <ChevronRight className="size-4 text-slate-300" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
