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
  createdAt: string;
  studentCount: number;
  userCount: number;
}

/** Platform owner's view: every school on the platform. */
export function SchoolsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
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
            { header: "Students", cell: (s) => s.studentCount, className: "tabular-nums" },
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
    </div>
  );
}

interface CreateSchoolForm {
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
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
      await api.post("/schools", { ...emptyToNull(values), admin: emptyToNull(values.admin) });
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
