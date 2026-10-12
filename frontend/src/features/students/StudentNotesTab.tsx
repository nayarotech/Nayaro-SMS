import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, NotebookPen, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { DateInput } from "@/components/ui/DateInput";
import { Badge, Card, EmptyState, Spinner } from "@/components/ui/display";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { applyApiErrors, errorMessage } from "@/lib/forms";
import { useFormatDate } from "@/lib/use-format-date";
import { NOTE_CATEGORY, type NoteCategory } from "./students.api";

interface Note {
  id: string;
  category: NoteCategory;
  title: string;
  body: string | null;
  date: string;
  sharedWithParents: boolean;
  author: string;
  createdAt: string;
  canEdit: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Achievements, discipline, counselling and health notes. Shared notes appear in the parent app. */
export function StudentNotesTab({ studentId, studentName }: { studentId: string; studentName: string }) {
  const formatDate = useFormatDate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<NoteCategory | "">("");
  const [editing, setEditing] = useState<Note | "new" | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["student-notes", studentId, category],
    queryFn: () => api.get<{ canAdd: boolean; items: Note[] }>(`/students/${studentId}/notes`, { category: category || undefined }),
  });
  const refresh = () => Promise.all(["student-notes", "student-record"].map((key) => queryClient.invalidateQueries({ queryKey: [key, studentId] })));

  const remove = useMutation({
    mutationFn: (noteId: string) => api.delete(`/students/${studentId}/notes/${noteId}`),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card
      title={
        <Select value={category} onChange={(e) => setCategory(e.target.value as NoteCategory | "")} className="h-8 w-44 text-sm" aria-label="Filter notes">
          <option value="">All notes</option>
          {(Object.keys(NOTE_CATEGORY) as NoteCategory[]).map((c) => <option key={c} value={c}>{NOTE_CATEGORY[c].label}</option>)}
        </Select>
      }
      actions={data?.canAdd && <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>Add note</Button>}
    >
      {isLoading || !data ? (
        <Spinner />
      ) : !data.items.length ? (
        <EmptyState icon={<NotebookPen className="size-8" />} title="No notes yet" description="Record achievements, discipline incidents, counselling sessions and health notes. Share a note to show it to parents in the app." />
      ) : (
        <ol className="space-y-4">
          {data.items.map((note) => (
            <li key={note.id} className="border-l-2 border-slate-200 pl-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={NOTE_CATEGORY[note.category].tone}>{NOTE_CATEGORY[note.category].label}</Badge>
                <span className="font-medium text-slate-900">{note.title}</span>
                {note.sharedWithParents && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Eye className="size-3.5" /> Shared with parents</span>
                )}
                {note.canEdit && (
                  <span className="ml-auto flex gap-1">
                    <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Edit note" onClick={() => setEditing(note)}><Pencil className="size-3.5" /></button>
                    <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label="Delete note" onClick={() => confirm(`Delete "${note.title}"?`) && remove.mutate(note.id)}><Trash2 className="size-3.5" /></button>
                  </span>
                )}
              </div>
              {note.body && <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{note.body}</p>}
              <p className="mt-1 text-xs text-slate-500">{formatDate(note.date)} · {note.author}</p>
            </li>
          ))}
        </ol>
      )}
      {editing && <NoteModal studentId={studentId} studentName={studentName} note={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </Card>
  );
}

function NoteModal({ studentId, studentName, note, onClose, onSaved }: { studentId: string; studentName: string; note: Note | null; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [formError, setFormError] = useState<string | null>(null);
  const { register, control, handleSubmit, setError, formState } = useForm({
    defaultValues: {
      category: note?.category ?? ("ACHIEVEMENT" as NoteCategory),
      title: note?.title ?? "",
      body: note?.body ?? "",
      date: note?.date ?? today(),
      sharedWithParents: note?.sharedWithParents ?? false,
    },
  });
  const shared = useWatch({ control, name: "sharedWithParents" });

  const submit = handleSubmit(async (values) => {
    try {
      const body = { ...values, body: values.body || null };
      if (note) await api.patch(`/students/${studentId}/notes/${note.id}`, body);
      else await api.post(`/students/${studentId}/notes`, body);
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
      title={note ? "Edit note" : `Add a note about ${studentName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={formState.isSubmitting} onClick={() => void submit()}>Save</Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <FormError message={formError} />
        <Field label="Type">
          <Select {...register("category")}>
            {(Object.keys(NOTE_CATEGORY) as NoteCategory[]).map((c) => <option key={c} value={c}>{NOTE_CATEGORY[c].label}</option>)}
          </Select>
        </Field>
        <Field label="Date">
          <Controller control={control} name="date" render={({ field }) => <DateInput value={field.value} onChange={field.onChange} />} />
        </Field>
        <Field label="Title" required className="sm:col-span-2" error={formState.errors.title?.message}>
          <Input {...register("title", { required: "Required", minLength: { value: 2, message: "Too short" } })} placeholder="e.g. First in the inter-school quiz" maxLength={150} />
        </Field>
        <Field label="Details" className="sm:col-span-2">
          <Textarea {...register("body")} rows={4} maxLength={5000} />
        </Field>
        <div className="sm:col-span-2">
          <Checkbox label="Share with parents (shown in the parent app, and they get a notification)" {...register("sharedWithParents")} />
          {shared && !note?.sharedWithParents && <p className="mt-1 text-xs text-amber-700">Parents will be notified when you save.</p>}
        </div>
      </form>
    </Modal>
  );
}
