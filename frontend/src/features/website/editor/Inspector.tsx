import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, X } from "lucide-react";
import { useState } from "react";
import type { Block, SectionStyle } from "@site-renderer";
import { Button } from "@/components/ui/Button";
import { Field, FormError, Input, Select, Textarea, Toggle } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/forms";
import type { BlockMeta, WebsitePageDetail } from "../website.api";
import { FieldControl } from "./fields/FieldControl";
import { ImageInput } from "./fields/ImageInput";

/** Settings for the selected block: its own fields, then "Section style". */
export function BlockInspector({
  block,
  meta,
  onChange,
  onClose,
}: {
  block: Block;
  meta: BlockMeta;
  onChange: (block: Block, mergeKey?: string) => void;
  onClose: () => void;
}) {
  const props = { ...meta.defaults, ...block.props };
  const style: SectionStyle = block.style ?? {};
  const setProp = (name: string, value: unknown) => onChange({ ...block, props: { ...block.props, [name]: value } }, `${block.id}:${name}`);
  const setStyle = (changes: Partial<SectionStyle>) => onChange({ ...block, style: { ...style, ...changes } }, `${block.id}:style`);

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{meta.label}</p>
          <p className="text-xs text-slate-500">{meta.description}</p>
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        {meta.fields.map((field) => (
          <FieldControl key={field.name} field={field} value={props[field.name]} onChange={(v) => setProp(field.name, v)} />
        ))}
      </div>

      <div className="space-y-4 border-t border-slate-200 bg-slate-50/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Section style</p>
        <Field label="Background">
          <Select value={style.background ?? "default"} onChange={(e) => setStyle({ background: e.target.value as SectionStyle["background"] })}>
            <option value="default">Plain</option>
            <option value="muted">Light tint</option>
            <option value="brand">Theme colour</option>
            <option value="dark">Dark</option>
            <option value="image">Photo</option>
          </Select>
        </Field>
        {style.background === "image" && (
          <Field label="Background photo">
            <ImageInput value={style.backgroundImage ?? null} onChange={(key) => setStyle({ backgroundImage: key })} />
          </Field>
        )}
        <Field label="Spacing above and below">
          <Select value={style.padding ?? "md"} onChange={(e) => setStyle({ padding: e.target.value as SectionStyle["padding"] })}>
            <option value="none">None</option>
            <option value="sm">Small</option>
            <option value="md">Medium</option>
            <option value="lg">Large</option>
          </Select>
        </Field>
        <Field label="Section name for links" hint="Lets buttons link straight here, e.g. #admission">
          <Input value={style.anchor ?? ""} onChange={(e) => setStyle({ anchor: e.target.value.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase() })} placeholder="e.g. admission" />
        </Field>
        <label className="flex items-center justify-between text-sm text-slate-700">
          Hide on phones
          <Toggle checked={Boolean(style.hideOnMobile)} onChange={(v) => setStyle({ hideOnMobile: v })} label="Hide on phones" />
        </label>
      </div>
    </div>
  );
}

/** Shown when no block is selected: the page's title, address, SEO and history. */
export function PageSettingsPanel({ page, onSaved, onRestored }: { page: WebsitePageDetail; onSaved: (page: WebsitePageDetail) => void; onRestored: (page: WebsitePageDetail) => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: page.title,
    slug: page.slug,
    showInMenu: page.showInMenu,
    seoTitle: page.seoTitle ?? "",
    seoDescription: page.seoDescription ?? "",
  });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.patch<WebsitePageDetail>(`/website/pages/${page.id}`, {
        title: form.title,
        ...(page.isHome ? {} : { slug: form.slug }),
        showInMenu: form.showInMenu,
        seoTitle: form.seoTitle || null,
        seoDescription: form.seoDescription || null,
      }),
    onSuccess: (updated) => {
      setError(null);
      onSaved(updated);
      void queryClient.invalidateQueries({ queryKey: ["website"] });
      toast.success("Page settings saved");
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const revisions = useQuery({
    queryKey: ["website-revisions", page.id],
    queryFn: () => api.get<{ id: string; createdAt: string; author: string | null }[]>(`/website/pages/${page.id}/revisions`),
  });

  const restore = useMutation({
    mutationFn: (revisionId: string) => api.post<WebsitePageDetail>(`/website/pages/${page.id}/revisions/${revisionId}/restore`),
    onSuccess: (restored) => {
      onRestored(restored);
      toast.success("Old version loaded. Publish to make it live.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div>
      <div className="border-b border-slate-200 px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">Page settings</p>
        <p className="text-xs text-slate-500">Click any section on the page to edit it.</p>
      </div>
      <div className="space-y-4 p-4">
        <FormError message={error} />
        <Field label="Page title">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Address" hint={page.isHome ? "This is the home page" : undefined}>
          <div className="flex items-center rounded-lg border border-slate-300 bg-slate-50 pl-3 text-sm text-slate-500">
            /
            <input
              value={form.slug}
              disabled={page.isHome}
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
              className="h-10 w-full rounded-r-lg bg-white px-1 text-slate-900 focus:outline-none disabled:bg-slate-50"
            />
          </div>
        </Field>
        <label className="flex items-center justify-between text-sm text-slate-700">
          Show in the menu
          <Toggle checked={form.showInMenu} onChange={(v) => setForm({ ...form, showInMenu: v })} label="Show in the menu" />
        </label>
        <Field label="Title on Google" hint={`${form.seoTitle.length}/70 · leave empty to use the page title`}>
          <Input value={form.seoTitle} maxLength={70} onChange={(e) => setForm({ ...form, seoTitle: e.target.value })} />
        </Field>
        <Field label="Description on Google" hint={`${form.seoDescription.length}/170`}>
          <Textarea value={form.seoDescription} maxLength={170} rows={3} onChange={(e) => setForm({ ...form, seoDescription: e.target.value })} />
        </Field>
        <Button className="w-full" loading={save.isPending} onClick={() => save.mutate()}>
          Save page settings
        </Button>
      </div>

      <div className="border-t border-slate-200 p-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <History className="size-3.5" /> Published versions
        </p>
        {!revisions.data?.length ? (
          <p className="text-sm text-slate-500">Each time you publish, a copy is kept here.</p>
        ) : (
          <ul className="space-y-1">
            {revisions.data.map((r, index) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
                <span>
                  <span className="block text-slate-700">{new Date(r.createdAt).toLocaleString()}</span>
                  <span className="text-xs text-slate-500">{index === 0 ? "Live now · " : ""}{r.author ?? ""}</span>
                </span>
                <button className="text-xs font-medium text-brand hover:underline" onClick={() => confirm("Replace the current draft with this version?") && restore.mutate(r.id)}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
