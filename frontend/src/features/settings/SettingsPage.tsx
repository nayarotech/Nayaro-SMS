import clsx from "clsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { Card, PageHeader, Spinner } from "@/components/ui/display";
import { FormError, Input, Select, Toggle } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/forms";
import type { SchoolSettings, SettingValue } from "@/lib/types";

/**
 * Generic settings screen. Everything here comes from the backend's settings
 * registry (backend/src/modules/settings/settings.registry.ts) — add a setting
 * there and it shows up on this page automatically.
 */

interface SettingOption {
  value: string;
  label: string;
}

type SettingDefinition = {
  key: string;
  group: string;
  label: string;
  description?: string;
} & (
  | { type: "boolean"; default: boolean }
  | { type: "number"; default: number; min?: number; max?: number }
  | { type: "text"; default: string; maxLength?: number }
  | { type: "color"; default: string }
  | { type: "select"; default: string; options: SettingOption[] }
  | { type: "multiselect"; default: string[]; options: SettingOption[] }
);

interface Definitions {
  groups: { key: string; label: string; description?: string }[];
  settings: SettingDefinition[];
}

export function SettingsPage() {
  const definitions = useQuery({
    queryKey: ["settings-definitions"],
    queryFn: () => api.get<Definitions>("/settings/definitions"),
    staleTime: Infinity,
  });
  const current = useQuery({ queryKey: ["settings"], queryFn: () => api.get<SchoolSettings>("/settings") });

  if (!definitions.data || !current.data) return <Spinner />;
  // Re-mount the editor when the saved settings change, so the draft always starts from them
  return <SettingsEditor key={JSON.stringify(current.data)} definitions={definitions.data} saved={current.data} />;
}

function SettingsEditor({ definitions, saved }: { definitions: Definitions; saved: SchoolSettings }) {
  const [params, setParams] = useSearchParams();
  const { can, reload } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<SchoolSettings>(saved);
  const [error, setError] = useState<string | null>(null);

  const activeGroup = params.get("group") ?? definitions.groups[0]?.key;
  const editable = can("school.settings.edit");

  const changed = useMemo(
    () => Object.fromEntries(Object.entries(draft).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(saved[key]))),
    [draft, saved],
  );

  const save = useMutation({
    mutationFn: () => api.patch<SchoolSettings>("/settings", changed),
    onSuccess: async (updated) => {
      toast.success("Settings saved");
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await reload(); // re-apply branding, modules and language
      queryClient.setQueryData(["settings"], updated);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const { groups, settings } = definitions;
  const group = groups.find((g) => g.key === activeGroup) ?? groups[0];
  const changedCount = Object.keys(changed).length;

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Customise how the system works for your school."
        actions={
          editable && (
            <>
              {changedCount > 0 && (
                <Button variant="ghost" onClick={() => setDraft(saved)}>
                  Discard
                </Button>
              )}
              <Button disabled={changedCount === 0} loading={save.isPending} onClick={() => save.mutate()}>
                Save {changedCount > 0 && `(${changedCount})`}
              </Button>
            </>
          )
        }
      />
      <FormError message={error} />

      <div className="mt-4 grid gap-6 lg:grid-cols-[14rem_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          {groups.map((g) => {
            const dirty = settings.some((s) => s.group === g.key && s.key in changed);
            return (
              <button
                key={g.key}
                onClick={() => setParams({ group: g.key })}
                className={clsx(
                  "flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium",
                  g.key === group.key ? "bg-brand-soft text-brand" : "text-slate-600 hover:bg-white",
                )}
              >
                {g.label}
                {dirty && <span className="size-2 rounded-full bg-amber-500" />}
              </button>
            );
          })}
        </nav>

        <Card title={group.label}>
          {group.description && <p className="-mt-1 mb-4 text-sm text-slate-500">{group.description}</p>}
          <div className="divide-y divide-slate-100">
            {settings
              .filter((s) => s.group === group.key)
              .map((setting) => (
                <div key={setting.key} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                  <div className="sm:max-w-md">
                    <p className="text-sm font-medium text-slate-900">{setting.label}</p>
                    {setting.description && <p className="mt-0.5 text-xs text-slate-500">{setting.description}</p>}
                  </div>
                  <div className="sm:w-72 sm:shrink-0 sm:text-right">
                    <SettingControl
                      setting={setting}
                      value={draft[setting.key]}
                      disabled={!editable}
                      onChange={(value) => setDraft((d) => ({ ...d, [setting.key]: value }))}
                    />
                  </div>
                </div>
              ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SettingControl({
  setting,
  value,
  onChange,
  disabled,
}: {
  setting: SettingDefinition;
  value: SettingValue;
  onChange: (value: SettingValue) => void;
  disabled: boolean;
}) {
  switch (setting.type) {
    case "boolean":
      return <Toggle checked={Boolean(value)} onChange={onChange} disabled={disabled} label={setting.label} />;
    case "number":
      return (
        <Input
          type="number"
          min={setting.min}
          max={setting.max}
          value={String(value)}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="sm:w-28 sm:ml-auto"
        />
      );
    case "text":
      return <Input value={String(value ?? "")} maxLength={setting.maxLength} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
    case "color":
      return (
        <div className="flex items-center gap-2 sm:justify-end">
          <input type="color" value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 cursor-pointer rounded border border-slate-300" />
          <Input value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="w-28 font-mono" />
        </div>
      );
    case "select":
      return (
        <Select value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          {setting.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
    case "multiselect": {
      const selected = new Set(value as string[]);
      // Keep the registry's order, so the order on screen matches what's saved
      const toggle = (option: string) => {
        const next = new Set(selected);
        if (next.has(option)) next.delete(option);
        else next.add(option);
        onChange(setting.options.map((o) => o.value).filter((v) => next.has(v)));
      };
      return (
        <div className="flex flex-wrap gap-1.5 sm:justify-end">
          {setting.options.map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={disabled}
              onClick={() => toggle(o.value)}
              className={clsx(
                "rounded-full border px-3 py-1 text-xs font-medium",
                selected.has(o.value) ? "border-brand bg-brand-soft text-brand" : "border-slate-300 text-slate-600 hover:bg-slate-50",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      );
    }
  }
}
