import clsx from "clsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Card, EmptyState, PageHeader } from "@/components/ui/display";
import { Checkbox, Field, FormError, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { applyApiErrors, errorMessage } from "@/lib/forms";
import { useClasses, usePeriods, useTeachers, type Period } from "./academic.api";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface TimetableEntry {
  id: string;
  dayOfWeek: number;
  periodId: string;
  subject: { id: string; name: string } | null;
  teacher: { id: string; fullName: string } | null;
}

export function TimetablePage() {
  const { data: classes = [] } = useClasses();
  const { data: periods = [] } = usePeriods();
  const { user, can } = useAuth();
  const [chosenSectionId, setSectionId] = useState("");
  const [editingPeriod, setEditingPeriod] = useState<Period | "new" | null>(null);
  const [editingSlot, setEditingSlot] = useState<{ day: number; period: Period } | null>(null);

  const sections = useMemo(
    () => classes.flatMap((c) => c.sections.map((s) => ({ ...s, label: `${c.name} ${s.name}`, subjects: c.subjects }))),
    [classes],
  );
  const sectionId = chosenSectionId || sections[0]?.id || "";

  const section = sections.find((s) => s.id === sectionId);
  const workingDays = ((user?.settings?.["academic.workingDays"] as string[]) ?? ["0", "1", "2", "3", "4", "5"]).map(Number);

  const timetable = useQuery({
    queryKey: ["timetable", sectionId],
    queryFn: () => api.get<{ entries: TimetableEntry[] }>(`/timetable/sections/${sectionId}`),
    enabled: Boolean(sectionId),
    retry: false,
  });
  const cell = (day: number, periodId: string) => timetable.data?.entries.find((e) => e.dayOfWeek === day && e.periodId === periodId);

  return (
    <div>
      <PageHeader
        title="Timetable"
        description="Set up the school's periods once, then fill in each section's weekly timetable. Working days come from Settings → Academic."
      />

      <div className="grid gap-6 xl:grid-cols-[18rem_1fr]">
        <Card
          title="Periods"
          className="h-fit"
          actions={can("academic.manage") && <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setEditingPeriod("new")}>Add</Button>}
        >
          {periods.length === 0 ? (
            <p className="text-sm text-slate-500">No periods yet. Add your bell schedule, e.g. Period 1 10:00–10:45.</p>
          ) : (
            <ul className="space-y-1">
              {periods.map((p) => (
                <li key={p.id} className="group flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
                  <span className={clsx(p.isBreak && "text-slate-400 italic")}>{p.name}</span>
                  <span className="flex items-center gap-2 text-xs tabular-nums text-slate-500">
                    {p.startTime}–{p.endTime}
                    {can("academic.manage") && (
                      <button className="opacity-0 group-hover:opacity-100" onClick={() => setEditingPeriod(p)} aria-label="Edit period">
                        <Pencil className="size-3.5" />
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          padded={false}
          title={
            <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="h-8 w-48">
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </Select>
          }
        >
          {!section || periods.length === 0 ? (
            <EmptyState icon={<Clock className="size-8" />} title={!section ? "Add classes and sections first" : "Add periods first"} />
          ) : timetable.error ? (
            <EmptyState title="Set up an academic year first" description={errorMessage(timetable.error)} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="w-28 border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-500">Day</th>
                    {periods.map((p) => (
                      <th key={p.id} className="border-b border-l border-slate-200 bg-slate-50 px-2 py-2 text-left text-xs font-medium text-slate-500">
                        {p.name}
                        <span className="block font-normal text-slate-400">{p.startTime}–{p.endTime}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {workingDays.map((day) => (
                    <tr key={day}>
                      <td className="border-b border-slate-100 px-3 py-2 font-medium text-slate-700">{DAYS[day]}</td>
                      {periods.map((p) => {
                        const entry = cell(day, p.id);
                        if (p.isBreak) return <td key={p.id} className="border-b border-l border-slate-100 bg-slate-50 text-center text-xs italic text-slate-400">Break</td>;
                        return (
                          <td key={p.id} className="border-b border-l border-slate-100 p-1">
                            <button
                              disabled={!can("timetable.manage")}
                              onClick={() => setEditingSlot({ day, period: p })}
                              className={clsx(
                                "h-14 w-full rounded-md px-2 text-left text-xs",
                                entry ? "bg-brand-soft hover:ring-1 hover:ring-brand" : "text-slate-300 hover:bg-slate-50 hover:text-slate-500",
                              )}
                            >
                              {entry ? (
                                <>
                                  <span className="block font-medium text-slate-900">{entry.subject?.name ?? "—"}</span>
                                  <span className="block truncate text-slate-500">{entry.teacher?.fullName ?? "No teacher"}</span>
                                </>
                              ) : (
                                "+"
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {editingPeriod && <PeriodModal period={editingPeriod === "new" ? null : editingPeriod} nextOrder={periods.length + 1} onClose={() => setEditingPeriod(null)} />}
      {editingSlot && section && (
        <SlotModal
          sectionId={section.id}
          sectionLabel={section.label}
          subjects={section.subjects}
          day={editingSlot.day}
          period={editingSlot.period}
          entry={cell(editingSlot.day, editingSlot.period.id)}
          onClose={() => setEditingSlot(null)}
        />
      )}
    </div>
  );
}

function PeriodModal({ period, nextOrder, onClose }: { period: Period | null; nextOrder: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm({
    defaultValues: period ?? { name: `Period ${nextOrder}`, startTime: "", endTime: "", order: nextOrder, isBreak: false },
  });

  const onSubmit = handleSubmit(async (values) => {
    const body = { name: values.name, startTime: values.startTime, endTime: values.endTime, order: Number(values.order), isBreak: values.isBreak };
    try {
      if (period) await api.patch(`/timetable/periods/${period.id}`, body);
      else await api.post("/timetable/periods", body);
      await queryClient.invalidateQueries({ queryKey: ["periods"] });
      onClose();
    } catch (e) {
      setFormError(applyApiErrors(e, setError));
    }
  });

  const remove = async () => {
    if (!period || !confirm(`Delete ${period.name}? It will be removed from every timetable.`)) return;
    try {
      await api.delete(`/timetable/periods/${period.id}`);
      await queryClient.invalidateQueries({ queryKey: ["periods"] });
      await queryClient.invalidateQueries({ queryKey: ["timetable"] });
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={period ? `Edit ${period.name}` : "New period"}
      footer={
        <>
          {period && <Button variant="ghost" className="mr-auto" icon={<Trash2 className="size-4" />} onClick={() => void remove()}>Delete</Button>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={formState.isSubmitting} onClick={() => void onSubmit()}>Save</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <FormError message={formError} />
        <Field label="Name" required className="sm:col-span-2">
          <Input {...register("name", { required: true })} />
        </Field>
        <Field label="Starts" required error={formState.errors.startTime?.message}>
          <Input type="time" {...register("startTime", { required: "Required" })} />
        </Field>
        <Field label="Ends" required error={formState.errors.endTime?.message}>
          <Input type="time" {...register("endTime", { required: "Required" })} />
        </Field>
        <Field label="Order">
          <Input type="number" {...register("order")} />
        </Field>
        <div className="flex items-end pb-2">
          <Checkbox label="This is a break (tiffin, lunch…)" {...register("isBreak")} />
        </div>
      </form>
    </Modal>
  );
}

function SlotModal(props: {
  sectionId: string;
  sectionLabel: string;
  subjects: { id: string; name: string }[];
  day: number;
  period: Period;
  entry?: TimetableEntry;
  onClose: () => void;
}) {
  const { data: teachers = [] } = useTeachers();
  const queryClient = useQueryClient();
  const [subjectId, setSubjectId] = useState(props.entry?.subject?.id ?? "");
  const [teacherId, setTeacherId] = useState(props.entry?.teacher?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (clear: boolean) =>
      api.put("/timetable/slot", {
        sectionId: props.sectionId,
        dayOfWeek: props.day,
        periodId: props.period.id,
        subjectId: clear ? null : subjectId || null,
        teacherId: clear ? null : teacherId || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["timetable", props.sectionId] });
      props.onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Modal
      open
      onClose={props.onClose}
      title={`${props.sectionLabel} · ${DAYS[props.day]} · ${props.period.name}`}
      description={`${props.period.startTime}–${props.period.endTime}`}
      footer={
        <>
          {props.entry && <Button variant="ghost" className="mr-auto" onClick={() => save.mutate(true)}>Clear</Button>}
          <Button variant="secondary" onClick={props.onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate(false)}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <Field label="Subject">
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">—</option>
            {props.subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Teacher" hint="You'll be warned if this teacher is already busy in this period.">
          <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">—</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.fullName}</option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
