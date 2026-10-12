import clsx from "clsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, KeyRound, UserX } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { Avatar, Badge, Card, Spinner } from "@/components/ui/display";
import { Checkbox, Field, FormError, Input } from "@/components/ui/form";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/forms";
import { usePermissionCatalog, useRoles } from "../roles/roles.api";
import { StaffForm } from "./StaffForm";
import { toStaffPayload } from "./staff-payload";
import type { UserDetail } from "./users.api";

type Tab = "profile" | "roles" | "permissions" | "security";

export function StaffDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>("profile");
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: user } = useQuery({ queryKey: ["user", id], queryFn: () => api.get<UserDetail>(`/users/${id}`) });

  const onSaved = (updated: UserDetail) => {
    queryClient.setQueryData(["user", id], updated);
    void queryClient.invalidateQueries({ queryKey: ["users"] });
  };

  if (!user) return <Spinner />;

  return (
    <div>
      <Link to="/staff" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Staff & users
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        {can("user.manage") ? (
          <ImageUpload
            purpose="user-photo"
            shape="round"
            url={user.photoUrl}
            label="Add photo"
            onUploaded={async (file) => {
              try {
                onSaved(await api.patch<UserDetail>(`/users/${user.id}`, { photoKey: file.key }));
              } catch (e) {
                toast.error(errorMessage(e));
              }
            }}
          />
        ) : (
          <Avatar name={user.fullName} url={user.photoUrl} size={64} />
        )}
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{user.fullName}</h1>
          <p className="text-sm text-slate-500">{[user.designation, user.phone, user.email].filter(Boolean).join(" · ")}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {!user.isActive && <Badge tone="red">Deactivated</Badge>}
            {user.roles.map((r) => (
              <Badge key={r.id} tone="brand">
                {r.name}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <Tabs<Tab>
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "profile", label: "Profile" },
          { key: "roles", label: "Roles" },
          { key: "permissions", label: "Permissions" },
          { key: "security", label: "Login & access", hidden: !can("user.manage") },
        ]}
      />

      {tab === "profile" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <Card>
            {can("user.manage") ? (
              <StaffForm
                user={user}
                submitLabel="Save changes"
                onSubmit={async (values) => {
                  onSaved(await api.patch<UserDetail>(`/users/${user.id}`, toStaffPayload(values, false)));
                  toast.success("Saved");
                }}
              />
            ) : (
              <p className="text-sm text-slate-500">You can view but not edit staff details.</p>
            )}
          </Card>
          <Card title="Teaching this year">
            {user.classTeacherOf.length === 0 && user.teaching.length === 0 ? (
              <p className="text-sm text-slate-500">
                No classes assigned. Assign them in <Link className="text-brand hover:underline" to="/academic/assignments">Teacher assignments</Link>.
              </p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {user.classTeacherOf.map((section) => (
                  <li key={section} className="flex justify-between">
                    <span className="font-medium">Class teacher</span>
                    <span>{section}</span>
                  </li>
                ))}
                {user.teaching.map((t) => (
                  <li key={t.subject + t.classSection} className="flex justify-between text-slate-600">
                    <span>{t.subject}</span>
                    <span>{t.classSection}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
      {tab === "roles" && <RolesTab user={user} onSaved={onSaved} />}
      {tab === "permissions" && <PermissionsTab key={JSON.stringify(user.permissionOverrides)} user={user} onSaved={onSaved} />}
      {tab === "security" && <SecurityTab user={user} onSaved={onSaved} />}
    </div>
  );
}

function RolesTab({ user, onSaved }: { user: UserDetail; onSaved: (u: UserDetail) => void }) {
  const { data: roles = [] } = useRoles();
  const { can, user: me, reload } = useAuth();
  const toast = useToast();
  const [selected, setSelected] = useState(new Set(user.roles.map((r) => r.id)));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => api.put<UserDetail>(`/users/${user.id}/roles`, { roleIds: [...selected] }),
    onSuccess: async (updated) => {
      onSaved(updated);
      setError(null);
      toast.success("Roles updated");
      if (updated.id === me?.id) await reload();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Card
      title="Roles"
      actions={
        can("role.manage") && (
          <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>
            Save roles
          </Button>
        )
      }
    >
      <FormError message={error} />
      <p className="mb-4 text-sm text-slate-500">A person can hold several roles — for example a teacher who is also a parent at this school.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {roles.map((role) => (
          <div key={role.id} className="rounded-lg border border-slate-200 p-3">
            <Checkbox
              label={<span className="font-medium text-slate-900">{role.name}</span>}
              checked={selected.has(role.id)}
              disabled={!can("role.manage")}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(role.id);
                else next.delete(role.id);
                setSelected(next);
              }}
            />
            {role.description && <p className="mt-1 pl-6 text-xs text-slate-500">{role.description}</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}

type OverrideState = "role" | "GRANT" | "DENY";

/** Per-user exceptions: each permission follows the user's roles, or is forced on/off. */
function PermissionsTab({ user, onSaved }: { user: UserDetail; onSaved: (u: UserDetail) => void }) {
  const { data: catalog = [] } = usePermissionCatalog();
  const { can } = useAuth();
  const toast = useToast();
  const editable = can("user.permissions.manage");

  const [overrides, setOverrides] = useState<Record<string, OverrideState>>(() =>
    Object.fromEntries(user.permissionOverrides.map((o) => [o.permission, o.effect])),
  );

  const effective = new Set(user.effectivePermissions);
  // What the roles alone give: effective minus GRANTs plus DENYs
  const fromRoles = new Set(user.effectivePermissions);
  user.permissionOverrides.forEach((o) => (o.effect === "GRANT" ? fromRoles.delete(o.permission) : fromRoles.add(o.permission)));

  const save = useMutation({
    mutationFn: () =>
      api.put<UserDetail>(`/users/${user.id}/permissions`, {
        overrides: Object.entries(overrides)
          .filter(([, state]) => state !== "role")
          .map(([permission, effect]) => ({ permission, effect })),
      }),
    onSuccess: (updated) => {
      onSaved(updated);
      toast.success("Permissions updated");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card
      title="Individual permissions"
      actions={
        editable && (
          <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        )
      }
    >
      <p className="mb-4 text-sm text-slate-500">
        By default a person gets the permissions of their roles. Use <b>Allow</b> or <b>Block</b> to make an exception just for {user.fullName}.
      </p>
      <div className="space-y-5">
        {catalog.map((group) => (
          <div key={group.key}>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{group.label}</p>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {group.permissions.map((permission) => {
                const state = overrides[permission.key] ?? "role";
                const on = state === "role" ? fromRoles.has(permission.key) : state === "GRANT";
                return (
                  <li key={permission.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="flex items-center gap-2 text-sm">
                      <span className={clsx("size-2 rounded-full", on ? "bg-green-500" : "bg-slate-300")} />
                      {permission.label}
                      {state !== "role" && <Badge tone={state === "GRANT" ? "green" : "red"}>{state === "GRANT" ? "Allowed" : "Blocked"}</Badge>}
                    </span>
                    <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
                      {(["role", "GRANT", "DENY"] as const).map((option) => (
                        <button
                          key={option}
                          disabled={!editable}
                          onClick={() => setOverrides((o) => ({ ...o, [permission.key]: option }))}
                          className={clsx(
                            "rounded-md px-2.5 py-1 font-medium disabled:cursor-not-allowed",
                            state === option ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100",
                          )}
                        >
                          {option === "role" ? (fromRoles.has(permission.key) ? "From role ✓" : "From role ✗") : option === "GRANT" ? "Allow" : "Block"}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-400">Currently has {effective.size} permissions.</p>
    </Card>
  );
}

function SecurityTab({ user, onSaved }: { user: UserDetail; onSaved: (u: UserDetail) => void }) {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = useMutation({
    mutationFn: () => api.post(`/users/${user.id}/reset-password`, { password }),
    onSuccess: () => {
      setPassword("");
      setError(null);
      toast.success("Password set. They have been signed out of all devices.");
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const toggleActive = useMutation({
    mutationFn: () => api.patch<UserDetail>(`/users/${user.id}`, { isActive: !user.isActive }),
    onSuccess: (updated) => {
      onSaved(updated);
      toast.success(updated.isActive ? "Account reactivated" : "Account deactivated");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Set a new password">
        <div className="space-y-4">
          <FormError message={error} />
          <p className="text-sm text-slate-500">{user.hasPassword ? "Replaces their current password." : "They currently sign in with phone + OTP only."}</p>
          <Field label="New password" hint="At least 8 characters">
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button icon={<KeyRound className="size-4" />} disabled={password.length < 8} loading={reset.isPending} onClick={() => reset.mutate()}>
            Set password
          </Button>
        </div>
      </Card>
      <Card title={user.isActive ? "Deactivate account" : "Reactivate account"}>
        <p className="mb-4 text-sm text-slate-500">
          {user.isActive
            ? "A deactivated person can't sign in. Their records (marks entered, attendance taken…) are kept."
            : "Let this person sign in again."}
        </p>
        <Button
          variant={user.isActive ? "danger" : "primary"}
          icon={<UserX className="size-4" />}
          loading={toggleActive.isPending}
          onClick={() => (!user.isActive || confirm(`Deactivate ${user.fullName}?`)) && toggleActive.mutate()}
        >
          {user.isActive ? "Deactivate" : "Reactivate"}
        </Button>
      </Card>
    </div>
  );
}
