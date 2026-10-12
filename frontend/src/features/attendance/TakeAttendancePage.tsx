import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Clock, UserCheck } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { DateInput } from "@/components/ui/DateInput";
import { Badge, Card, EmptyState, PageHeader, Spinner } from "@/components/ui/display";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatBsLong } from "@/lib/dates";
import { shiftDate, today, type MySection } from "./attendance.api";

/** Start screen: the sections the user takes attendance for, and whether today's is done. */
export function TakeAttendancePage() {
  const [params, setParams] = useSearchParams();
  const date = params.get("date") ?? today();
  const setDate = (value: string) => setParams(value && value !== today() ? { date: value } : {});

  const { data: sections, isLoading } = useQuery({
    queryKey: ["attendance-my-sections", date],
    queryFn: () => api.get<MySection[]>("/attendance/my-sections", { date }),
  });

  const mine = sections?.filter((s) => s.role !== "admin") ?? [];
  const others = sections?.filter((s) => s.role === "admin") ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Take attendance" description={`${formatBsLong(date)} BS${date === today() ? " · today" : ""}`} />

      <div className="mb-6 flex flex-wrap items-end gap-2">
        <button className="rounded-lg border border-slate-300 bg-white p-2.5 hover:bg-slate-50" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day">
          <ChevronLeft className="size-4" />
        </button>
        <div className="w-56">
          <DateInput value={date} onChange={(v) => v && setDate(v)} />
        </div>
        <button className="rounded-lg border border-slate-300 bg-white p-2.5 hover:bg-slate-50 disabled:opacity-40" disabled={date >= today()} onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day">
          <ChevronRight className="size-4" />
        </button>
        {date !== today() && (
          <button className="mb-6 text-sm font-medium text-brand hover:underline" onClick={() => setDate(today())}>Back to today</button>
        )}
      </div>

      {isLoading ? (
        <Spinner />
      ) : !sections?.length ? (
        <Card>
          <EmptyState icon={<ClipboardCheck className="size-8" />} title="No sections to take attendance for" description="Class teachers see their section here. Proxy teachers see the sections they're covering." />
        </Card>
      ) : (
        <div className="space-y-6">
          {mine.length > 0 && <SectionGrid title="My sections" sections={mine} date={date} />}
          {others.length > 0 && <SectionGrid title={mine.length ? "All sections" : "Sections"} sections={others} date={date} />}
        </div>
      )}
    </div>
  );
}

function SectionGrid({ title, sections, date }: { title: string; sections: MySection[]; date: string }) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-slate-700">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => (
          <Link
            key={s.sectionId}
            to={`/attendance/sections/${s.sectionId}${date !== today() ? `?date=${date}` : ""}`}
            className={cn("rounded-xl border bg-white p-4 transition-shadow hover:shadow-md", s.taken ? "border-green-200" : "border-slate-200")}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{s.label}</p>
                <p className="text-xs text-slate-500">{s.students} students</p>
              </div>
              {s.taken ? <CheckCircle2 className="size-5 text-green-600" /> : <Clock className="size-5 text-amber-500" />}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {s.role === "proxy" && (
                <Badge tone="blue">
                  <UserCheck className="mr-1 size-3" /> Proxy{s.proxyUntil ? ` until ${formatBsLong(s.proxyUntil)}` : ""}
                </Badge>
              )}
              {s.role === "class_teacher" && <Badge tone="brand">Class teacher</Badge>}
              {s.taken && s.summary ? (
                <span className="text-xs text-slate-600">
                  <b className="text-green-700">{s.summary.present + s.summary.late}</b> present · <b className="text-red-600">{s.summary.absent}</b> absent
                  {s.summary.leave ? ` · ${s.summary.leave} leave` : ""}
                </span>
              ) : (
                <Badge tone="amber">Not taken yet</Badge>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
