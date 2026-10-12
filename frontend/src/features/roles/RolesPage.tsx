import clsx from "clsx";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge, Card, PageHeader, Spinner } from "@/components/ui/display";
import { Field, FormError, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/forms";
import { PermissionPicker } from "./PermissionPicker";
import { usePermissionCatalog, useRoles, type Role } from "./roles.api";

const NEW_ROLE = "new";

export function RolesPage() {
  const { data: roles, isLoading } = useRoles();
  const { data: catalog } = usePermissionCatalog();
  const { can } = useAuth();
  const [chosenId, setSelectedId] = useState<string | null>(null);
  const selectedId = chosenId ?? roles?.[0]?.id ?? null;

  if (isLoading || !roles || !catalog) return <Spinner />;
  const selected = roles.find((r) => r.id === selectedId) ?? null;

  return (
    <div>
      <PageHeader
        title="Roles & permissions"
        description="Choose what each role can do. Changes apply immediately to everyone with the role. For one-off exceptions, edit the person under Staff & users."
        actions={
          can("role.manage") && (
            <Button icon={<Plus className="size-4" />} onClick={() => setSelectedId(NEW_ROLE)}>
              New role
            </Button>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <Card padded={false} className="h-fit">
          <ul className="divide-y divide-slate-100">
            {roles.map((role) => (
              <li key={role.id}>
                <button
                  onClick={() => setSelectedId(role.id)}
                  className={clsx("flex w-full items-start gap-3 px-4 py-3 text-left", selectedId === role.id ? "bg-brand-soft" : "hover:bg-slate-50")}
                >
                  <ShieldCheck className={clsx("mt-0.5 size-4.5 shrink-0", selectedId === role.id ? "text-brand" : "text-slate-400")} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                      {role.name}
                      {role.locked && <Lock className="size-3 text-slate-400" />}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                      <Users className="size-3" /> {role.userCount}
                      <span>·</span>
                      {role.locked ? "All permissions" : `${role.permissions.length} permissions`}
                    </span>
                  </span>
                  {!role.isSystem && <Badge tone="blue">Custom</Badge>}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {selectedId === NEW_ROLE ? (
          <RoleEditor key="new" role={null} onSaved={(role) => setSelectedId(role.id)} onDeleted={() => setSelectedId(null)} />
        ) : selected ? (
          <RoleEditor key={selected.id} role={selected} onSaved={() => undefined} onDeleted={() => setSelectedId(null)} />
        ) : null}
      </div>
    </div>
  );
}

function RoleEditor({ role, onSaved, onDeleted }: { role: Role | null; onSaved: (role: Role) => void; onDeleted: () => void }) {
  const { data: catalog = [] } = usePermissionCatalog();
  const { can, reload } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  const allKeys = useMemo(() => catalog.flatMap((g) => g.permissions.map((p) => p.key)), [catalog]);
  const initial = useMemo(() => new Set(role?.locked ? allKeys : (role?.permissions ?? [])), [role, allKeys]);

  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissions, setPermissions] = useState<Set<string>>(initial);
  const [error, setError] = useState<string | null>(null);

  const editable = can("role.manage");
  const dirty =
    !role ||
    name !== role.name ||
    description !== (role.description ?? "") ||
    permissions.size !== initial.size ||
    [...permissions].some((p) => !initial.has(p));

  const save = useMutation({
    mutationFn: () => {
      const body = { name, description: description || null, ...(role?.locked ? {} : { permissions: [...permissions] }) };
      return role ? api.patch<Role>(`/roles/${role.id}`, body) : api.post<Role>("/roles", body);
    },
    onSuccess: async (saved) => {
      toast.success(role ? "Role updated" : "Role created");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      await reload(); // your own permissions may have changed
      onSaved(saved);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/roles/${role!.id}`),
    onSuccess: async () => {
      toast.success("Role deleted");
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      onDeleted();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card
      title={role ? role.name : "New role"}
      actions={
        <div className="flex gap-2">
          {role && !role.isSystem && editable && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 className="size-4" />}
              loading={remove.isPending}
              onClick={() => confirm(`Delete the role "${role.name}"?`) && remove.mutate()}
            >
              Delete
            </Button>
          )}
          {editable && (
            <Button size="sm" disabled={!dirty || !name.trim()} loading={save.isPending} onClick={() => save.mutate()}>
              Save changes
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!editable} placeholder="e.g. Exam Coordinator" />
          </Field>
          <Field label="Description">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} disabled={!editable} />
          </Field>
        </div>

        {role?.locked && (
          <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <Lock className="size-4" /> School Admin always has every permission, so the school can never be locked out.
          </p>
        )}
        {(role?.key === "parent" || role?.key === "student") && (
          <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
            Parents and students automatically see their own children's / their own information in the app. Permissions here are only for extra access.
          </p>
        )}

        <PermissionPicker groups={catalog} selected={permissions} onChange={setPermissions} disabled={!editable || role?.locked} />
      </div>
    </Card>
  );
}
