import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Badge, Card, EmptyState, PageHeader, Spinner } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/Table";
import { api, type Paginated } from "@/lib/api";

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: string;
  oldValue: unknown;
  newValue: unknown;
  ip: string | null;
  createdAt: string;
}

const ENTITY_TYPES = ["Student", "Guardian", "User", "Role", "School", "AcademicYear", "SchoolClass", "Section", "Subject", "SubjectAssignment", "ClassTeacherAssignment", "Period", "TimetableEntry", "Enrollment"];

export function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["audit", page, entityType, action],
    queryFn: () => api.get<Paginated<AuditEntry>>("/audit", { page, pageSize: 25, entityType, action }),
  });

  return (
    <div>
      <PageHeader title="Audit log" description="Every change to sensitive data: who changed what, the old and new values, and when." />
      <Card padded={false}>
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4">
          <Select value={entityType} onChange={(e) => (setEntityType(e.target.value), setPage(1))} className="w-48">
            <option value="">All records</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
          <Input placeholder="Action starts with… e.g. student." value={action} onChange={(e) => (setAction(e.target.value), setPage(1))} className="w-64" />
        </div>

        {isLoading ? (
          <Spinner />
        ) : !data?.items.length ? (
          <EmptyState title="No changes recorded yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.items.map((entry) => (
              <li key={entry.id}>
                <button className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50" onClick={() => setOpen(open === entry.id ? null : entry.id)}>
                  {open === entry.id ? <ChevronDown className="size-4 text-slate-400" /> : <ChevronRight className="size-4 text-slate-400" />}
                  <span className="w-44 shrink-0 text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</span>
                  <span className="font-medium text-slate-900">{entry.actor}</span>
                  <Badge tone="gray">{entry.action}</Badge>
                  <span className="truncate text-xs text-slate-400">{entry.entityType}</span>
                </button>
                {open === entry.id && (
                  <div className="grid gap-3 bg-slate-50 px-4 pb-4 sm:grid-cols-2">
                    <ValueBlock title="Before" value={entry.oldValue} />
                    <ValueBlock title="After" value={entry.newValue} />
                    <p className="text-xs text-slate-500 sm:col-span-2">
                      Record ID: {entry.entityId ?? "—"} · IP: {entry.ip ?? "—"}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
    </div>
  );
}

function ValueBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase text-slate-500">{title}</p>
      <pre className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
        {value === null || value === undefined ? "—" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
