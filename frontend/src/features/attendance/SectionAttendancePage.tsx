import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCheck, ChevronLeft, ChevronRight, Lock, MessageSquare, UserCheck } from "lucide-react";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { Avatar, Badge, Card, Spinner } from "@/components/ui/display";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/forms";
import { shiftDate, STATUSES, today, type AttendanceStatus, type SectionAttendance } from "./attendance.api";

/** Take or correct one section's attendance. Built for phones: big buttons, one tap per student. */
export function SectionAttendancePage() {
  const { sectionId } = useParams<{ sectionId: string }>();
  const [params, setParams] = useSearchParams();
  const date = params.get("date") ?? today();

  const { data } = useQuery({
    queryKey: ["attendance-section", sectionId, date],
    queryFn: () => api.get<SectionAttendance>(`/attendance/sections/${sectionId}`, { date }),
  });

  if (!data) return <Spinner />;
  return (
    <AttendanceSheet
      key={`${sectionId}:${date}:${data.taken?.at ?? "new"}`}
      data={data}
      onDate={(d) => setParams(d === today() ? {} : { date: d })}
    />
  );
}

type Draft = Record<string, { status: AttendanceStatus | null; remark: string | null }>;

function AttendanceSheet({ data, onDate }: { data: SectionAttendance; onDate: (date: string) => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => Object.fromEntries(data.students.map((s) => [s.studentId, { status: s.status, remark: s.remark }])));
  const [remarkFor, setRemarkFor] = useState<string | null>(null);
  const editable = data.access.canMark;

  const statuses = Object.values(draft).map((d) => d.status);
  const counts = {
    present: statuses.filter((s) => s === "PRESENT").length,
    absent: statuses.filter((s) => s === "ABSENT").length,
    late: statuses.filter((s) => s === "LATE").length,
    leave: statuses.filter((s) => s === "LEAVE").length,
    unmarked: statuses.filter((s) => s === null).length,
  };
  const changed = data.students.some((s) => draft[s.studentId].status !== s.status || (draft[s.studentId].remark ?? null) !== (s.remark ?? null));

  const set = (studentId: string, status: AttendanceStatus) => setDraft((d) => ({ ...d, [studentId]: { ...d[studentId], status } }));
  const markAllPresent = () => setDraft((d) => Object.fromEntries(Object.entries(d).map(([id, v]) => [id, { ...v, status: v.status ?? "PRESENT" }])));

  const save = useMutation({
    mutationFn: () =>
      api.put(`/attendance/sections/${data.section.id}`, {
        date: data.date,
        records: data.students.map((s) => ({ studentId: s.studentId, status: draft[s.studentId].status, remark: draft[s.studentId].remark })),
      }),
    onSuccess: async () => {
      toast.success(counts.absent && data.date === today() ? `Saved · parents of ${counts.absent} absent student(s) are notified` : "Attendance saved");
      await Promise.all(["attendance-section", "attendance-my-sections", "dashboard"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="mx-auto max-w-3xl pb-24">
      <Link to={`/attendance${data.date !== today() ? `?date=${data.date}` : ""}`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> All sections
      </Link>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {data.section.className} {data.section.name}
          </h1>
          <p className="text-sm text-slate-500">
            {data.dateBs} BS{data.date === today() ? " · today" : ""} · {data.students.length} students
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" icon={<ChevronLeft className="size-4" />} onClick={() => onDate(shiftDate(data.date, -1))} aria-label="Previous day" />
          <Button size="sm" variant="secondary" disabled={data.date >= today()} icon={<ChevronRight className="size-4" />} onClick={() => onDate(shiftDate(data.date, 1))} aria-label="Next day" />
        </div>
      </div>

      <div className="mb-4 space-y-2">
        {data.access.asProxy && (
          <Banner tone="blue" icon={<UserCheck className="size-4" />}>You're taking this attendance as the proxy teacher.</Banner>
        )}
        {!editable && <Banner tone="slate" icon={<Lock className="size-4" />}>{data.access.reason ?? "Read only"}</Banner>}
        {!data.isWorkingDay && <Banner tone="amber" icon={<AlertTriangle className="size-4" />}>This day isn't a working day in the school's settings.</Banner>}
        {data.taken && (
          <p className="text-xs text-slate-500">
            Taken by {data.taken.by}
            {data.taken.asProxy ? " (proxy)" : ""} · last saved {new Date(data.taken.at).toLocaleString()}
          </p>
        )}
      </div>

      {editable && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" variant="secondary" icon={<CheckCheck className="size-4" />} onClick={markAllPresent} disabled={counts.unmarked === 0}>
            Mark everyone else present
          </Button>
        </div>
      )}

      <Card padded={false}>
        <ul className="divide-y divide-slate-100">
          {data.students.map((student) => {
            const entry = draft[student.studentId];
            return (
              <li key={student.studentId} className={cn("px-3 py-2.5 sm:px-4", entry.status === "ABSENT" && "bg-red-50/50")}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="w-7 text-center text-sm tabular-nums text-slate-400">{student.rollNo ?? "–"}</span>
                  <Avatar name={student.name} url={student.photoUrl} size={34} />
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{student.name}</span>
                  <div className="flex gap-1">
                    {STATUSES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        disabled={!editable}
                        title={s.label}
                        aria-pressed={entry.status === s.value}
                        onClick={() => set(student.studentId, s.value)}
                        className={cn(
                          "h-10 min-w-10 rounded-lg border px-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed",
                          entry.status === s.value ? s.className : "border-slate-200 bg-white text-slate-500 hover:border-slate-400",
                        )}
                      >
                        {s.short}
                      </button>
                    ))}
                    {editable && (
                      <button
                        type="button"
                        title="Add a note"
                        onClick={() => setRemarkFor(remarkFor === student.studentId ? null : student.studentId)}
                        className={cn("h-10 w-9 rounded-lg text-slate-400 hover:bg-slate-100", entry.remark && "text-brand")}
                      >
                        <MessageSquare className="mx-auto size-4" />
                      </button>
                    )}
                  </div>
                </div>
                {(remarkFor === student.studentId || (!editable && entry.remark)) && (
                  <input
                    value={entry.remark ?? ""}
                    disabled={!editable}
                    autoFocus
                    onChange={(e) => setDraft((d) => ({ ...d, [student.studentId]: { ...d[student.studentId], remark: e.target.value || null } }))}
                    placeholder="Note, e.g. sick, family function"
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                  />
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Totals and save, always visible */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap gap-1.5 text-sm">
            <Badge tone="green">{counts.present} present</Badge>
            <Badge tone="red">{counts.absent} absent</Badge>
            {counts.late > 0 && <Badge tone="amber">{counts.late} late</Badge>}
            {counts.leave > 0 && <Badge tone="blue">{counts.leave} leave</Badge>}
            {counts.unmarked > 0 && <Badge>{counts.unmarked} not marked</Badge>}
          </div>
          {editable && (
            <Button loading={save.isPending} disabled={counts.unmarked > 0 || (!changed && Boolean(data.taken))} onClick={() => save.mutate()}>
              {data.taken ? "Save changes" : "Save attendance"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Banner({ tone, icon, children }: { tone: "blue" | "amber" | "slate"; icon: React.ReactNode; children: React.ReactNode }) {
  const tones = { blue: "bg-blue-50 text-blue-800", amber: "bg-amber-50 text-amber-800", slate: "bg-slate-100 text-slate-700" };
  return <div className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm", tones[tone])}>{icon}{children}</div>;
}
