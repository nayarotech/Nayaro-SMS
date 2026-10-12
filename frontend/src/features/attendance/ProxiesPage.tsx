import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, UserCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DateInput } from "@/components/ui/DateInput";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/display";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { Table } from "@/components/ui/Table";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatBsLong } from "@/lib/dates";
import { errorMessage } from "@/lib/forms";
import { useClasses, useTeachers } from "../academic/academic.api";
import { today } from "./attendance.api";

interface Proxy {
  id: string;
  section: { id: string; label: string };
  teacher: { id: string; fullName: string };
  startDate: string;
  endDate: string;
  reason: string | null;
  status: "active" | "upcoming" | "expired" | "revoked";
}

const STATUS_TONE = { active: "green", upcoming: "blue", expired: "gray", revoked: "red" } as const;

/** Admins let a teacher take a section's attendance for some days. Access ends by itself. */
export function ProxiesPage() {
  const [filter, setFilter] = useState<"active" | "upcoming" | "past" | "all">("active");
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["proxies", filter], queryFn: () => api.get<Proxy[]>("/attendance/proxies", { filter }) });

  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/attendance/proxies/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["proxies"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div>
      <PageHeader
        title="Proxy teachers"
        description="When a class teacher is away, let another teacher take that section's attendance for chosen dates. They can see earlier attendance but not change it, and access ends automatically."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Assign proxy</Button>}
      />
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm w-fit">
        {(["active", "upcoming", "past", "all"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cn("rounded-md px-3 py-1.5 font-medium capitalize", filter === f ? "bg-white shadow-sm" : "text-slate-500")}>
            {f}
          </button>
        ))}
      </div>
      <Card padded={false}>
        <Table
          loading={isLoading}
          rows={data}
          rowKey={(p) => p.id}
          empty={<EmptyState icon={<UserCheck className="size-8" />} title="No proxy assignments" />}
          columns={[
            { header: "Section", cell: (p) => <span className="font-medium text-slate-900">{p.section.label}</span> },
            { header: "Proxy teacher", cell: (p) => p.teacher.fullName },
            { header: "Dates", cell: (p) => (p.startDate === p.endDate ? formatBsLong(p.startDate) : `${formatBsLong(p.startDate)} – ${formatBsLong(p.endDate)}`) },
            { header: "Reason", cell: (p) => <span className="text-slate-500">{p.reason ?? "—"}</span> },
            { header: "Status", cell: (p) => <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge> },
            {
              header: "",
              className: "text-right",
              cell: (p) =>
                (p.status === "active" || p.status === "upcoming") && (
                  <Button size="sm" variant="ghost" onClick={() => confirm(`End ${p.teacher.fullName}'s proxy access now?`) && revoke.mutate(p.id)}>
                    End now
                  </Button>
                ),
            },
          ]}
        />
      </Card>
      {adding && <AssignProxyModal onClose={() => setAdding(false)} />}
    </div>
  );
}

function AssignProxyModal({ onClose }: { onClose: () => void }) {
  const { data: classes = [] } = useClasses();
  const { data: teachers = [] } = useTeachers();
  const queryClient = useQueryClient();
  const toast = useToast();
  const sections = useMemo(() => classes.flatMap((c) => c.sections.map((s) => ({ id: s.id, label: `${c.name} ${s.name}`, classTeacher: s.classTeacher }))), [classes]);
  const [form, setForm] = useState({ sectionId: "", teacherId: "", startDate: today(), endDate: today(), reason: "" });
  const [error, setError] = useState<string | null>(null);
  const section = sections.find((s) => s.id === form.sectionId);

  const save = useMutation({
    mutationFn: () => api.post("/attendance/proxies", { ...form, reason: form.reason || null }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["proxies"] });
      toast.success("Proxy assigned — the teacher has been notified");
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Assign a proxy teacher"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!form.sectionId || !form.teacherId} loading={save.isPending} onClick={() => save.mutate()}>Assign</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <Field label="Section" required hint={section?.classTeacher ? `Class teacher: ${section.classTeacher.fullName}` : undefined}>
          <Select value={form.sectionId} onChange={(e) => setForm({ ...form, sectionId: e.target.value })}>
            <option value="">Select…</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Proxy teacher" required>
          <Select value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>
            <option value="">Select…</option>
            {teachers
              .filter((t) => t.id !== section?.classTeacher?.id)
              .map((t) => (
                <option key={t.id} value={t.id}>{t.fullName}</option>
              ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From" required>
            <DateInput value={form.startDate} onChange={(startDate) => setForm({ ...form, startDate, endDate: form.endDate < startDate ? startDate : form.endDate })} />
          </Field>
          <Field label="Until" required>
            <DateInput value={form.endDate} onChange={(endDate) => setForm({ ...form, endDate })} />
          </Field>
        </div>
        <Field label="Reason">
          <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Class teacher on leave" />
        </Field>
      </div>
    </Modal>
  );
}
