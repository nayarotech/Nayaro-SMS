import { useQuery } from "@tanstack/react-query";
import { CalendarCheck } from "lucide-react";
import { Badge, Card, EmptyState, Spinner } from "@/components/ui/display";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

interface StudentAttendance {
  academicYear: { name: string };
  totals: { present: number; absent: number; late: number; leave: number; total: number };
  percent: number | null;
  months: { name: string; counts: { present: number; absent: number; late: number; leave: number; total: number }; percent: number | null }[];
  absences: { date: string; dateBs: string; status: "ABSENT" | "LEAVE"; remark: string | null }[];
}

/** A student's attendance this year: overall %, month by month, and the days missed. */
export function StudentAttendanceTab({ studentId }: { studentId: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["student-attendance", studentId], queryFn: () => api.get<StudentAttendance>(`/attendance/reports/students/${studentId}`) });
  if (isLoading || !data) return <Spinner />;
  if (!data.totals.total) return <Card><EmptyState icon={<CalendarCheck className="size-8" />} title="No attendance recorded yet this year" /></Card>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <Card title={`Attendance ${data.academicYear.name}`}>
        <div className="mb-5 flex flex-wrap items-end gap-6">
          <p className={cn("text-4xl font-semibold", (data.percent ?? 100) < 75 ? "text-red-600" : "text-slate-900")}>{data.percent}%</p>
          <p className="pb-1 text-sm text-slate-600">
            {data.totals.present + data.totals.late} of {data.totals.total} days · {data.totals.absent} absent · {data.totals.leave} leave · {data.totals.late} late
          </p>
        </div>
        <ul className="space-y-2">
          {data.months.map((m) => (
            <li key={m.name} className="grid grid-cols-[7rem_1fr_3.5rem] items-center gap-3 text-sm">
              <span className="text-slate-600">{m.name}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <span className={cn("block h-full rounded-full", (m.percent ?? 100) < 75 ? "bg-red-500" : "bg-brand")} style={{ width: `${m.percent ?? 0}%` }} />
              </span>
              <span className="text-right font-medium tabular-nums">{m.percent}%</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={`Days missed (${data.absences.length})`}>
        {data.absences.length === 0 ? (
          <p className="text-sm text-slate-500">Never absent this year.</p>
        ) : (
          <ul className="max-h-96 space-y-1.5 overflow-y-auto text-sm">
            {[...data.absences].reverse().map((a) => (
              <li key={a.date} className="flex items-center justify-between gap-2">
                <span>
                  {a.dateBs}
                  {a.remark && <span className="block text-xs text-slate-500">{a.remark}</span>}
                </span>
                <Badge tone={a.status === "ABSENT" ? "red" : "blue"}>{a.status === "ABSENT" ? "Absent" : "Leave"}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
