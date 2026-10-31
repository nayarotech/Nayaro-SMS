import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Library, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge, Card, EmptyState, PageHeader, Spinner } from "@/components/ui/display";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/forms";
import { useFormatDate } from "@/lib/use-format-date";
import { useClasses } from "../academic/academic.api";
import { AttachmentLinks, AttachmentPicker } from "./Attachments";
import { usePostingOptions, type Attachment, type Material } from "./learning.api";

/** Notes, slides, worksheets and videos per class and subject. Parents and students see them in the app. */
export function MaterialsPage() {
  const { can } = useAuth();
  const formatDate = useFormatDate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: classes = [] } = useClasses();
  const { data: options } = usePostingOptions();
  const [classId, setClassId] = useState("");
  const [editing, setEditing] = useState<Material | "new" | null>(null);
  const selectedClass = classId || options?.classes[0]?.id || classes[0]?.id || "";
  const canAdd = can(["material.upload", "homework.post_on_behalf"]) && Boolean(options?.classes.length);

  const { data, isLoading } = useQuery({
    queryKey: ["materials", selectedClass],
    queryFn: () => api.get<Material[]>("/materials", { classId: selectedClass }),
    enabled: Boolean(selectedClass),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/materials/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["materials"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const bySubject = new Map<string, Material[]>();
  for (const m of data ?? []) bySubject.set(m.subject.name, [...(bySubject.get(m.subject.name) ?? []), m]);

  return (
    <div>
      <PageHeader
        title="Study materials"
        description="Notes, slides, worksheets and video links for each class. Parents and students open them in the app."
        actions={canAdd && <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>Add material</Button>}
      />
      <Select value={selectedClass} onChange={(e) => setClassId(e.target.value)} className="mb-4 w-44" aria-label="Class">
        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>

      {isLoading ? (
        <Spinner />
      ) : !bySubject.size ? (
        <Card><EmptyState icon={<Library className="size-8" />} title="No materials for this class yet" action={canAdd && <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>Add material</Button>} /></Card>
      ) : (
        <div className="space-y-5">
          {[...bySubject].map(([subjectName, items]) => (
            <Card key={subjectName} title={subjectName} padded={false}>
              <ul className="divide-y divide-slate-100">
                {items.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-start gap-4 px-5 py-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">{m.title}</span>
                        <Badge>{m.section ? `Section ${m.section.name}` : "All sections"}</Badge>
                      </p>
                      {m.description && <p className="whitespace-pre-line text-sm text-slate-600">{m.description}</p>}
                      {m.link && (
                        <a href={m.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
                          <ExternalLink className="size-3.5" /> {m.link.replace(/^https?:\/\//, "").slice(0, 60)}
                        </a>
                      )}
                      <AttachmentLinks files={m.attachments} />
                      <p className="text-xs text-slate-500">{m.postedBy.fullName} · {formatDate(m.createdAt.slice(0, 10))}</p>
                    </div>
                    {m.canManage && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(m)} aria-label="Edit" />
                        <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => confirm(`Delete "${m.title}"?`) && remove.mutate(m.id)} aria-label="Delete" />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
      {editing && <MaterialModal material={editing === "new" ? null : editing} defaultClassId={selectedClass} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MaterialModal({ material, defaultClassId, onClose }: { material: Material | null; defaultClassId: string; onClose: () => void }) {
  const { data: options } = usePostingOptions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const startClass = options?.classes.some((c) => c.id === defaultClassId) ? defaultClassId : options?.classes[0]?.id ?? "";
  const [form, setForm] = useState({
    classId: material?.class.id ?? startClass,
    sectionId: material?.section?.id ?? "",
    subjectId: material?.subject.id ?? "",
    title: material?.title ?? "",
    description: material?.description ?? "",
    link: material?.link ?? "",
    notifyParents: false,
  });
  const [files, setFiles] = useState<Omit<Attachment, "url">[]>(material?.attachments ?? []);
  const [error, setError] = useState<string | null>(null);
  const schoolClass = options?.classes.find((c) => c.id === form.classId);

  const save = useMutation({
    mutationFn: () => {
      const common = { title: form.title, description: form.description || null, link: form.link || null, attachments: files.map((f) => f.key) };
      return material
        ? api.patch(`/materials/${material.id}`, common)
        : api.post("/materials", { ...common, classId: form.classId, sectionId: form.sectionId || null, subjectId: form.subjectId, notifyParents: form.notifyParents });
    },
    onSuccess: async () => {
      toast.success(material ? "Material updated" : "Material added");
      await queryClient.invalidateQueries({ queryKey: ["materials"] });
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const ready = form.title.trim().length >= 2 && (material || form.subjectId) && (files.length || form.link || form.description);
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={material ? "Edit material" : "Add material"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!ready} loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        {!material && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Class">
              <Select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value, subjectId: "", sectionId: "" })}>
                {options?.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Subject" required>
              <Select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
                <option value="">Choose…</option>
                {schoolClass?.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="For">
              <Select value={form.sectionId} onChange={(e) => setForm({ ...form, sectionId: e.target.value })}>
                <option value="">All sections</option>
                {schoolClass?.sections.map((s) => <option key={s.id} value={s.id}>Section {s.name}</option>)}
              </Select>
            </Field>
          </div>
        )}
        <Field label="Title" required>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Chapter 3 notes: Algebra" maxLength={200} autoFocus />
        </Field>
        <Field label="Description">
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} maxLength={5000} />
        </Field>
        <Field label="Video or web link" hint="e.g. a YouTube video">
          <Input type="url" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://" />
        </Field>
        <Field label="Files">
          <AttachmentPicker value={files} onChange={setFiles} purpose="material-file" />
        </Field>
        {!material && <Checkbox label="Notify parents" checked={form.notifyParents} onChange={(e) => setForm({ ...form, notifyParents: e.target.checked })} />}
      </div>
    </Modal>
  );
}
