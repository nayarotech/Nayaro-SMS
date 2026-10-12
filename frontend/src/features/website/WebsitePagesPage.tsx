import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Eye, EyeOff, Globe, GripVertical, Home, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/Button";
import { Badge, Card, Spinner } from "@/components/ui/display";
import { Field, FormError, Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/forms";
import { siteUrl, useBuilderMeta, useWebsite, type WebsitePageDetail, type WebsitePageSummary } from "./website.api";

export function WebsitePagesPage() {
  const { data: website, isLoading } = useWebsite();
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["website"] });
  const run = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const starter = useMutation({
    mutationFn: () => api.post("/website/starter"),
    onSuccess: async () => {
      await refresh();
      toast.success("Your website is ready — edit any page, then publish it");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  if (isLoading || !website) return <Spinner />;
  const pages = website.pages;

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ordered = arrayMove(pages, pages.findIndex((p) => p.id === active.id), pages.findIndex((p) => p.id === over.id));
    // Show the new order straight away, then save it
    queryClient.setQueryData(["website"], { ...website, pages: ordered });
    run.mutate(() => api.put("/website/pages-order", { pageIds: ordered.map((p) => p.id) }));
  };

  if (pages.length === 0) {
    return (
      <Card>
        <div className="mx-auto max-w-xl py-10 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <Globe className="size-7" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Create your school's website</h2>
          <p className="mt-2 text-sm text-slate-500">
            We'll set up Home, About, Academics, Admissions and Contact pages with your school's details. Change any text, photo or colour — then publish.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button icon={<Sparkles className="size-4" />} loading={starter.isPending} onClick={() => starter.mutate()}>
              Create my website
            </Button>
            <Button variant="secondary" onClick={() => setCreating(true)}>
              Start from a blank page
            </Button>
          </div>
        </div>
        {creating && <NewPageModal onClose={() => setCreating(false)} onCreated={(page) => navigate(`/website/pages/${page.id}/edit`)} />}
      </Card>
    );
  }

  const homePublished = pages.some((p) => p.isHome && p.status === "PUBLISHED");

  return (
    <div className="space-y-6">
      <SiteStatusCard />

      <Card
        padded={false}
        title="Pages"
        actions={can("website.edit") && <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New page</Button>}
      >
        <p className="border-b border-slate-100 px-5 py-2 text-xs text-slate-500">Drag pages to change their order in the menu.</p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={pages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <ul className="divide-y divide-slate-100">
              {pages.map((page) => (
                <PageRow
                  key={page.id}
                  page={page}
                  schoolCode={website.schoolCode}
                  canPublish={can("website.publish")}
                  onToggleMenu={() => run.mutate(() => api.patch(`/website/pages/${page.id}`, { showInMenu: !page.showInMenu }))}
                  onMakeHome={() => run.mutate(() => api.post(`/website/pages/${page.id}/home`))}
                  onDuplicate={() => run.mutate(() => api.post(`/website/pages/${page.id}/duplicate`))}
                  onDelete={() => confirm(`Delete the page "${page.title}"? This can't be undone.`) && run.mutate(() => api.delete(`/website/pages/${page.id}`))}
                  onPublish={() => run.mutate(() => api.post(`/website/pages/${page.id}/publish`))}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </Card>

      {!homePublished && <p className="text-sm text-amber-700">Publish the home page so the website can go online.</p>}
      {creating && <NewPageModal onClose={() => setCreating(false)} onCreated={(page) => navigate(`/website/pages/${page.id}/edit`)} />}
    </div>
  );
}

function PageRow(props: {
  page: WebsitePageSummary;
  schoolCode: string;
  canPublish: boolean;
  onToggleMenu: () => void;
  onMakeHome: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onPublish: () => void;
}) {
  const { page } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn("flex flex-wrap items-center gap-3 bg-white px-5 py-3", isDragging && "relative z-10 shadow-lg")}>
      <button {...attributes} {...listeners} className="cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing" aria-label="Drag to reorder">
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">
        <Link to={`/website/pages/${page.id}/edit`} className="flex items-center gap-2 font-medium text-slate-900 hover:text-brand">
          {page.isHome && <Home className="size-4 text-brand" />}
          {page.title}
        </Link>
        <p className="text-xs text-slate-500">
          /{page.slug} · edited {new Date(page.updatedAt).toLocaleDateString()}
        </p>
      </div>
      {page.status === "DRAFT" ? <Badge tone="amber">Draft</Badge> : page.hasUnpublishedChanges ? <Badge tone="blue">Unpublished changes</Badge> : <Badge tone="green">Live</Badge>}
      <button onClick={props.onToggleMenu} title={page.showInMenu ? "Shown in menu — click to hide" : "Hidden from menu — click to show"} className="rounded p-1.5 text-slate-400 hover:bg-slate-100">
        {page.showInMenu ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </button>
      <div className="flex flex-wrap gap-1">
        <Link to={`/website/pages/${page.id}/edit`}>
          <Button size="sm" icon={<Pencil className="size-3.5" />}>Edit</Button>
        </Link>
        {props.canPublish && page.hasUnpublishedChanges && (
          <Button size="sm" variant="secondary" onClick={props.onPublish}>
            Publish
          </Button>
        )}
        {page.status === "PUBLISHED" && (
          <a href={siteUrl(props.schoolCode, page.slug)} target="_blank" rel="noreferrer">
            <Button size="sm" variant="ghost" icon={<ExternalLink className="size-3.5" />} aria-label="View" />
          </a>
        )}
        {!page.isHome && props.canPublish && page.status === "PUBLISHED" && (
          <Button size="sm" variant="ghost" icon={<Home className="size-3.5" />} onClick={props.onMakeHome} title="Make home page" aria-label="Make home page" />
        )}
        <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={props.onDuplicate} title="Duplicate" aria-label="Duplicate" />
        {!page.isHome && <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={props.onDelete} title="Delete" aria-label="Delete" />}
      </div>
    </li>
  );
}

/** Online/offline switch and the website address. */
function SiteStatusCard() {
  const { data: website } = useWebsite();
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => api.patch("/website", { isPublished: !website!.isPublished }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["website"] });
      toast.success(website!.isPublished ? "Website is offline" : "Your website is online!");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!website) return null;
  const url = website.customDomain ? `https://${website.customDomain}` : siteUrl(website.schoolCode);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={cn("flex size-11 items-center justify-center rounded-xl", website.isPublished ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600")}>
            <Globe className="size-6" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">{website.isPublished ? "Your website is online" : "Your website is offline"}</p>
            <a href={url} target="_blank" rel="noreferrer" className="text-sm text-brand hover:underline">{url}</a>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-slate-600">
          <Link to="/website/posts" className="hover:text-brand"><b className="text-slate-900">{website.counts.notices}</b> notices</Link>
          <Link to="/website/posts?type=NEWS" className="hover:text-brand"><b className="text-slate-900">{website.counts.news}</b> news</Link>
          <Link to="/website/posts?type=EVENT" className="hover:text-brand"><b className="text-slate-900">{website.counts.events}</b> events</Link>
          <Link to="/website/gallery" className="hover:text-brand"><b className="text-slate-900">{website.counts.albums}</b> albums</Link>
        </div>
        {can("website.publish") && (
          <Button variant={website.isPublished ? "secondary" : "primary"} loading={toggle.isPending} onClick={() => toggle.mutate()}>
            {website.isPublished ? "Take offline" : "Put website online"}
          </Button>
        )}
      </div>
    </Card>
  );
}

function NewPageModal({ onClose, onCreated }: { onClose: () => void; onCreated: (page: WebsitePageDetail) => void }) {
  const { data: meta } = useBuilderMeta();
  const queryClient = useQueryClient();
  const [templateId, setTemplateId] = useState("blank");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.post<WebsitePageDetail>("/website/pages", { title: title || meta?.templates.find((t) => t.id === templateId)?.title || "New page", templateId }),
    onSuccess: async (page) => {
      await queryClient.invalidateQueries({ queryKey: ["website"] });
      onCreated(page);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="New page"
      description="Start from a ready-made layout — you can change everything afterwards."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={create.isPending} onClick={() => create.mutate()}>Create and edit</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-2 sm:grid-cols-2">
          {meta?.templates.map((template) => (
            <button
              key={template.id}
              onClick={() => {
                setTemplateId(template.id);
                if (!title || meta.templates.some((t) => t.title === title)) setTitle(template.id === "blank" ? "" : template.title);
              }}
              className={cn("rounded-xl border p-3 text-left", templateId === template.id ? "border-brand bg-brand-soft" : "border-slate-200 hover:border-slate-300")}
            >
              <p className="text-sm font-semibold text-slate-900">{template.name}</p>
              <p className="mt-0.5 text-xs text-slate-500">{template.description}</p>
            </button>
          ))}
        </div>
        <Field label="Page title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Facilities" />
        </Field>
      </div>
    </Modal>
  );
}
