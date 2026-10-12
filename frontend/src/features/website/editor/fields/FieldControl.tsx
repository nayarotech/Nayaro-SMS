import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Field } from "@site-renderer";
import { Input, Select, Textarea, Toggle } from "@/components/ui/form";
import { useAlbums } from "../../website.api";
import { IconPicker } from "./IconPicker";
import { ImageInput } from "./ImageInput";
import { LinkInput } from "./LinkInput";
import { RichTextInput } from "./RichTextInput";

/**
 * One setting in the block inspector. The kind of control comes from the
 * block's field definition (renderer/types.ts → Field).
 */
export function FieldControl({ field, value, onChange }: { field: Field; value: unknown; onChange: (value: unknown) => void }) {
  return (
    <div>
      {field.type !== "toggle" && field.type !== "list" && <label className="mb-1 block text-xs font-medium text-slate-600">{field.label}</label>}
      <Control field={field} value={value} onChange={onChange} />
      {field.help && <p className="mt-1 text-xs text-slate-400">{field.help}</p>}
    </div>
  );
}

function Control({ field, value, onChange }: { field: Field; value: unknown; onChange: (value: unknown) => void }) {
  const text = typeof value === "string" ? value : "";
  switch (field.type) {
    case "text":
      return <Input value={text} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case "textarea":
      return <Textarea value={text} rows={field.rows ?? 3} onChange={(e) => onChange(e.target.value)} />;
    case "richtext":
      return <RichTextInput value={text} onChange={onChange} />;
    case "image":
      return <ImageInput value={(value as string | null) ?? null} onChange={onChange} />;
    case "link":
      return <LinkInput value={text} onChange={onChange} />;
    case "icon":
      return <IconPicker value={text || "star"} onChange={onChange} />;
    case "toggle":
      return (
        <label className="flex items-center justify-between gap-3 text-sm text-slate-700">
          {field.label}
          <Toggle checked={Boolean(value)} onChange={onChange} label={field.label} />
        </label>
      );
    case "number":
      return <Input type="number" min={field.min} max={field.max} value={typeof value === "number" ? value : ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
    case "select":
      return (
        <Select value={text} onChange={(e) => onChange(e.target.value)}>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      );
    case "album":
      return <AlbumSelect value={text} onChange={onChange} />;
    case "list":
      return <ListControl field={field} value={Array.isArray(value) ? (value as Record<string, unknown>[]) : []} onChange={onChange} />;
  }
}

function AlbumSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { data: albums = [] } = useAlbums();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Newest photos from all albums</option>
      {albums.map((a) => (
        <option key={a.id} value={a.id}>{a.title} ({a.photos.length})</option>
      ))}
    </Select>
  );
}

/** Repeating items (feature cards, people, questions…): add, remove, reorder, edit. */
function ListControl({ field, value, onChange }: { field: Extract<Field, { type: "list" }>; value: Record<string, unknown>[]; onChange: (value: unknown) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const update = (index: number, item: Record<string, unknown>) => onChange(value.map((v, i) => (i === index ? item : v)));
  const move = (index: number, by: number) => {
    const next = [...value];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    onChange(next);
    setOpen(index + by);
  };
  const summary = (item: Record<string, unknown>) =>
    String(item.title ?? item.name ?? item.question ?? item.text ?? item.label ?? item.caption ?? "").slice(0, 40) || field.itemLabel;

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-slate-600">
        {field.label} <span className="text-slate-400">({value.length})</span>
      </p>
      <ul className="space-y-1.5">
        {value.map((item, index) => (
          <li key={index} className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center gap-1 px-2 py-1.5">
              <button type="button" onClick={() => setOpen(open === index ? null : index)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm">
                {open === index ? <ChevronDown className="size-4 shrink-0 text-slate-400" /> : <ChevronRight className="size-4 shrink-0 text-slate-400" />}
                <span className="truncate">{summary(item)}</span>
              </button>
              <IconButton label="Move up" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="size-3.5" /></IconButton>
              <IconButton label="Move down" disabled={index === value.length - 1} onClick={() => move(index, 1)}><ArrowDown className="size-3.5" /></IconButton>
              <IconButton label="Duplicate" disabled={field.max !== undefined && value.length >= field.max} onClick={() => onChange([...value.slice(0, index + 1), structuredClone(item), ...value.slice(index + 1)])}><Copy className="size-3.5" /></IconButton>
              <IconButton label="Remove" onClick={() => onChange(value.filter((_, i) => i !== index))}><Trash2 className="size-3.5" /></IconButton>
            </div>
            {open === index && (
              <div className="space-y-3 border-t border-slate-100 p-3">
                {field.fields.map((sub) => (
                  <FieldControl key={sub.name} field={sub} value={item[sub.name]} onChange={(v) => update(index, { ...item, [sub.name]: v })} />
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      {(field.max === undefined || value.length < field.max) && (
        <button
          type="button"
          onClick={() => {
            onChange([...value, structuredClone(field.newItem)]);
            setOpen(value.length);
          }}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 py-2 text-sm text-slate-500 hover:border-brand hover:text-brand"
        >
          <Plus className="size-4" /> Add {field.itemLabel.toLowerCase()}
        </button>
      )}
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30">
      {children}
    </button>
  );
}
