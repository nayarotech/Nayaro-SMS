import { SYSTEM_LINKS } from "@site-renderer";
import { Input, Select } from "@/components/ui/form";
import { useLinkTargets } from "../link-targets";

/**
 * Choose where a button or menu item goes: a page, a built-in page,
 * a section on the same page, or any web address.
 */
export function LinkInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { pages, anchors } = useLinkTargets();
  const known = value === "" || value.startsWith("page:") || SYSTEM_LINKS.some((l) => l.value === value) || anchors.includes(value.slice(1));
  const mode = known ? value : "custom";

  return (
    <div className="space-y-2">
      <Select
        value={mode}
        onChange={(e) => onChange(e.target.value === "custom" ? "https://" : e.target.value)}
      >
        <option value="">— No link —</option>
        <optgroup label="Pages">
          {pages.map((p) => (
            <option key={p.id} value={`page:${p.id}`}>{p.isHome ? "Home" : p.title}</option>
          ))}
        </optgroup>
        <optgroup label="Built-in pages">
          {SYSTEM_LINKS.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </optgroup>
        {anchors.length > 0 && (
          <optgroup label="Section on this page">
            {anchors.map((a) => (
              <option key={a} value={`#${a}`}>#{a}</option>
            ))}
          </optgroup>
        )}
        <option value="custom">Web address, phone or email…</option>
      </Select>
      {mode === "custom" && (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://… · tel:98… · mailto:…" />
      )}
    </div>
  );
}
