import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, ClipboardCheck, GraduationCap, Layers, MessageSquareWarning, PenLine, Settings2, Users, UsersRound } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Card, Spinner } from "@/components/ui/display";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatBsLong } from "@/lib/dates";
import { useFormatDate } from "@/lib/use-format-date";
import { SchoolsPage } from "../schools/SchoolsPage";

interface DashboardData {
  today: { ad: string; bs: string };
  currentAcademicYear: { id: string; name: string } | null;
  widgetOrder: string[];
  widgets: {
    myWork?: { kind: string; label: string; detail: string; path: string }[];
    attendanceToday?: { percent: number | null; sectionsTaken: number; sectionsTotal: number; present: number; absent: number; leave: number; notTaken: { sectionId: string; label: string; classTeacher: string | null }[] };
    stats?: { students: number; staff: number; guardians: number; classes: number; sections: number };
    studentsByClass?: { className: string; count: number }[];
    genderSplit?: { gender: string; count: number }[];
    recentAdmissions?: { id: string; name: string; admissionNo: string; admissionDate: string; classSection: string | null }[];
    recentActivity?: { id: string; action: string; actor: string; at: string }[];
    setupChecklist?: { key: string; label: string; done: boolean; path: string }[];
  };
}

/**
 * Which widgets show (and in what order) is set by the school in
 * Settings → Dashboard. Each widget key maps to a component below.
 */
export function DashboardPage() {
  const { user } = useAuth();
  // A super admin who hasn't opened a school sees the platform view.
  if (user?.isSuperAdmin && !user.school) return <SchoolsPage />;
  return <SchoolDashboard />;
}

function SchoolDashboard() {
  const { t, i18n } = useTranslation();
  const { user, can } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<DashboardData>("/dashboard/admin") });

  if (isLoading || !data) return <Spinner />;
  const { widgets } = data;

  const render: Record<string, ReactNode> = {
    myWork: widgets.myWork && <MyWorkWidget tasks={widgets.myWork} />,
    attendanceToday: widgets.attendanceToday && <AttendanceTodayWidget data={widgets.attendanceToday} />,
    stats: widgets.stats && <StatsWidget stats={widgets.stats} />,
    setupChecklist: widgets.setupChecklist && widgets.setupChecklist.some((i) => !i.done) && <ChecklistWidget items={widgets.setupChecklist} />,
    studentsByClass: widgets.studentsByClass && <StudentsByClassWidget rows={widgets.studentsByClass} />,
    genderSplit: widgets.genderSplit && <GenderWidget rows={widgets.genderSplit} />,
    recentAdmissions: widgets.recentAdmissions && <RecentAdmissionsWidget rows={widgets.recentAdmissions} />,
    recentActivity: widgets.recentActivity && <ActivityWidget rows={widgets.recentActivity} />,
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{t("dashboard.welcome", { name: user?.fullName.split(" ")[0] })}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("dashboard.today")}: {formatBsLong(data.today.ad, i18n.language as "en" | "ne")} BS · {data.today.ad} AD
            {data.currentAcademicYear && <> · Academic year {data.currentAcademicYear.name}</>}
          </p>
        </div>
        {can("school.settings.edit") && (
          <Link to="/settings?group=dashboard" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand">
            <Settings2 className="size-4" /> Customise dashboard
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {data.widgetOrder.map((key) =>
          render[key] ? (
            <div key={key} className={["stats", "setupChecklist", "myWork"].includes(key) ? "lg:col-span-2" : undefined}>
              {render[key]}
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

const TASK_ICON = { attendance: ClipboardCheck, marks: PenLine, returned: MessageSquareWarning, verify: CheckCircle2 } as const;

function MyWorkWidget({ tasks }: { tasks: NonNullable<DashboardData["widgets"]["myWork"]> }) {
  if (!tasks.length) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-800">
        <CheckCircle2 className="size-5" /> You're all caught up — nothing waiting for you today.
      </div>
    );
  }
  return (
    <Card title={`My work · ${tasks.length} to do`}>
      <ul className="grid gap-2 md:grid-cols-2">
        {tasks.map((task) => {
          const Icon = TASK_ICON[task.kind as keyof typeof TASK_ICON] ?? Circle;
          return (
            <li key={task.path + task.label}>
              <Link to={task.path} className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-2.5 hover:border-brand hover:bg-brand-soft/40">
                <Icon className={cn("mt-0.5 size-4.5 shrink-0", task.kind === "returned" ? "text-amber-600" : "text-brand")} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-900">{task.label}</span>
                  <span className="block truncate text-xs text-slate-500">{task.detail}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function AttendanceTodayWidget({ data }: { data: NonNullable<DashboardData["widgets"]["attendanceToday"]> }) {
  return (
    <Card title="Attendance today" actions={<Link to="/attendance/reports" className="text-sm text-brand hover:underline">Reports</Link>}>
      <div className="flex items-end gap-6">
        <div>
          <p className="text-3xl font-semibold text-slate-900">{data.percent !== null ? `${data.percent}%` : "—"}</p>
          <p className="text-xs text-slate-500">{data.sectionsTaken} of {data.sectionsTotal} sections taken</p>
        </div>
        <div className="flex gap-4 text-sm">
          <span><b className="text-green-700">{data.present}</b> present</span>
          <span><b className="text-red-600">{data.absent}</b> absent</span>
          <span><b className="text-slate-900">{data.leave}</b> leave</span>
        </div>
      </div>
      {data.notTaken.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">Not taken yet</p>
          <div className="flex flex-wrap gap-1.5">
            {data.notTaken.slice(0, 12).map((s) => (
              <Link key={s.sectionId} to={`/attendance/sections/${s.sectionId}`} title={s.classTeacher ?? undefined} className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100">
                {s.label}
              </Link>
            ))}
            {data.notTaken.length > 12 && <span className="px-2 py-1 text-xs text-slate-500">+{data.notTaken.length - 12} more</span>}
          </div>
        </div>
      )}
    </Card>
  );
}

function StatsWidget({ stats }: { stats: NonNullable<DashboardData["widgets"]["stats"]> }) {
  const items = [
    { label: "Active students", value: stats.students, icon: GraduationCap, to: "/students" },
    { label: "Staff", value: stats.staff, icon: Users, to: "/staff" },
    { label: "Parents", value: stats.guardians, icon: UsersRound, to: "/guardians" },
    { label: "Classes / sections", value: `${stats.classes} / ${stats.sections}`, icon: Layers, to: "/academic/classes" },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {items.map((item) => (
        <Link key={item.label} to={item.to} className="rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-brand">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">{item.label}</span>
            <item.icon className="size-5 text-brand" />
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</p>
        </Link>
      ))}
    </div>
  );
}

function ChecklistWidget({ items }: { items: NonNullable<DashboardData["widgets"]["setupChecklist"]> }) {
  const done = items.filter((i) => i.done).length;
  return (
    <Card title={`Getting started · ${done} of ${items.length} done`}>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.key}>
            <Link to={item.path} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
              {item.done ? <CheckCircle2 className="size-4.5 text-green-600" /> : <Circle className="size-4.5 text-slate-300" />}
              <span className={item.done ? "text-slate-400 line-through" : "text-slate-700"}>{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function StudentsByClassWidget({ rows }: { rows: { className: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card title="Students by class">
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No classes yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.className} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-3 text-sm">
              <span className="truncate text-slate-600">{row.className}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <span className="block h-full rounded-full bg-brand" style={{ width: `${(row.count / max) * 100}%` }} />
              </span>
              <span className="text-right font-medium tabular-nums text-slate-900">{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function GenderWidget({ rows }: { rows: { gender: string; count: number }[] }) {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const label: Record<string, string> = { MALE: "Boys", FEMALE: "Girls", OTHER: "Other" };
  return (
    <Card title="Gender split">
      {total === 0 ? (
        <p className="text-sm text-slate-500">No students yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.gender}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="text-slate-600">{label[row.gender] ?? row.gender}</span>
                <span className="font-medium tabular-nums">
                  {row.count} · {Math.round((row.count / total) * 100)}%
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand" style={{ width: `${(row.count / total) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function RecentAdmissionsWidget({ rows }: { rows: NonNullable<DashboardData["widgets"]["recentAdmissions"]> }) {
  const formatDate = useFormatDate();
  return (
    <Card title="Recent admissions" actions={<Link to="/students" className="text-sm text-brand hover:underline">View all</Link>}>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No admissions yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => (
            <li key={row.id}>
              <Link to={`/students/${row.id}`} className="flex items-center justify-between py-2 text-sm hover:text-brand">
                <span>
                  <span className="font-medium text-slate-900">{row.name}</span>
                  <span className="ml-2 text-slate-500">{row.classSection}</span>
                </span>
                <span className="text-xs text-slate-500">{formatDate(row.admissionDate)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ActivityWidget({ rows }: { rows: NonNullable<DashboardData["widgets"]["recentActivity"]> }) {
  return (
    <Card title="Recent activity" actions={<Link to="/audit" className="text-sm text-brand hover:underline">Audit log</Link>}>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((row) => (
            <li key={row.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span>
                <span className="font-medium text-slate-900">{row.actor}</span>{" "}
                <span className="text-slate-600">{describeAction(row.action)}</span>
              </span>
              <span className="shrink-0 text-xs text-slate-400">{new Date(row.at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** "student.update" → "updated a student" */
function describeAction(action: string): string {
  const [entity, ...rest] = action.split(".");
  const verb = rest.join(" ").replace(/_/g, " ");
  const past: Record<string, string> = { create: "created", update: "updated", delete: "deleted", admit: "admitted", deactivate: "deactivated", activate: "activated" };
  return `${past[verb] ?? verb} ${entity.replace(/_/g, " ")}`;
}
