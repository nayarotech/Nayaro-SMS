import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/display";
import { Checkbox, Field, FormError, Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { Table } from "@/components/ui/Table";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { applyApiErrors, errorMessage } from "@/lib/forms";
import { useSubjects, type Subject } from "./academic.api";

export function SubjectsPage() {
  const { data: subjects, isLoading } = useSubjects();
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Subject | "new" | null>(null);
  const canManage = can("academic.manage");

  const refresh = () => Promise.all(["subjects", "classes", "dashboard"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));

  const remove = useMutation({
    mutationFn: (subject: Subject) => api.delete(`/subjects/${subject.id}`),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div>
      <PageHeader
        title="Subjects"
        description="All subjects taught at the school. Choose which classes study each subject under Classes & sections."
        actions={canManage && <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>New subject</Button>}
      />
      <Card padded={false}>
        <Table
          loading={isLoading}
          rows={subjects}
          rowKey={(s) => s.id}
          empty={<EmptyState icon={<BookOpen className="size-8" />} title="No subjects yet" description="Add subjects like English, Nepali, Mathematics, Science…" />}
          columns={[
            {
              header: "Subject",
              cell: (s) => (
                <span className="flex items-center gap-2 font-medium text-slate-900">
                  {s.name} {s.hasPractical && <Badge tone="blue">Theory + practical</Badge>}
                </span>
              ),
            },
            { header: "Code", cell: (s) => <span className="font-mono text-xs">{s.code ?? "—"}</span> },
            {
              header: "Taught in",
              cell: (s) =>
                s.classes.length ? (
                  <div className="flex flex-wrap gap-1">{s.classes.map((c) => <Badge key={c.id}>{c.name}</Badge>)}</div>
                ) : (
                  <span className="text-xs text-slate-400">No classes yet</span>
                ),
            },
            {
              header: "",
              className: "text-right",
              cell: (s) =>
                canManage && (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(s)}>Edit</Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => confirm(`Delete ${s.name}? It will be removed from every class and timetable.`) && remove.mutate(s)} />
                  </div>
                ),
            },
          ]}
        />
      </Card>
      {editing && <SubjectModal subject={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  );
}

interface SubjectForm {
  name: string;
  code: string;
  hasPractical: boolean;
}

function SubjectModal({ subject, onClose, onSaved }: { subject: Subject | null; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<SubjectForm>({
    defaultValues: { name: subject?.name ?? "", code: subject?.code ?? "", hasPractical: subject?.hasPractical ?? false },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const body = { ...values, code: values.code || null };
      if (subject) await api.patch(`/subjects/${subject.id}`, body);
      else await api.post("/subjects", body);
      await onSaved();
      onClose();
    } catch (e) {
      setFormError(applyApiErrors(e, setError));
    }
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={subject ? `Edit ${subject.name}` : "New subject"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={formState.isSubmitting} onClick={() => void onSubmit()}>Save</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <FormError message={formError} />
        <Field label="Name" required error={formState.errors.name?.message}>
          <Input {...register("name", { required: "Required" })} autoFocus />
        </Field>
        <Field label="Code" error={formState.errors.code?.message}>
          <Input {...register("code")} placeholder="e.g. ENG" />
        </Field>
        <Checkbox label="Has a practical component (theory + practical marks)" {...register("hasPractical")} />
      </form>
    </Modal>
  );
}
