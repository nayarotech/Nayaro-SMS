import clsx from "clsx";
import { Badge } from "@/components/ui/display";
import type { PermissionGroup } from "./roles.api";

interface PermissionPickerProps {
  groups: PermissionGroup[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}

/** Grouped checklist of every permission, with "select all" per group. */
export function PermissionPicker({ groups, selected, onChange, disabled }: PermissionPickerProps) {
  const toggle = (keys: string[], on: boolean) => {
    const next = new Set(selected);
    keys.forEach((key) => (on ? next.add(key) : next.delete(key)));
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const keys = group.permissions.map((p) => p.key);
        const count = keys.filter((k) => selected.has(k)).length;
        const all = count === keys.length;
        return (
          <fieldset key={group.key} className="rounded-lg border border-slate-200">
            <legend className="sr-only">{group.label}</legend>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900">{group.label}</span>
                {group.comingSoon && <Badge tone="amber">Later phase</Badge>}
                <span className="text-xs text-slate-500">
                  {count}/{keys.length}
                </span>
              </div>
              {!disabled && (
                <button type="button" className="text-xs font-medium text-brand hover:underline" onClick={() => toggle(keys, !all)}>
                  {all ? "Clear all" : "Select all"}
                </button>
              )}
            </div>
            <div className="grid gap-x-4 gap-y-1 p-3 sm:grid-cols-2">
              {group.permissions.map((permission) => (
                <label
                  key={permission.key}
                  className={clsx("flex items-start gap-2.5 rounded-md px-2 py-1.5 text-sm", !disabled && "cursor-pointer hover:bg-slate-50")}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 accent-brand"
                    checked={selected.has(permission.key)}
                    disabled={disabled}
                    onChange={(e) => toggle([permission.key], e.target.checked)}
                  />
                  <span>
                    <span className="block text-slate-800">{permission.label}</span>
                    {permission.description && <span className="block text-xs text-slate-500">{permission.description}</span>}
                    <span className="block font-mono text-[11px] text-slate-400">{permission.key}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
