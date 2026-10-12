import { ICON_NAMES, iconSvg } from "@site-renderer";
import { useState } from "react";
import { cn } from "@/lib/cn";

/** Grid of icons to choose from (the same icons the website uses). */
export function IconPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:border-brand"
      >
        <span className="text-brand" dangerouslySetInnerHTML={{ __html: iconSvg(value, 20) }} />
        {value}
      </button>
      {open && (
        <div className="mt-2 grid max-h-52 grid-cols-7 gap-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
          {ICON_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              title={name}
              onClick={() => {
                onChange(name);
                setOpen(false);
              }}
              className={cn("flex aspect-square items-center justify-center rounded-md hover:bg-brand-soft hover:text-brand", name === value ? "bg-brand text-white" : "text-slate-600")}
              dangerouslySetInnerHTML={{ __html: iconSvg(name, 18) }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
