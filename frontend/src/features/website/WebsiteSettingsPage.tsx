import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, Spinner } from "@/components/ui/display";
import { Field, FormError, Input, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/forms";
import { ImageInput } from "./editor/fields/ImageInput";
import { siteUrl, useWebsite, type WebsiteOverview } from "./website.api";

export function WebsiteSettingsPage() {
  const { data: website } = useWebsite();
  if (!website) return <Spinner />;
  return <SettingsForm key={website.id + JSON.stringify(website.seo) + website.customDomain} website={website} />;
}

function SettingsForm({ website }: { website: WebsiteOverview }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [seo, setSeo] = useState({ title: website.seo.title, description: website.seo.description, imageKey: website.seo.imageKey });
  const [domain, setDomain] = useState(website.customDomain ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => api.patch("/website", { seo, customDomain: domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") || null }),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["website"] });
      toast.success("Website settings saved");
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <div className="max-w-3xl space-y-6">
      <FormError message={error} />
      <Card title="How the website appears on Google and social media">
        <div className="space-y-4">
          <Field label="Website title" hint={`${seo.title.length}/70`}>
            <Input value={seo.title} maxLength={70} onChange={(e) => setSeo({ ...seo, title: e.target.value })} />
          </Field>
          <Field label="Description" hint={`${seo.description.length}/170 · one or two sentences about the school`}>
            <Textarea value={seo.description} maxLength={170} rows={3} onChange={(e) => setSeo({ ...seo, description: e.target.value })} />
          </Field>
          <Field label="Share image" hint="Shown when the website is shared on Facebook or WhatsApp. 1200×630 works best.">
            <ImageInput value={seo.imageKey} onChange={(imageKey) => setSeo({ ...seo, imageKey })} />
          </Field>
          {/* Google result preview */}
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500">{siteUrl(website.schoolCode)}</p>
            <p className="text-lg text-[#1a0dab]">{seo.title || "Website title"}</p>
            <p className="text-sm text-slate-600">{seo.description || "Description"}</p>
          </div>
        </div>
      </Card>

      <Card title="Your own web address (optional)">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            The website always works at <a className="text-brand hover:underline" href={siteUrl(website.schoolCode)} target="_blank" rel="noreferrer">{siteUrl(website.schoolCode)}</a>. To use your school's
            own address (for example <b>www.yourschool.edu.np</b>), enter it here, then ask whoever manages your domain to point it to this platform (a CNAME record).
          </p>
          <Field label="Domain">
            <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="www.yourschool.edu.np" />
          </Field>
        </div>
      </Card>

      <Button loading={save.isPending} onClick={() => save.mutate()}>Save settings</Button>
    </div>
  );
}
