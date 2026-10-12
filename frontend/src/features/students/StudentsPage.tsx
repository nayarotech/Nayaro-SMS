import { useQuery } from "@tanstack/react-query";
import { GraduationCap, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/form";
import { Pagination, Table } from "@/components/ui/Table";
import { api, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useClasses } from "../academic/academic.api";
import { STATUS_LABEL, type StudentListItem, type StudentStatus } from "./students.api";

export function StudentsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { data: classes = [] } = useClasses();
  // Filters live in the URL so they survive going to a student and back
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const classId = params.get("classId") ?? "";
  const sectionId = params.get("sectionId") ?? "";
  const status = (params.get("status") ?? "ACTIVE") as StudentStatus;
  const page = Number(params.get("page") ?? 1);

  const setFilter = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    if (!("page" in changes)) next.delete("page");
    setParams(next, { replace: true });
  };

  const sections = useMemo(() => classes.find((c) => c.id === classId)?.sections ?? [], [classes, classId]);

  const { data, isLoading } = useQuery({
    queryKey: ["students", { search, classId, sectionId, status, page }],
    queryFn: () => api.get<Paginated<StudentListItem>>("/students", { search, classId, sectionId, status, page, pageSize: 25 }),
  });

  return (
    <div>
      <PageHeader
        title="Students"
        description={data ? `${data.total} ${STATUS_LABEL[status].toLowerCase()} students` : undefined}
        actions={
          can("student.create") && (
            <Link to="/students/new">
              <Button icon={<UserPlus className="size-4" />}>New admission</Button>
            </Link>
          )
        }
      />
      <Card padded={false}>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <Input
            placeholder="Search name, admission no. or parent phone…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setFilter({ search: e.target.value });
            }}
            className="w-full sm:w-80"
          />
          <Select value={classId} onChange={(e) => setFilter({ classId: e.target.value, sectionId: "" })} className="w-40">
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Select value={sectionId} onChange={(e) => setFilter({ sectionId: e.target.value })} disabled={!classId} className="w-36">
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>Section {s.name}</option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setFilter({ status: e.target.value === "ACTIVE" ? "" : e.target.value })} className="w-36">
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </div>

        <Table
          loading={isLoading}
          rows={data?.items}
          rowKey={(s) => s.id}
          onRowClick={(s) => navigate(`/students/${s.id}`)}
          empty={<EmptyState icon={<GraduationCap className="size-8" />} title="No students found" description="Try another filter, or admit a new student." />}
          columns={[
            {
              header: "Student",
              cell: (s) => (
                <div className="flex items-center gap-3">
                  <Avatar name={s.fullName} url={s.photoUrl} size={34} />
                  <div>
                    <p className="font-medium text-slate-900">{s.fullName}</p>
                    <p className="text-xs text-slate-500">{s.admissionNo}</p>
                  </div>
                </div>
              ),
            },
            { header: "Class", cell: (s) => (s.class ? `${s.class.name} ${s.section?.name ?? ""}` : <span className="text-slate-400">Not enrolled</span>) },
            { header: "Roll", cell: (s) => s.rollNo ?? "—", className: "tabular-nums" },
            { header: "Gender", cell: (s) => <Badge tone={s.gender === "FEMALE" ? "brand" : "gray"}>{s.gender === "MALE" ? "Boy" : s.gender === "FEMALE" ? "Girl" : "Other"}</Badge> },
            {
              header: "Parent",
              cell: (s) =>
                s.primaryGuardian ? (
                  <div className="text-xs">
                    <p className="text-slate-700">{s.primaryGuardian.name}</p>
                    <p className="text-slate-500">{s.primaryGuardian.phone}</p>
                  </div>
                ) : (
                  "—"
                ),
            },
          ]}
        />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={(p) => setFilter({ page: String(p) })} />}
      </Card>
    </div>
  );
}
