import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/Button";
import { DateInput } from "@/components/ui/DateInput";
import { Badge, Card, EmptyState, PageHeader, Spinner } from "@/components/ui/display";
import { Select } from "@/components/ui/form";
import { Table } from "@/components/ui/Table";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/toast";
import { api, downloadFile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { adToBs } from "@/lib/dates";
import { errorMessage } from "@/lib/forms";
import { useClasses } from "../academic/academic.api";
import { today, type AttendanceStatus, type Summary } from "./attendance.api";

const BS_MONTHS = ["Baisakh", "Jestha", "Asar", "Shrawan", "Bhadra", "Aswin", "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"];
const LETTER: Record<AttendanceStatus, string> = { PRESENT: "P", ABSENT: "A", LATE: "L", LEAVE: "Lv" };

export function AttendanceReportsPage() {
  const { can } = useAuth();
  const canSeeSchool = can(["attendance.report", "attendance.proxy.assign"]);
  const [tab, setTab] = useState<"daily" | "monthly">(canSeeSchool ? "daily" : "monthly");
  return (
    <div>
      <PageHeader title="Attendance reports" description="Whole-school daily overview and monthly registers. Download as Excel or PDF." />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "daily", label: "Daily overview", hidden: !canSeeSchool },
          { key: "monthly", label: "Monthly register" },
        ]}
      />
      {tab === "daily" ? <DailyOverview /> : <MonthlyRegister />}
    </div>
  );
}

interface Daily {
  dateBs: string;
  sectionsTaken: number;
  sectionsTotal: number;
  totals: Summary;
  percent: number | null;
  rows: { sectionId: string; label: string; classTeacher: string | null; students: number; taken: boolean; takenBy: string | null; takenAsProxy: boolean; counts: Summary | null; percent: number | null }[];
}

function DailyOverview() {
  const [date, setDate] = useState(today());
  const { data, isLoading } = useQuery({ queryKey: ["attendance-daily", date], queryFn: () => api.get<Daily>("/attendance/reports/daily", { date }) });

  return (
    <div className="space-y-4">
      <div className="w-56">
        <DateInput value={date} onChange={(v) => v && setDate(v)} />
      </div>
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Sections done" value={`${data.sectionsTaken}/${data.sectionsTotal}`} />
            <Stat label="Attendance" value={data.percent !== null ? `${data.percent}%` : "—"} />
            <Stat label="Present" value={data.totals.present + data.totals.late} tone="green" />
            <Stat label="Absent" value={data.totals.absent} tone="red" />
            <Stat label="On leave" value={data.totals.leave} />
          </div>
          <Card padded={false}>
            <Table
              rows={data.rows}
              rowKey={(r) => r.sectionId}
              columns={[
                { header: "Section", cell: (r) => <Link to={`/attendance/sections/${r.sectionId}?date=${date}`} className="font-medium text-slate-900 hover:text-brand">{r.label}</Link> },
                { header: "Class teacher", cell: (r) => <span className="text-slate-600">{r.classTeacher ?? "—"}</span> },
                {
                  header: "Status",
                  cell: (r) => (r.taken ? <Badge tone="green">Taken{r.takenAsProxy ? " (proxy)" : ""}</Badge> : <Badge tone="amber">Not taken</Badge>),
                },
                { header: "Present", cell: (r) => (r.counts ? r.counts.present + r.counts.late : "—"), className: "tabular-nums" },
                { header: "Absent", cell: (r) => (r.counts ? <span className={r.counts.absent ? "font-semibold text-red-600" : ""}>{r.counts.absent}</span> : "—"), className: "tabular-nums" },
                { header: "Leave", cell: (r) => r.counts?.leave ?? "—", className: "tabular-nums" },
                { header: "%", cell: (r) => (r.percent !== null ? `${r.percent}%` : "—"), className: "tabular-nums" },
              ]}
            />
          </Card>
        </>
      )}
    </div>
  );
}

interface Register {
  section: { id: string; label: string };
  month: { name: string };
  days: { ad: string; bsDay: number; weekday: number; isWorkingDay: boolean; taken: boolean }[];
  daysTaken: number;
  students: { studentId: string; name: string; rollNo: number | null; statuses: (AttendanceStatus | null)[]; counts: Summary; percent: number | null }[];
}

function MonthlyRegister() {
  const { data: classes = [] } = useClasses();
  const toast = useToast();
  const sections = useMemo(() => classes.flatMap((c) => c.sections.map((s) => ({ id: s.id, label: `${c.name} ${s.name}` }))), [classes]);
  const [bsYear, bsMonth] = (adToBs(today()) ?? "2083-01").split("-").map(Number);
  const [sectionId, setSectionId] = useState("");
  const [year, setYear] = useState(bsYear);
  const [month, setMonth] = useState(bsMonth);
  const selected = sectionId || sections[0]?.id || "";

  const { data, isLoading, error } = useQuery({
    queryKey: ["attendance-monthly", selected, year, month],
    queryFn: () => api.get<Register>("/attendance/reports/monthly", { sectionId: selected, bsYear: year, bsMonth: month }),
    enabled: Boolean(selected),
    retry: false,
  });

  const download = async (format: "xlsx" | "pdf") => {
    try {
      await downloadFile("/attendance/reports/monthly/export", { sectionId: selected, bsYear: year, bsMonth: month, format });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selected} onChange={(e) => setSectionId(e.target.value)} className="w-40">
          {sections.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </Select>
        <Select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-36">
          {BS_MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </Select>
        <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28">
          {[bsYear - 1, bsYear, bsYear + 1].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </Select>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="secondary" icon={<FileSpreadsheet className="size-4" />} onClick={() => void download("xlsx")}>Excel</Button>
          <Button size="sm" variant="secondary" icon={<FileText className="size-4" />} onClick={() => void download("pdf")}>PDF</Button>
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : error || !data ? (
        <Card><EmptyState icon={<Download className="size-8" />} title="Can't show this register" description={error ? errorMessage(error) : undefined} /></Card>
      ) : (
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm">
            <span className="font-semibold text-slate-900">{data.section.label} · {data.month.name}</span>
            <span className="text-slate-500">Attendance taken on {data.daysTaken} days</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  <th className="sticky left-0 z-10 bg-slate-50 px-2 py-2 text-left">Roll</th>
                  <th className="sticky left-10 z-10 min-w-40 bg-slate-50 px-2 py-2 text-left">Student</th>
                  {data.days.map((d) => (
                    <th key={d.ad} className={cn("w-7 px-0.5 py-2 text-center font-medium", !d.isWorkingDay && "bg-slate-100 text-slate-400")}>{d.bsDay}</th>
                  ))}
                  <th className="px-2 text-center">P</th>
                  <th className="px-2 text-center">A</th>
                  <th className="px-2 text-center">%</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((s) => (
                  <tr key={s.studentId} className="border-t border-slate-100">
                    <td className="sticky left-0 bg-white px-2 py-1.5 text-slate-400">{s.rollNo ?? ""}</td>
                    <td className="sticky left-10 bg-white px-2 py-1.5 font-medium text-slate-800">{s.name}</td>
                    {s.statuses.map((st, i) => (
                      <td
                        key={i}
                        className={cn(
                          "text-center font-semibold",
                          !data.days[i].isWorkingDay && "bg-slate-50",
                          st === "ABSENT" && "bg-red-50 text-red-600",
                          st === "LATE" && "text-amber-600",
                          st === "LEAVE" && "text-blue-600",
                          st === "PRESENT" && "text-green-700",
                        )}
                      >
                        {st ? LETTER[st] : ""}
                      </td>
                    ))}
                    <td className="px-2 text-center tabular-nums">{s.counts.present + s.counts.late}</td>
                    <td className="px-2 text-center tabular-nums">{s.counts.absent}</td>
                    <td className={cn("px-2 text-center font-semibold tabular-nums", (s.percent ?? 100) < 75 && "text-red-600")}>{s.percent ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "green" | "red" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "green" && "text-green-700", tone === "red" && "text-red-600")}>{value}</p>
    </div>
  );
}
