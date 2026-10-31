import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, LogIn, Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/Button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/display";
import { Field, FormError, Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { Pagination, Table } from "@/components/ui/Table";
import { useToast } from "@/components/ui/toast";
import { api, setActingSchoolId, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { applyApiErrors, emptyToNull, errorMessage } from "@/lib/forms";

interface School {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  studentLimit: number | null;
  createdAt: string;
  /** Active students, which is what the plan counts */
  studentCount: number;
  userCount: number;
}

/** Platform owner's view: every school on the platform. */
export function SchoolsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [planFor, setPlanFor] = useState<School | null>(null);
  const { reload } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["schools", page, search],
    queryFn: () => api.get<Paginated<School>>("/schools", { page, search }),
  });

  const toggleActive = useMutation({
    mutationFn: (school: School) => api.patch(`/schools/${school.id}`, { isActive: !school.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["schools"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const openSchool = async (school: School) => {
    setActingSchoolId(school.id);
    queryClient.clear();
    await reload();
    navigate("/");
  };

  return (
    <div>
      <PageHeader
        title="Schools"
        description="Every school on the platform. Open a school to manage it as its admin would."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            New school
          </Button>
        }
      />
      <Card padded={false}>
        <div className="border-b border-slate-100 p-4">
          <Input
            placeholder="Search by name or code…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="max-w-xs"
          />
        </div>
        <Table
          loading={isLoading}
          rows={data?.items}
          rowKey={(s) => s.id}
          empty={<EmptyState icon={<Building2 className="size-8" />} title="No schools yet" description="Create the first school to get started." />}
          columns={[
            {
              header: "School",
              cell: (s) => (
                <div>
                  <p className="font-medium text-slate-900">{s.name}</p>
                  <p className="text-xs text-slate-500">{s.address}</p>
                </div>
              ),
            },
            { header: "Code", cell: (s) => <span className="font-mono text-xs">{s.code}</span> },
            { header: "Students / plan", cell: (s) => <PlanUsage school={s} onEdit={() => setPlanFor(s)} /> },
            { header: "Users", cell: (s) => s.userCount, className: "tabular-nums" },
            { header: "Status", cell: (s) => (s.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="red">Suspended</Badge>) },
            {
              header: "",
              className: "text-right",
              cell: (s) => (
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => toggleActive.mutate(s)}>
                    {s.isActive ? "Suspend" : "Reactivate"}
                  </Button>
                  <Button size="sm" variant="secondary" icon={<LogIn className="size-3.5" />} onClick={() => void openSchool(s)}>
                    Open
                  </Button>
                </div>
              ),
            },
          ]}
        />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>

      <CreateSchoolModal open={creating} onClose={() => setCreating(false)} />
      {planFor && <PlanModal school={planFor} onClose={() => setPlanFor(null)} />}
    </div>
  );
}

/** "142 / 150" with a bar; red when full, amber when nearly full. Click to change the plan. */
function PlanUsage({ school, onEdit }: { school: School; onEdit: () => void }) {
  const limit = school.studentLimit;
  const used = limit ? school.studentCount / limit : 0;
  const tone = used >= 1 ? "bg-red-500" : used >= 0.9 ? "bg-amber-500" : "bg-brand";
  return (
    <button onClick={onEdit} className="group w-36 text-left" title="Change student limit">
      <span className="block text-sm tabular-nums text-slate-900">
        {school.studentCount} / {limit ?? "no limit"}
        <span className="ml-1 text-xs text-brand opacity-0 group-hover:opacity-100">Change</span>
      </span>
      {limit !== null && (
        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100">
          <span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, used * 100)}%` }} />
        </span>
      )}
    </button>
  );
}

/** Change how many active students a school has paid for (e.g. after they buy a bigger plan). */
function PlanModal({ school, onClose }: { school: School; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [limit, setLimit] = useState(school.studentLimit?.toString() ?? "");
  const value = limit === "" ? null : Number(limit);
  const invalid = value !== null && (!Number.isInteger(value) || value < 1);

  const save = useMutation({
    mutationFn: () => api.patch(`/schools/${school.id}`, { studentLimit: value }),
    onSuccess: async () => {
      toast.success(`${school.name}: ${value === null ? "no student limit" : `${value} students`}`);
      await queryClient.invalidateQueries({ queryKey: ["schools"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Student limit · ${school.name}`}
      description={`They have ${school.studentCount} active students now. Students who left, transferred or graduated don't count.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={invalid} loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
        </>
      }
    >
      <Field label="Active students allowed" error={invalid ? "Enter a whole number, 1 or more" : undefined} hint="Leave empty for no limit">
        <Input type="number" min={1} step={1} value={limit} onChange={(e) => setLimit(e.target.value)} autoFocus />
      </Field>
      {value !== null && !invalid && value < school.studentCount && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This is below their current {school.studentCount} active students. Nobody is removed, but they can't admit anyone until they're under the limit.
        </p>
      )}
    </Modal>
  );
}

interface CreateSchoolForm {
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  studentLimit: string;
  admin: { fullName: string; email: string; phone: string; password: string };
}

function CreateSchoolModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, reset, setError, formState } = useForm<CreateSchoolForm>();

  const close = () => {
    reset();
    setFormError(null);
    onClose();
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api.post("/schools", { ...emptyToNull(values), studentLimit: Number(values.studentLimit), admin: emptyToNull(values.admin) });
      toast.success(`${values.name} created`);
      await queryClient.invalidateQueries({ queryKey: ["schools"] });
      close();
    } catch (e) {
      setFormError(applyApiErrors(e, setError));
    }
  });

  const errors = formState.errors;

  return (
    <Modal
      open={open}
      onClose={close}
      title="New school"
      description="Creates the school with its built-in roles and its first School Admin login."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button loading={formState.isSubmitting} onClick={() => void onSubmit()}>
            Create school
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <FormError message={formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="School name" required error={errors.name?.message} className="sm:col-span-2">
            <Input {...register("name", { required: "Required" })} />
          </Field>
          <Field label="Code" required error={errors.code?.message} hint="Short unique code, e.g. SXS">
            <Input {...register("code", { required: "Required" })} className="uppercase" />
          </Field>
          <Field label="Phone" error={errors.phone?.message}>
            <Input {...register("phone")} />
          </Field>
          <Field label="Email" error={errors.email?.message}>
            <Input type="email" {...register("email")} />
          </Field>
          <Field label="Address" error={errors.address?.message}>
            <Input {...register("address")} />
          </Field>
          <Field label="Student limit" required error={errors.studentLimit?.message} hint="Active students they paid for. They can't admit more until you raise it.">
            <Input
              type="number"
              min={1}
              step={1}
              {...register("studentLimit", {
                required: "Required",
                validate: (v) => (Number.isInteger(Number(v)) && Number(v) >= 1) || "Enter a whole number, 1 or more",
              })}
            />
          </Field>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-900">School Admin login</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required error={errors.admin?.fullName?.message}>
              <Input {...register("admin.fullName", { required: "Required" })} />
            </Field>
            <Field label="Email" required error={errors.admin?.email?.message}>
              <Input type="email" {...register("admin.email", { required: "Required" })} />
            </Field>
            <Field label="Mobile" error={errors.admin?.phone?.message}>
              <Input {...register("admin.phone")} placeholder="98XXXXXXXX" />
            </Field>
            <Field label="Temporary password" required error={errors.admin?.password?.message} hint="At least 8 characters">
              <Input type="text" {...register("admin.password", { required: "Required", minLength: { value: 8, message: "At least 8 characters" } })} />
            </Field>
          </div>
        </div>
      </form>
    </Modal>
  );
}
