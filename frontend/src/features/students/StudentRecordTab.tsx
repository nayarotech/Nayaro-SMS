import { Trophy } from "lucide-react";
import { useState } from "react";
import { Badge, Card, EmptyState, Spinner } from "@/components/ui/display";
import { cn } from "@/lib/cn";
import { RESULT_TONE, YEAR_STATUS, useStudentRecord, type ExamRecord } from "./students.api";

/** Every year at the school: class, attendance and each exam subject by subject. */
export function StudentRecordTab({ studentId }: { studentId: string }) {
  const { data, isLoading } = useStudentRecord(studentId);
  if (isLoading || !data) return <Spinner />;

  const points = [...data.years].reverse().flatMap((y) => y.exams.filter((e) => e.gpa !== null).map((e) => ({ label: `${e.name} ${y.academicYear.name}`, short: shortExam(e.name), year: y.academicYear.name, gpa: e.gpa!, grade: e.grade })));

  return (
    <div className="space-y-6">
      {points.length >= 2 && (
        <Card title="GPA over time">
          <GpaTrend points={points} />
        </Card>
      )}
      {data.years.map((year) => (
        <Card
          key={year.academicYear.id}
          title={
            <span className="flex flex-wrap items-center gap-2">
              {year.academicYear.name} · {year.class.name} {year.section.name}
              <Badge tone={YEAR_STATUS[year.status]?.tone ?? "gray"}>{year.academicYear.isCurrent && year.status === "ACTIVE" ? "Current year" : (YEAR_STATUS[year.status]?.label ?? year.status)}</Badge>
            </span>
          }
          actions={
            <span className="text-xs text-slate-500">
              Roll {year.rollNo ?? "—"} · Attendance{" "}
              <span className={cn("font-medium", (year.attendance.percent ?? 100) < 75 ? "text-red-600" : "text-slate-900")}>{year.attendance.percent !== null ? `${year.attendance.percent}%` : "—"}</span>
              {year.attendance.total > 0 && ` (${year.attendance.absent} absent of ${year.attendance.total} days)`}
            </span>
          }
          padded={false}
        >
          {year.remarks && <p className="border-b border-slate-100 px-5 py-2 text-sm text-slate-600">{year.remarks}</p>}
          {year.exams.length === 0 ? (
            <EmptyState icon={<Trophy className="size-7" />} title="No exams this year" />
          ) : (
            <ExamMatrix exams={year.exams} />
          )}
        </Card>
      ))}
    </div>
  );
}

/** "Second Terminal Examination" → "2nd term", "Final Examination" → "Final" */
function shortExam(name: string) {
  const ordinal = name.match(/\b(first|second|third|fourth)\b/i)?.[1].toLowerCase();
  if (ordinal && /term/i.test(name)) return `${{ first: "1st", second: "2nd", third: "3rd", fourth: "4th" }[ordinal]} term`;
  if (/final/i.test(name)) return "Final";
  return name.split(/\s+/).slice(0, 2).join(" ");
}

/** Subjects down the side, exams across: the grade and marks for each. */
function ExamMatrix({ exams }: { exams: ExamRecord[] }) {
  const subjects = [...new Map(exams.flatMap((e) => e.subjects.map((s) => [s.subjectId, s.name] as const))).entries()];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2 text-left">Subject</th>
            {exams.map((e) => (
              <th key={e.examId} className="px-3 py-2 text-center">
                {e.name}
                {!e.published && <span className="block font-normal normal-case text-amber-700">not published</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {subjects.map(([id, name]) => (
            <tr key={id}>
              <td className="px-4 py-2 font-medium text-slate-800">{name}</td>
              {exams.map((e) => {
                const s = e.subjects.find((x) => x.subjectId === id);
                const failed = s && (s.outcome === "FAIL" || s.outcome === "ABSENT");
                return (
                  <td key={e.examId} className={cn("px-3 py-2 text-center tabular-nums", failed && "text-red-600")}>
                    {s ? (
                      <>
                        <span className="font-medium">{s.grade}</span> <span className="text-xs text-slate-500">{s.obtained !== null ? `${s.obtained}/${s.fullMarks}` : ""}</span>
                      </>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-slate-200 bg-slate-50/60">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-slate-500">GPA · grade</th>
            {exams.map((e) => (
              <td key={e.examId} className="px-3 py-2 text-center">
                <span className="font-semibold tabular-nums">{e.gpa ?? "—"}</span> {e.grade !== "—" && <Badge tone={RESULT_TONE[e.result]}>{e.grade}</Badge>}
              </td>
            ))}
          </tr>
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-slate-500">Rank (section · class)</th>
            {exams.map((e) => (
              <td key={e.examId} className="px-3 py-2 text-center tabular-nums text-slate-700">
                {e.sectionRank ?? "—"} · {e.classRank ? `${e.classRank} of ${e.studentsInClass}` : "—"}
              </td>
            ))}
          </tr>
          {exams.some((e) => e.remark) && (
            <tr>
              <th className="px-4 py-2 text-left align-top text-xs font-medium uppercase text-slate-500">Remark</th>
              {exams.map((e) => <td key={e.examId} className="px-3 py-2 text-center text-xs text-slate-600">{e.remark ?? ""}</td>)}
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  );
}

interface TrendPoint {
  label: string;
  short: string;
  year: string;
  gpa: number;
  grade: string;
}

/** Single-series line chart (GPA 0–4) with a hover tooltip. The exam tables below are its table view. */
function GpaTrend({ points }: { points: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 960;
  const height = 210;
  const pad = { top: 16, right: 40, bottom: 40, left: 40 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (gpa: number) => pad.top + innerH - (gpa / 4) * innerH;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.gpa)}`).join(" ");
  const active = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`GPA over time: ${points.map((p) => `${p.label} ${p.gpa}`).join(", ")}`}>
        {[0, 1, 2, 3, 4].map((g) => (
          <g key={g}>
            <line x1={pad.left} x2={width - pad.right} y1={y(g)} y2={y(g)} className="stroke-slate-100" strokeWidth={1} />
            <text x={pad.left - 8} y={y(g)} textAnchor="end" dominantBaseline="middle" className="fill-slate-400 text-[11px]">{g}</text>
          </g>
        ))}
        <path d={path} fill="none" className="stroke-brand" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={p.label}>
            <circle cx={x(i)} cy={y(p.gpa)} r={hover === i ? 6 : 4.5} className="fill-brand stroke-white" strokeWidth={2} />
            <text x={x(i)} y={height - pad.bottom + 16} textAnchor="middle" className="fill-slate-500 text-[11px]">{p.short}</text>
            {(i === 0 || points[i - 1].year !== p.year) && (
              <text x={x(i)} y={height - pad.bottom + 30} textAnchor="middle" className="fill-slate-400 text-[10px]">{p.year}</text>
            )}
            {/* Hit target wider than the mark */}
            <rect x={x(i) - 20} y={pad.top} width={40} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          </g>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} className="stroke-slate-300" strokeDasharray="3 3" pointerEvents="none" />}
      </svg>
      {active && hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm"
          style={{ left: `${(x(hover) / width) * 100}%`, top: `${(y(active.gpa) / height) * 100}%`, marginTop: -10 }}
        >
          <p className="font-medium text-slate-900">{active.label}</p>
          <p className="text-slate-600">GPA {active.gpa} · {active.grade}</p>
        </div>
      )}
    </div>
  );
}
