import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpenCheck, CheckCheck, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DateInput } from "@/components/ui/DateInput";
import { Badge, Card, EmptyState, PageHeader, Spinner } from "@/components/ui/display";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Table";
import { useToast } from "@/components/ui/toast";
import { api, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { todayAd } from "@/lib/dates";
import { errorMessage } from "@/lib/forms";
import { useFormatDate } from "@/lib/use-format-date";
import { AttachmentLinks, AttachmentPicker } from "./Attachments";
import { HOMEWORK_STATUS, usePostingOptions, type Attachment, type Homework, type HomeworkStatus } from "./learning.api";

/** Homework: what's been given, to whom, when it's due, and who did it. */
export function HomeworkPage() {
  const { can } = useAuth();
  const formatDate = useFormatDate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: options } = usePostingOptions();
  const [page, setPage] = useState(1);
  const [classId, setClassId] = useState("");
  const [mine, setMine] = useState(false);
  const [editing, setEditing] = useState<Homework | "new" | null>(null);
  const [checking, setChecking] = useState<Homework | null>(null);
  const seesAll = can(["homework.post_on_behalf", "student.record.view"]);
  const canPost = can(["homework.post", "homework.post_on_behalf"]) && Boolean(options?.classes.length);

  const { data, isLoading } = useQuery({
    queryKey: ["homework", page, classId, mine],
    queryFn: () => api.get<Paginated<Homework>>("/homework", { page, pageSize: 20, classId: classId || undefined, mine: mine || undefined }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/homework/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["homework"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const today = todayAd();
  return (
    <div>
      <PageHeader
        title="Homework"
        description="Post homework for your classes — parents see it in the app. After the due date, tick who did it."
        actions={canPost && <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>Post homework</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={classId} onChange={(e) => { setClassId(e.target.value); setPage(1); }} className="w-44" aria-label="Class">
          <option value="">All classes</option>
          {options?.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        {seesAll && <Checkbox label="Only mine" checked={mine} onChange={(e) => { setMine(e.target.checked); setPage(1); }} />}
      </div>

      {isLoading ? (
        <Spinner />
      ) : !data?.items.length ? (
        <Card>
          <EmptyState
            icon={<BookOpenCheck className="size-8" />}
            title="No homework yet"
            description={canPost ? "Post homework for a class; parents get a notification and see it in the app." : "Homework posted by teachers appears here."}
            action={canPost && <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>Post homework</Button>}
          />
        </Card>
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-slate-100">
            {data.items.map((h) => {
              const overdue = h.dueDate < today;
              const dueToday = h.dueDate === today;
              return (
                <li key={h.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                  <div className="w-28 shrink-0 text-sm">
                    <p className={cn("font-medium", dueToday ? "text-amber-700" : overdue ? "text-slate-500" : "text-slate-900")}>{formatDate(h.dueDate)}</p>
                    <p className="text-xs text-slate-500">{dueToday ? "Due today" : overdue ? "Past" : "Due"}</p>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="flex flex-wrap items-center gap-2">
                      <Badge tone="brand">{h.subject.name}</Badge>
                      <span className="text-sm text-slate-500">{h.section.className} {h.section.name} · {h.teacher.fullName}</span>
                    </p>
                    <p className="font-medium text-slate-900">{h.title}</p>
                    {h.description && <p className="line-clamp-2 whitespace-pre-line text-sm text-slate-600">{h.description}</p>}
                    <AttachmentLinks files={h.attachments} />
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {h.students !== undefined && (
                      <span className={cn("text-xs tabular-nums", h.checked >= (h.students ?? 0) && h.checked > 0 ? "text-green-700" : "text-slate-500")}>
                        {h.checked}/{h.students} checked
                      </span>
                    )}
                    {h.canManage && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="secondary" icon={<ListChecks className="size-3.5" />} onClick={() => setChecking(h)}>Check</Button>
                        <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(h)} aria-label="Edit" />
                        <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => confirm(`Delete "${h.title}" for ${h.section.className} ${h.section.name}?`) && remove.mutate(h.id)} aria-label="Delete" />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
        </Card>
      )}

      {editing && <HomeworkModal homework={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {checking && <CheckModal homework={checking} onClose={() => setChecking(null)} />}
    </div>
  );
}

function HomeworkModal({ homework, onClose }: { homework: Homework | null; onClose: () => void }) {
  const { data: options } = usePostingOptions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    classId: homework?.section.classId ?? options?.classes[0]?.id ?? "",
    subjectId: homework?.subject.id ?? "",
    sectionIds: homework ? [homework.section.id] : ([] as string[]),
    title: homework?.title ?? "",
    description: homework?.description ?? "",
    dueDate: homework?.dueDate ?? "",
    teacherId: "",
  });
  const [files, setFiles] = useState<Omit<Attachment, "url">[]>(homework?.attachments ?? []);
  const [error, setError] = useState<string | null>(null);

  const schoolClass = options?.classes.find((c) => c.id === form.classId);
  const subject = schoolClass?.subjects.find((s) => s.id === form.subjectId);
  const sections = schoolClass?.sections.filter((s) => subject?.sectionIds.includes(s.id)) ?? [];

  const save = useMutation({
    mutationFn: () =>
      homework
        ? api.patch(`/homework/${homework.id}`, { title: form.title, description: form.description || null, dueDate: form.dueDate, attachments: files.map((f) => f.key) })
        : api.post("/homework", {
            sectionIds: form.sectionIds,
            subjectId: form.subjectId,
            title: form.title,
            description: form.description || null,
            dueDate: form.dueDate,
            attachments: files.map((f) => f.key),
            teacherId: form.teacherId || undefined,
          }),
    onSuccess: async () => {
      toast.success(homework ? "Homework updated" : "Homework posted — parents have been notified");
      await queryClient.invalidateQueries({ queryKey: ["homework"] });
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const ready = form.title.trim().length >= 2 && form.dueDate && (homework || (form.subjectId && form.sectionIds.length));
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={homework ? "Edit homework" : "Post homework"}
      description={homework ? `${homework.subject.name} · ${homework.section.className} ${homework.section.name}` : "Parents of every student in the chosen sections (who take the subject) get a notification."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!ready} loading={save.isPending} onClick={() => save.mutate()}>{homework ? "Save" : "Post"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        {!homework && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Class">
              <Select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value, subjectId: "", sectionIds: [] })}>
                {options?.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Subject" required>
              <Select value={form.subjectId} onChange={(e) => {
                const s = schoolClass?.subjects.find((x) => x.id === e.target.value);
                setForm({ ...form, subjectId: e.target.value, sectionIds: s?.sectionIds.length === 1 ? s.sectionIds : [] });
              }}>
                <option value="">Choose…</option>
                {schoolClass?.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            {subject && (
              <Field label="Sections" required className="sm:col-span-2">
                <div className="flex flex-wrap gap-2">
                  {sections.length > 1 && (
                    <Checkbox label="All" checked={form.sectionIds.length === sections.length} onChange={(e) => setForm({ ...form, sectionIds: e.target.checked ? sections.map((s) => s.id) : [] })} />
                  )}
                  {sections.map((s) => (
                    <Checkbox
                      key={s.id}
                      label={`${schoolClass?.name} ${s.name}`}
                      checked={form.sectionIds.includes(s.id)}
                      onChange={(e) => setForm({ ...form, sectionIds: e.target.checked ? [...form.sectionIds, s.id] : form.sectionIds.filter((id) => id !== s.id) })}
                    />
                  ))}
                </div>
              </Field>
            )}
            {options?.onBehalf && (
              <Field label="On behalf of" hint="Leave as yourself unless you're posting for a teacher" className="sm:col-span-2">
                <Select value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>
                  <option value="">Myself</option>
                  {options.teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                </Select>
              </Field>
            )}
          </div>
        )}
        <Field label="Homework" required>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Exercise 4.2, questions 1–10" maxLength={200} autoFocus />
        </Field>
        <Field label="Details">
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} maxLength={5000} placeholder="Instructions for students and parents (optional)" />
        </Field>
        <Field label="Due date" required>
          <DateInput value={form.dueDate} onChange={(dueDate) => setForm({ ...form, dueDate })} />
        </Field>
        <Field label="Attachments">
          <AttachmentPicker value={files} onChange={setFiles} purpose="homework-file" />
        </Field>
      </div>
    </Modal>
  );
}

interface Roster {
  students: { studentId: string; name: string; rollNo: number | null; status: HomeworkStatus | null; remark: string | null }[];
}

/** Tick who did the homework. Parents are told when it wasn't done. */
function CheckModal({ homework, onClose }: { homework: Homework; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ["homework-checks", homework.id], queryFn: () => api.get<Roster>(`/homework/${homework.id}/checks`) });
  return (
    <Modal open onClose={onClose} size="lg" title={`Check: ${homework.title}`} description={`${homework.subject.name} · ${homework.section.className} ${homework.section.name}. Parents are notified when homework is marked "Not done".`}>
      {!data ? <Spinner /> : <CheckList key={homework.id} homework={homework} roster={data} onSaved={async () => {
        toast.success("Saved");
        await queryClient.invalidateQueries({ queryKey: ["homework"] });
        onClose();
      }} />}
    </Modal>
  );
}

function CheckList({ homework, roster, onSaved }: { homework: Homework; roster: Roster; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [rows, setRows] = useState(() => Object.fromEntries(roster.students.map((s) => [s.studentId, { status: s.status, remark: s.remark ?? "" }])));
  const [busy, setBusy] = useState(false);
  const set = (id: string, change: Partial<{ status: HomeworkStatus | null; remark: string }>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...change } }));

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/homework/${homework.id}/checks`, { checks: roster.students.map((s) => ({ studentId: s.studentId, status: rows[s.studentId].status, remark: rows[s.studentId].remark || null })) });
      await onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!roster.students.length) return <EmptyState title="No students in this class take this subject" />;
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="secondary" icon={<CheckCheck className="size-4" />} onClick={() => setRows((r) => Object.fromEntries(Object.entries(r).map(([id, row]) => [id, { ...row, status: row.status ?? "DONE" }])))}>
          Mark everyone else done
        </Button>
      </div>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {roster.students.map((s) => (
          <li key={s.studentId} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <span className="w-8 text-center text-sm font-semibold text-brand">{s.rollNo ?? "–"}</span>
            <span className="min-w-32 flex-1 text-sm font-medium text-slate-900">{s.name}</span>
            <div className="flex gap-1">
              {(Object.keys(HOMEWORK_STATUS) as HomeworkStatus[]).map((status) => {
                const active = rows[s.studentId].status === status;
                const tone = HOMEWORK_STATUS[status].tone;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => set(s.studentId, { status: active ? null : status })}
                    className={cn(
                      "h-9 rounded-lg border px-3 text-sm font-medium",
                      active ? (tone === "green" ? "border-green-600 bg-green-600 text-white" : tone === "amber" ? "border-amber-500 bg-amber-500 text-white" : "border-red-600 bg-red-600 text-white") : "border-slate-200 text-slate-600 hover:bg-slate-50",
                    )}
                    aria-pressed={active}
                  >
                    {HOMEWORK_STATUS[status].label}
                  </button>
                );
              })}
            </div>
            {rows[s.studentId].status && rows[s.studentId].status !== "DONE" && (
              <Input value={rows[s.studentId].remark} onChange={(e) => set(s.studentId, { remark: e.target.value })} placeholder="Note for parents (optional)" className="h-9 w-full sm:w-56" maxLength={200} />
            )}
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Button loading={busy} onClick={() => void save()}>Save</Button>
      </div>
    </div>
  );
}
