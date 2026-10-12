import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { createBlock, renderBlocks, type Theme } from "@site-renderer";
import { Button } from "@/components/ui/Button";
import { Card, Spinner } from "@/components/ui/display";
import { Field, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/forms";
import { PreviewHeader, SiteStyles } from "./preview";
import { preventNavigation, useEditorContext, usePreviewData } from "./preview-context";
import { useBuilderMeta, useWebsite, type WebsiteOverview } from "./website.api";

const COLOR_FIELDS: { key: keyof Theme["colors"]; label: string; help: string }[] = [
  { key: "primary", label: "Main colour", help: "Buttons, links, highlights" },
  { key: "secondary", label: "Accent colour", help: "Small highlights and labels" },
  { key: "dark", label: "Dark colour", help: "Top bar, footer, dark sections" },
  { key: "text", label: "Text colour", help: "" },
  { key: "background", label: "Page background", help: "" },
  { key: "muted", label: "Light background", help: "Tinted sections" },
];

export function ThemePage() {
  const { data: website } = useWebsite();
  if (!website) return <Spinner />;
  return <ThemeEditor key={JSON.stringify(website.theme)} website={website} />;
}

function ThemeEditor({ website }: { website: WebsiteOverview }) {
  const { data: meta } = useBuilderMeta();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [theme, setTheme] = useState<Theme>(website.theme);
  const dirty = JSON.stringify(theme) !== JSON.stringify(website.theme);

  // A small sample page to show the theme on
  const sample = useMemo(() => [createBlock("hero", { height: "md" }), createBlock("features", {}, { background: "muted" }), createBlock("cta", {}, { padding: "sm" })], []);
  const data = usePreviewData(sample);
  const ctx = useEditorContext(data, website.pages, website.schoolCode);

  const save = useMutation({
    mutationFn: () => api.patch("/website", { theme }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["website"] });
      toast.success("Theme saved — your website uses it now");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const setColor = (key: keyof Theme["colors"], value: string) => setTheme({ ...theme, preset: "custom", colors: { ...theme.colors, [key]: value } });

  return (
    <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
      <div className="space-y-6">
        <Card title="Ready-made themes">
          <div className="grid grid-cols-2 gap-2">
            {meta?.themes.map((preset) => (
              <button
                key={preset.id}
                onClick={() => setTheme(preset.theme)}
                className={cn("rounded-xl border p-3 text-left", theme.preset === preset.id ? "border-brand ring-2 ring-brand/20" : "border-slate-200 hover:border-slate-300")}
              >
                <div className="mb-2 flex gap-1">
                  {[preset.theme.colors.primary, preset.theme.colors.secondary, preset.theme.colors.dark].map((c) => (
                    <span key={c} className="size-5 rounded-full ring-1 ring-black/10" style={{ background: c }} />
                  ))}
                  {theme.preset === preset.id && <Check className="ml-auto size-4 text-brand" />}
                </div>
                <p className="text-sm font-medium text-slate-900">{preset.name}</p>
                <p className="text-xs text-slate-500">{preset.theme.headingFont}</p>
              </button>
            ))}
          </div>
        </Card>

        <Card title="Colours">
          <div className="space-y-3">
            {COLOR_FIELDS.map((field) => (
              <label key={field.key} className="flex items-center justify-between gap-3">
                <span>
                  <span className="block text-sm text-slate-800">{field.label}</span>
                  {field.help && <span className="block text-xs text-slate-500">{field.help}</span>}
                </span>
                <span className="flex items-center gap-2">
                  <input type="color" value={theme.colors[field.key]} onChange={(e) => setColor(field.key, e.target.value)} className="h-9 w-11 cursor-pointer rounded border border-slate-300" />
                  <code className="w-16 text-xs text-slate-500">{theme.colors[field.key]}</code>
                </span>
              </label>
            ))}
          </div>
        </Card>

        <Card title="Fonts & shapes">
          <div className="space-y-4">
            <Field label="Headings font">
              <Select value={theme.headingFont} onChange={(e) => setTheme({ ...theme, preset: "custom", headingFont: e.target.value })}>
                {meta?.fonts.map((f) => (
                  <option key={f.name} value={f.name}>{f.name}{f.note ? ` — ${f.note}` : ""}</option>
                ))}
              </Select>
            </Field>
            <Field label="Text font">
              <Select value={theme.bodyFont} onChange={(e) => setTheme({ ...theme, preset: "custom", bodyFont: e.target.value })}>
                {meta?.fonts.map((f) => (
                  <option key={f.name} value={f.name}>{f.name}{f.note ? ` — ${f.note}` : ""}</option>
                ))}
              </Select>
            </Field>
            <Field label="Corners">
              <Select value={theme.radius} onChange={(e) => setTheme({ ...theme, preset: "custom", radius: e.target.value as Theme["radius"] })}>
                <option value="none">Square</option>
                <option value="sm">Slightly rounded</option>
                <option value="md">Rounded</option>
                <option value="lg">Very rounded</option>
              </Select>
            </Field>
            <Field label="Buttons">
              <Select value={theme.buttonShape} onChange={(e) => setTheme({ ...theme, preset: "custom", buttonShape: e.target.value as Theme["buttonShape"] })}>
                <option value="square">Square</option>
                <option value="rounded">Rounded</option>
                <option value="pill">Pill</option>
              </Select>
            </Field>
          </div>
        </Card>

        <div className="flex gap-2">
          <Button className="flex-1" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>Save theme</Button>
          {dirty && <Button variant="secondary" onClick={() => setTheme(website.theme)}>Reset</Button>}
        </div>
      </div>

      <div className="xl:sticky xl:top-20 xl:self-start">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Live preview</p>
        <div className="overflow-hidden rounded-xl shadow-lg ring-1 ring-slate-200" onClickCapture={preventNavigation}>
          <SiteStyles theme={theme} />
          <div className="sms-site">
            <PreviewHeader header={website.header} footer={website.footer} pages={website.pages} ctx={ctx} />
            <div dangerouslySetInnerHTML={{ __html: renderBlocks(sample, ctx).value }} />
          </div>
        </div>
      </div>
    </div>
  );
}
