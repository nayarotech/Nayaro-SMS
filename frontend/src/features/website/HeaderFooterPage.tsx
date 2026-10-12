import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CornerDownRight, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { menuItems, newBlockId, type FooterConfig, type HeaderConfig, type MenuItem } from "@site-renderer";
import { Button } from "@/components/ui/Button";
import { Card, Spinner } from "@/components/ui/display";
import { Field, Input, Textarea, Toggle } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/forms";
import { LinkInput } from "./editor/fields/LinkInput";
import { LinkTargetsContext } from "./editor/link-targets";
import { PreviewFooter, PreviewHeader, SiteStyles } from "./preview";
import { preventNavigation, useEditorContext, usePreviewData } from "./preview-context";
import { useWebsite, type WebsiteOverview } from "./website.api";

export function HeaderFooterPage() {
  const { data: website } = useWebsite();
  if (!website) return <Spinner />;
  return (
    <LinkTargetsContext.Provider value={{ pages: website.pages, anchors: ["admission", "contact", "about"] }}>
      <HeaderFooterEditor key={JSON.stringify([website.header, website.footer])} website={website} />
    </LinkTargetsContext.Provider>
  );
}

function HeaderFooterEditor({ website }: { website: WebsiteOverview }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [header, setHeader] = useState<HeaderConfig>(website.header);
  const [footer, setFooter] = useState<FooterConfig>(website.footer);
  const dirty = JSON.stringify([header, footer]) !== JSON.stringify([website.header, website.footer]);
  const ctx = useEditorContext(usePreviewData([]), website.pages, website.schoolCode);
  const publishedMenuPages = website.pages.filter((p) => p.showInMenu && p.status === "PUBLISHED");

  const save = useMutation({
    mutationFn: () => api.patch("/website", { header, footer }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["website"] });
      toast.success("Header and footer saved");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const switchToCustomMenu = () => setHeader({ ...header, autoMenu: false, menu: header.menu.length ? header.menu : menuItems({ ...header, autoMenu: true }, publishedMenuPages) });

  return (
    <div className="grid gap-6 xl:grid-cols-[26rem_1fr]">
      <div className="space-y-6">
        <Card title="Top bar">
          <div className="space-y-4">
            <label className="flex items-center justify-between text-sm text-slate-700">
              Show the top bar (phone, email, social links)
              <Toggle checked={header.showTopBar} onChange={(v) => setHeader({ ...header, showTopBar: v })} />
            </label>
            <Field label="Message on the left">
              <Input value={header.topBarText} maxLength={120} onChange={(e) => setHeader({ ...header, topBarText: e.target.value })} />
            </Field>
          </div>
        </Card>

        <Card title="Menu">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <button onClick={() => setHeader({ ...header, autoMenu: true })} className={`rounded-lg border p-3 text-left ${header.autoMenu ? "border-brand bg-brand-soft" : "border-slate-200"}`}>
                <b className="block text-slate-900">Automatic</b>
                <span className="text-xs text-slate-500">Pages marked "show in menu", in page order</span>
              </button>
              <button onClick={switchToCustomMenu} className={`rounded-lg border p-3 text-left ${!header.autoMenu ? "border-brand bg-brand-soft" : "border-slate-200"}`}>
                <b className="block text-slate-900">Custom</b>
                <span className="text-xs text-slate-500">Choose items, add dropdowns and outside links</span>
              </button>
            </div>
            {!header.autoMenu && <MenuBuilder items={header.menu} onChange={(menu) => setHeader({ ...header, menu })} />}
            <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
              <Field label="Button text">
                <Input value={header.ctaLabel} maxLength={30} onChange={(e) => setHeader({ ...header, ctaLabel: e.target.value })} placeholder="Leave empty to hide" />
              </Field>
              <Field label="Button link">
                <LinkInput value={header.ctaLink} onChange={(ctaLink) => setHeader({ ...header, ctaLink })} />
              </Field>
            </div>
          </div>
        </Card>

        <Card title="Footer">
          <div className="space-y-4">
            <Field label="About the school (short)">
              <Textarea value={footer.about} maxLength={400} rows={3} onChange={(e) => setFooter({ ...footer, about: e.target.value })} />
            </Field>
            {footer.columns.map((column, ci) => (
              <div key={ci} className="space-y-2 rounded-lg border border-slate-200 p-3">
                <div className="flex gap-2">
                  <Input value={column.title} onChange={(e) => setFooter({ ...footer, columns: footer.columns.map((c, i) => (i === ci ? { ...c, title: e.target.value } : c)) })} placeholder="Column title" />
                  <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => setFooter({ ...footer, columns: footer.columns.filter((_, i) => i !== ci) })} aria-label="Remove column" />
                </div>
                {column.links.map((link, li) => {
                  const setLink = (changes: Partial<typeof link>) =>
                    setFooter({ ...footer, columns: footer.columns.map((c, i) => (i === ci ? { ...c, links: c.links.map((l, j) => (j === li ? { ...l, ...changes } : l)) } : c)) });
                  return (
                    <div key={li} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <Input value={link.label} onChange={(e) => setLink({ label: e.target.value })} placeholder="Label" />
                      <LinkInput value={link.link} onChange={(value) => setLink({ link: value })} />
                      <button onClick={() => setFooter({ ...footer, columns: footer.columns.map((c, i) => (i === ci ? { ...c, links: c.links.filter((_, j) => j !== li) } : c)) })} className="self-start p-2 text-slate-400 hover:text-red-600" aria-label="Remove link">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  );
                })}
                <button onClick={() => setFooter({ ...footer, columns: footer.columns.map((c, i) => (i === ci ? { ...c, links: [...c.links, { label: "New link", link: "" }] } : c)) })} className="text-xs font-medium text-brand hover:underline">
                  + Add link
                </button>
              </div>
            ))}
            {footer.columns.length < 3 && (
              <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => setFooter({ ...footer, columns: [...footer.columns, { title: "Links", links: [] }] })}>
                Add a column of links
              </Button>
            )}
            <div className="grid gap-3 border-t border-slate-100 pt-4">
              {(["facebook", "youtube", "instagram"] as const).map((network) => (
                <Field key={network} label={`${network[0].toUpperCase()}${network.slice(1)} page`}>
                  <Input value={footer.social[network]} onChange={(e) => setFooter({ ...footer, social: { ...footer.social, [network]: e.target.value } })} placeholder={`https://${network}.com/yourschool`} />
                </Field>
              ))}
              <Field label="Copyright line" hint="Leave empty for “© year School name. All rights reserved.”">
                <Input value={footer.copyright} onChange={(e) => setFooter({ ...footer, copyright: e.target.value })} />
              </Field>
            </div>
          </div>
        </Card>

        <div className="flex gap-2">
          <Button className="flex-1" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>Save header & footer</Button>
          {dirty && <Button variant="secondary" onClick={() => (setHeader(website.header), setFooter(website.footer))}>Reset</Button>}
        </div>
      </div>

      <div className="space-y-4 xl:sticky xl:top-20 xl:self-start" onClickCapture={preventNavigation}>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Live preview</p>
        <SiteStyles theme={website.theme} />
        <div className="sms-site overflow-hidden rounded-xl shadow-lg ring-1 ring-slate-200">
          <PreviewHeader header={header} footer={footer} pages={website.pages} ctx={ctx} />
          <div className="flex h-24 items-center justify-center bg-slate-50 text-sm text-slate-400">Page content</div>
          <PreviewFooter footer={footer} ctx={ctx} />
        </div>
      </div>
    </div>
  );
}

/** Edit menu items: label, link, order and one level of dropdown items. */
function MenuBuilder({ items, onChange }: { items: MenuItem[]; onChange: (items: MenuItem[]) => void }) {
  const update = (index: number, item: MenuItem) => onChange(items.map((it, i) => (i === index ? item : it)));
  const move = (index: number, by: number) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={item.id} className="rounded-lg border border-slate-200 p-2">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <Input value={item.label} onChange={(e) => update(index, { ...item, label: e.target.value })} placeholder="Label" />
            <LinkInput value={item.link} onChange={(link) => update(index, { ...item, link })} />
            <div className="flex items-start">
              <button disabled={index === 0} onClick={() => move(index, -1)} className="p-2 text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label="Move up"><ArrowUp className="size-4" /></button>
              <button disabled={index === items.length - 1} onClick={() => move(index, 1)} className="p-2 text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label="Move down"><ArrowDown className="size-4" /></button>
              <button onClick={() => onChange(items.filter((_, i) => i !== index))} className="p-2 text-slate-400 hover:text-red-600" aria-label="Remove"><Trash2 className="size-4" /></button>
            </div>
          </div>
          {(item.children ?? []).map((child, ci) => (
            <div key={child.id} className="mt-2 grid grid-cols-[auto_1fr_1fr_auto] items-start gap-2 pl-2">
              <CornerDownRight className="mt-3 size-4 text-slate-300" />
              <Input value={child.label} onChange={(e) => update(index, { ...item, children: item.children!.map((c, i) => (i === ci ? { ...c, label: e.target.value } : c)) })} />
              <LinkInput value={child.link} onChange={(link) => update(index, { ...item, children: item.children!.map((c, i) => (i === ci ? { ...c, link } : c)) })} />
              <button onClick={() => update(index, { ...item, children: item.children!.filter((_, i) => i !== ci) })} className="p-2 text-slate-400 hover:text-red-600" aria-label="Remove"><Trash2 className="size-4" /></button>
            </div>
          ))}
          <button onClick={() => update(index, { ...item, children: [...(item.children ?? []), { id: newBlockId(), label: "Sub item", link: "" }] })} className="mt-2 pl-2 text-xs font-medium text-brand hover:underline">
            + Add dropdown item
          </button>
        </div>
      ))}
      {items.length < 10 && (
        <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => onChange([...items, { id: newBlockId(), label: "New item", link: "" }])}>
          Add menu item
        </Button>
      )}
    </div>
  );
}
