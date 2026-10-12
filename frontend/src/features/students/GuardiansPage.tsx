import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, UsersRound } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/display";
import { Checkbox, Field, FormError, Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { Pagination, Table } from "@/components/ui/Table";
import { useToast } from "@/components/ui/toast";
import { api, type Paginated } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { applyApiErrors, errorMessage } from "@/lib/forms";
import { generatePassword, loginDetailsText } from "@/lib/password";
import { relationLabel, type Guardian } from "./students.api";

export function GuardiansPage() {
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Guardian | null>(null);
  const { can } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["guardians", { search, page }],
    queryFn: () => api.get<Paginated<Guardian>>("/guardians", { search, page, pageSize: 25 }),
  });

  return (
    <div>
      <PageHeader
        title="Parents"
        description="Parents are added during admission. They sign in to the app with their mobile number and a one-time code."
      />
      <Card padded={false}>
        <div className="border-b border-slate-100 p-4">
          <Input placeholder="Search parent name, phone or child's name…" value={search} onChange={(e) => (setSearch(e.target.value), setPage(1))} className="w-full sm:w-80" />
        </div>
        <Table
          loading={isLoading}
          rows={data?.items}
          rowKey={(g) => g.id}
          onRowClick={can("guardian.manage") ? setEditing : undefined}
          empty={<EmptyState icon={<UsersRound className="size-8" />} title="No parents found" />}
          columns={[
            {
              header: "Parent",
              cell: (g) => (
                <div>
                  <p className="font-medium text-slate-900">{g.fullName}</p>
                  <p className="text-xs text-slate-500">{g.occupation ?? ""}</p>
                </div>
              ),
            },
            {
              header: "Contact",
              cell: (g) => (
                <div className="text-xs">
                  <p>{g.phone ?? "—"}</p>
                  <p className="text-slate-500">{g.email}</p>
                </div>
              ),
            },
            {
              header: "Children",
              cell: (g) => (
                <div className="space-y-0.5">
                  {g.children.map((c) => (
                    <Link key={c.id} to={`/students/${c.id}`} onClick={(e) => e.stopPropagation()} className="block text-xs hover:text-brand">
                      <span className="font-medium text-slate-800">{c.name}</span>{" "}
                      <span className="text-slate-500">
                        {relationLabel(c.relation).toLowerCase()} · {c.classSection ?? "—"}
                      </span>
                    </Link>
                  ))}
                </div>
              ),
            },
            {
              header: "WhatsApp",
              cell: (g) =>
                g.whatsappOptIn ? (
                  <Badge tone="green">
                    <MessageCircle className="mr-1 size-3" /> Opted in
                  </Badge>
                ) : (
                  <Badge>{g.whatsappOptOutAt ? "Opted out" : "No consent"}</Badge>
                ),
            },
            {
              header: "App",
              cell: (g) => (
                <div className="flex flex-wrap gap-1">
                  {g.hasPassword ? <Badge tone="green">Password set</Badge> : <Badge>No password</Badge>}
                  {g.hasLoggedIn && <Badge tone="blue">Signed in</Badge>}
                </div>
              ),
            },
          ]}
        />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>
      {editing && <EditGuardianModal guardian={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditGuardianModal({ guardian, onClose }: { guardian: Guardian; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm({
    defaultValues: {
      fullName: guardian.fullName,
      phone: guardian.phone ?? "",
      email: guardian.email ?? "",
      occupation: guardian.occupation ?? "",
      address: guardian.address ?? "",
      alternatePhone: guardian.alternatePhone ?? "",
      whatsappOptIn: guardian.whatsappOptIn,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const body = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === "" ? null : v]));
      await api.patch(`/guardians/${guardian.id}`, body);
      await queryClient.invalidateQueries({ queryKey: ["guardians"] });
      await queryClient.invalidateQueries({ queryKey: ["student"] });
      toast.success("Saved");
      onClose();
    } catch (e) {
      setFormError(applyApiErrors(e, setError));
    }
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={guardian.fullName}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={formState.isSubmitting} onClick={() => void onSubmit()}>Save</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <FormError message={formError} />
        <Field label="Full name" required error={formState.errors.fullName?.message}>
          <Input {...register("fullName", { required: "Required" })} />
        </Field>
        <Field label="Mobile" error={formState.errors.phone?.message} hint="Changing this changes their app login">
          <Input {...register("phone")} />
        </Field>
        <Field label="Alternate phone">
          <Input {...register("alternatePhone")} />
        </Field>
        <Field label="Email" error={formState.errors.email?.message}>
          <Input {...register("email")} />
        </Field>
        <Field label="Occupation">
          <Input {...register("occupation")} />
        </Field>
        <Field label="Address">
          <Input {...register("address")} />
        </Field>
        <AppLogin guardian={guardian} />
        <div className="sm:col-span-2">
          <Checkbox label="Agrees to receive messages on WhatsApp" {...register("whatsappOptIn")} />
          <p className="mt-1 pl-6 text-xs text-slate-500">
            {guardian.whatsappOptInAt && `Opted in ${new Date(guardian.whatsappOptInAt).toLocaleDateString()}. `}
            {guardian.whatsappOptOutAt && `Opted out ${new Date(guardian.whatsappOptOutAt).toLocaleDateString()}.`}
          </p>
        </div>
      </form>
    </Modal>
  );
}

/** How this parent signs in to the app, and setting/resetting their password. */
function AppLogin({ guardian }: { guardian: Guardian }) {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const school = user?.school;
  const login = guardian.phone ?? guardian.email;

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/guardians/${guardian.id}/password`, { password });
      await queryClient.invalidateQueries({ queryKey: ["guardians"] });
      await navigator.clipboard?.writeText(loginDetailsText(school?.name ?? "", school?.code ?? "", login ?? "", password)).catch(() => undefined);
      toast.success("Password set — login details copied to send to the parent");
      setPassword("");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">App login</p>
        {guardian.hasPassword ? <Badge tone="green">Password set</Badge> : <Badge>No password yet</Badge>}
      </div>
      {login ? (
        <p className="text-sm text-slate-600">
          School code <b className="font-mono text-slate-900">{school?.code}</b> · {guardian.phone ? "mobile" : "email"} <b className="text-slate-900">{login}</b>
        </p>
      ) : (
        <p className="text-sm text-amber-700">Add a mobile number or email so this parent can sign in.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder={guardian.hasPassword ? "New password" : "Password"} className="w-48" autoComplete="new-password" />
        <Button size="sm" variant="secondary" className="h-10" onClick={() => setPassword(generatePassword())}>Generate</Button>
        <Button size="sm" className="h-10" disabled={!login || password.length < 6} loading={busy} onClick={() => void save()}>
          {guardian.hasPassword ? "Reset password" : "Set password"}
        </Button>
      </div>
    </div>
  );
}
