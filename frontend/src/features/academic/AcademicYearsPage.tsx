import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { DateInput } from "@/components/ui/DateInput";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/display";
import { Checkbox, Field, FormError, Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { Table } from "@/components/ui/Table";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { adToBs } from "@/lib/dates";
import { applyApiErrors, errorMessage } from "@/lib/forms";
import { useFormatDate } from "@/lib/use-format-date";
import { useAcademicYears, type AcademicYear } from "./academic.api";

export function AcademicYearsPage() {
  const { data: years, isLoading } = useAcademicYears();
  const { can } = useAuth();
  const formatDate = useFormatDate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AcademicYear | "new" | null>(null);
  const canManage = can("academic.manage");

  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["academic-years"] }), queryClient.invalidateQueries({ queryKey: ["dashboard"] })]);

  const makeCurrent = useMutation({
    mutationFn: (year: AcademicYear) => api.patch(`/academic-years/${year.id}`, { isCurrent: true }),
    onSuccess: async () => {
      await refresh();
      toast.success("Current year changed");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (year: AcademicYear) => api.delete(`/academic-years/${year.id}`),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div>
      <PageHeader
        title="Academic years"
        description="Each year keeps its own enrollments, class teachers, timetable and results. The current year is used everywhere by default."
        actions={canManage && <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>New academic year</Button>}
      />
      <Card padded={false}>
        <Table
          loading={isLoading}
          rows={years}
          rowKey={(y) => y.id}
          empty={<EmptyState icon={<CalendarRange className="size-8" />} title="No academic years yet" description='Create the current year, e.g. "2082".' />}
          columns={[
            {
              header: "Year",
              cell: (y) => (
                <span className="flex items-center gap-2 font-medium text-slate-900">
                  {y.name} {y.isCurrent && <Badge tone="green">Current</Badge>}
                </span>
              ),
            },
            { header: "Starts", cell: (y) => formatDate(y.startDate) },
            { header: "Ends", cell: (y) => formatDate(y.endDate) },
            { header: "Students enrolled", cell: (y) => y.enrollmentCount ?? 0, className: "tabular-nums" },
            {
              header: "",
              className: "text-right",
              cell: (y) =>
                canManage && (
                  <div className="flex justify-end gap-1">
                    {!y.isCurrent && (
                      <Button size="sm" variant="ghost" icon={<Star className="size-3.5" />} onClick={() => makeCurrent.mutate(y)}>
                        Make current
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(y)}>
                      Edit
                    </Button>
                    {!y.isCurrent && !y.enrollmentCount && (
                      <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => confirm(`Delete ${y.name}?`) && remove.mutate(y)} />
                    )}
                  </div>
                ),
            },
          ]}
        />
      </Card>

      {editing && <YearModal year={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  );
}

interface YearForm {
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

function YearModal({ year, onClose, onSaved }: { year: AcademicYear | null; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, control, handleSubmit, setError, setValue, getValues, formState } = useForm<YearForm>({
    defaultValues: year ?? { name: "", startDate: "", endDate: "", isCurrent: false },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (year) await api.patch(`/academic-years/${year.id}`, values);
      else await api.post("/academic-years", values);
      await onSaved();
      toast.success(year ? "Academic year updated" : "Academic year created");
      onClose();
    } catch (e) {
      setFormError(applyApiErrors(e, setError));
    }
  });

  // Suggest the name from the BS start year
  const onStart = (ad: string) => {
    setValue("startDate", ad);
    if (!getValues("name") && ad) setValue("name", adToBs(ad)?.slice(0, 4) ?? "");
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={year ? `Edit ${year.name}` : "New academic year"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={formState.isSubmitting} onClick={() => void onSubmit()}>Save</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <FormError message={formError} />
        <Field label="Starts on" required error={formState.errors.startDate?.message}>
          <Controller control={control} name="startDate" rules={{ required: "Required" }} render={({ field }) => <DateInput value={field.value} onChange={onStart} />} />
        </Field>
        <Field label="Ends on" required error={formState.errors.endDate?.message}>
          <Controller control={control} name="endDate" rules={{ required: "Required" }} render={({ field }) => <DateInput value={field.value} onChange={field.onChange} />} />
        </Field>
        <Field label="Name" required error={formState.errors.name?.message} hint='Usually the BS year, e.g. "2082"'>
          <Input {...register("name", { required: "Required" })} />
        </Field>
        {!year?.isCurrent && <Checkbox label="Make this the current academic year" {...register("isCurrent")} />}
      </form>
    </Modal>
  );
}
