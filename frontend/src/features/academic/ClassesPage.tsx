import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Layers, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Badge, Card, EmptyState, PageHeader, Spinner } from "@/components/ui/display";
import { Field, FormError, Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { applyApiErrors, errorMessage } from "@/lib/forms";
import { useClasses, useSubjects, type SchoolClass, type Section } from "./academic.api";

type Editing =
  | { kind: "class"; schoolClass: SchoolClass | null }
  | { kind: "section"; schoolClass: SchoolClass; section: Section | null }
  | { kind: "subjects"; schoolClass: SchoolClass };

export function ClassesPage() {
  const { data: classes, isLoading } = useClasses();
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Editing | null>(null);
  const canManage = can("academic.manage");

  const refresh = () => Promise.all(["classes", "subjects", "assignments", "dashboard"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));

  const remove = useMutation({
    mutationFn: (path: string) => api.delete(path),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading) return <Spinner />;
  const nextOrder = Math.max(0, ...(classes ?? []).map((c) => c.order)) + 1;

  return (
    <div>
      <PageHeader
        title="Classes & sections"
        description="Classes are listed in promotion order: students move from one class to the next one below it."
        actions={canManage && <Button icon={<Plus className="size-4" />} onClick={() => setEditing({ kind: "class", schoolClass: null })}>New class</Button>}
      />

      {!classes?.length ? (
        <Card>
          <EmptyState icon={<Layers className="size-8" />} title="No classes yet" description="Add classes such as Nursery, LKG, UKG, Grade 1 … Grade 10, each with its sections." />
        </Card>
      ) : (
        <div className="space-y-4">
          {classes.map((schoolClass) => (
            <Card
              key={schoolClass.id}
              title={
                <span className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-500">{schoolClass.order}</span>
                  {schoolClass.name}
                </span>
              }
              actions={
                canManage && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing({ kind: "class", schoolClass })}>Edit</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 className="size-3.5" />}
                      onClick={() => confirm(`Delete ${schoolClass.name} and its sections?`) && remove.mutate(`/classes/${schoolClass.id}`)}
                    />
                  </div>
                )
              }
            >
              <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Sections</p>
                  <div className="flex flex-wrap gap-2">
                    {schoolClass.sections.map((section) => (
                      <div key={section.id} className="group min-w-36 rounded-lg border border-slate-200 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-900">Section {section.name}</span>
                          {canManage && (
                            <span className="flex gap-0.5 opacity-60 group-hover:opacity-100">
                              <button className="rounded p-0.5 hover:bg-slate-100" onClick={() => setEditing({ kind: "section", schoolClass, section })} aria-label="Edit section">
                                <Pencil className="size-3.5" />
                              </button>
                              <button
                                className="rounded p-0.5 hover:bg-slate-100"
                                aria-label="Delete section"
                                onClick={() => confirm(`Delete section ${section.name}?`) && remove.mutate(`/sections/${section.id}`)}
                              >
                                <X className="size-3.5" />
                              </button>
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          {section.studentCount} students{section.capacity ? ` / ${section.capacity}` : ""}
                          {section.room && ` · ${section.room}`}
                        </p>
                        <p className="text-xs text-slate-500">{section.classTeacher ? `CT: ${section.classTeacher.fullName}` : "No class teacher"}</p>
                      </div>
                    ))}
                    {canManage && (
                      <button
                        onClick={() => setEditing({ kind: "section", schoolClass, section: null })}
                        className="flex min-w-24 items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-brand hover:text-brand"
                      >
                        <Plus className="size-4" /> Section
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Subjects ({schoolClass.subjects.length})</p>
                    {canManage && (
                      <button className="text-xs font-medium text-brand hover:underline" onClick={() => setEditing({ kind: "subjects", schoolClass })}>
                        Choose subjects
                      </button>
                    )}
                  </div>
                  {schoolClass.subjects.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {schoolClass.subjects.map((s) => (
                        <Badge key={s.id} tone={s.isOptional ? "amber" : "gray"}>
                          {s.name}
                          {s.isOptional && ` (${s.optionGroup ?? "optional"})`}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">No subjects chosen yet.</p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing?.kind === "class" && <ClassModal schoolClass={editing.schoolClass} nextOrder={nextOrder} onClose={() => setEditing(null)} onSaved={refresh} />}
      {editing?.kind === "section" && <SectionModal schoolClass={editing.schoolClass} section={editing.section} onClose={() => setEditing(null)} onSaved={refresh} />}
      {editing?.kind === "subjects" && <ClassSubjectsModal schoolClass={editing.schoolClass} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  );
}

function ClassModal({ schoolClass, nextOrder, onClose, onSaved }: { schoolClass: SchoolClass | null; nextOrder: number; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm({
    defaultValues: { name: schoolClass?.name ?? "", order: schoolClass?.order ?? nextOrder, sections: "A" },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (schoolClass) {
        await api.patch(`/classes/${schoolClass.id}`, { name: values.name, order: Number(values.order) });
      } else {
        await api.post("/classes", { name: values.name, order: Number(values.order), sections: values.sections.split(",").map((s) => s.trim()) });
      }
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
      title={schoolClass ? `Edit ${schoolClass.name}` : "New class"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={formState.isSubmitting} onClick={() => void onSubmit()}>Save</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <FormError message={formError} />
        <Field label="Class name" required error={formState.errors.name?.message}>
          <Input {...register("name", { required: "Required" })} placeholder="e.g. Grade 1" autoFocus />
        </Field>
        <Field label="Order" required hint="Position in the promotion sequence (Nursery = 1, LKG = 2 …)">
          <Input type="number" {...register("order", { required: true })} />
        </Field>
        {!schoolClass && (
          <Field label="Sections" hint="Comma separated, e.g. A, B, C">
            <Input {...register("sections")} />
          </Field>
        )}
      </form>
    </Modal>
  );
}

function SectionModal({ schoolClass, section, onClose, onSaved }: { schoolClass: SchoolClass; section: Section | null; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm({
    defaultValues: { name: section?.name ?? "", capacity: section?.capacity?.toString() ?? "", room: section?.room ?? "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    const body = { name: values.name, capacity: values.capacity ? Number(values.capacity) : null, room: values.room || null };
    try {
      if (section) await api.patch(`/sections/${section.id}`, body);
      else await api.post(`/classes/${schoolClass.id}/sections`, body);
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
      title={section ? `Edit ${schoolClass.name} ${section.name}` : `New section in ${schoolClass.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={formState.isSubmitting} onClick={() => void onSubmit()}>Save</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-3">
        <FormError message={formError} />
        <Field label="Name" required error={formState.errors.name?.message}>
          <Input {...register("name", { required: "Required" })} placeholder="A" autoFocus />
        </Field>
        <Field label="Capacity">
          <Input type="number" {...register("capacity")} />
        </Field>
        <Field label="Room">
          <Input {...register("room")} />
        </Field>
      </form>
    </Modal>
  );
}

interface Choice {
  isOptional: boolean;
  optionGroup: string;
}

const DEFAULT_GROUP = "Optional I";

/** The class's curriculum. Optional subjects go in a group; each student picks one per group. */
function ClassSubjectsModal({ schoolClass, onClose, onSaved }: { schoolClass: SchoolClass; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const { data: subjects = [] } = useSubjects();
  const toast = useToast();
  const [chosen, setChosen] = useState<Map<string, Choice>>(
    new Map(schoolClass.subjects.map((s) => [s.id, { isOptional: s.isOptional, optionGroup: s.optionGroup ?? DEFAULT_GROUP }])),
  );
  const [busy, setBusy] = useState(false);
  const groups = [...new Set([...chosen.values()].filter((c) => c.isOptional).map((c) => c.optionGroup.trim() || DEFAULT_GROUP))];

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/classes/${schoolClass.id}/subjects`, {
        subjects: [...chosen].map(([subjectId, c]) => ({ subjectId, isOptional: c.isOptional, optionGroup: c.isOptional ? c.optionGroup.trim() || DEFAULT_GROUP : null })),
      });
      await onSaved();
      toast.success("Subjects saved");
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const update = (id: string, change: Partial<Choice> | null) => {
    const next = new Map(chosen);
    if (change === null) next.delete(id);
    else next.set(id, { ...(next.get(id) ?? { isOptional: false, optionGroup: groups[0] ?? DEFAULT_GROUP }), ...change });
    setChosen(next);
  };
  const allChosen = subjects.length > 0 && subjects.every((s) => chosen.has(s.id));

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Subjects for ${schoolClass.name}`}
      description="Tick the subjects this class studies. Mark a subject optional and give it a group (e.g. Optional I: Computer or Account) — each student picks one subject per group."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={() => void save()}>Save</Button>
        </>
      }
    >
      {subjects.length === 0 ? (
        <EmptyState icon={<BookOpen className="size-8" />} title="No subjects yet" description="Create subjects first under Academic setup → Subjects." />
      ) : (
        <>
          <label className="mb-2 flex cursor-pointer items-center gap-2 border-b border-slate-200 pb-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              className="size-4 accent-brand"
              checked={allChosen}
              onChange={(e) => setChosen(e.target.checked ? new Map(subjects.map((s) => [s.id, chosen.get(s.id) ?? { isOptional: false, optionGroup: DEFAULT_GROUP }])) : new Map())}
            />
            All subjects
          </label>
          <datalist id="option-groups">
            {[...new Set([...groups, "Optional I", "Optional II"])].map((g) => <option key={g} value={g} />)}
          </datalist>
          <ul className="divide-y divide-slate-100">
            {subjects.map((subject) => {
              const choice = chosen.get(subject.id);
              return (
                <li key={subject.id} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-1.5">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4 accent-brand" checked={Boolean(choice)} onChange={(e) => update(subject.id, e.target.checked ? {} : null)} />
                    {subject.name}
                  </label>
                  {choice && (
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-slate-600">
                        <input type="checkbox" className="accent-brand" checked={choice.isOptional} onChange={(e) => update(subject.id, { isOptional: e.target.checked })} />
                        Optional
                      </label>
                      {choice.isOptional && (
                        <Input
                          list="option-groups"
                          value={choice.optionGroup}
                          onChange={(e) => update(subject.id, { optionGroup: e.target.value })}
                          className="h-8 w-36 text-xs"
                          aria-label={`Option group for ${subject.name}`}
                          maxLength={40}
                        />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {groups.length > 0 && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {groups.map((g) => `${g}: ${[...chosen].filter(([, c]) => c.isOptional && (c.optionGroup.trim() || DEFAULT_GROUP) === g).map(([id]) => subjects.find((s) => s.id === id)?.name).join(" or ")}`).join(" · ")}. Set each student's choice under Academic setup → Optional subjects.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
