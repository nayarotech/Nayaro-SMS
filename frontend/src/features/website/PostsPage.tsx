import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarDays, FileText, Newspaper, Paperclip, Pin, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { DateInput } from "@/components/ui/DateInput";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { Checkbox, Field, FormError, Input, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { Pagination, Table } from "@/components/ui/Table";
import { useToast } from "@/components/ui/toast";
import { api, uploadFile, type Paginated } from "@/lib/api";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/forms";
import { useFormatDate } from "@/lib/use-format-date";
import { ImageInput } from "./editor/fields/ImageInput";
import { RichTextInput } from "./editor/fields/RichTextInput";
import { siteUrl, useWebsite } from "./website.api";

type PostType = "NOTICE" | "NEWS" | "EVENT";

interface Post {
  id: string;
  type: PostType;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  coverImageKey: string | null;
  attachments: { title: string; fileKey: string; url: string }[];
  isPinned: boolean;
  eventStart: string | null;
  eventEnd: string | null;
  location: string | null;
  status: "DRAFT" | "PUBLISHED";
  publishedAt: string | null;
  updatedAt: string;
}

const TYPES: { type: PostType; label: string; singular: string; icon: typeof Bell; path: string }[] = [
  { type: "NOTICE", label: "Notices", singular: "notice", icon: Bell, path: "notices" },
  { type: "NEWS", label: "News", singular: "news story", icon: Newspaper, path: "news" },
  { type: "EVENT", label: "Events", singular: "event", icon: CalendarDays, path: "events" },
];

export function PostsPage() {
  const [params, setParams] = useSearchParams();
  const type = (params.get("type") as PostType) || "NOTICE";
  const config = TYPES.find((t) => t.type === type)!;
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Post | "new" | null>(null);
  const formatDate = useFormatDate();
  const { data: website } = useWebsite();

  const { data, isLoading } = useQuery({
    queryKey: ["website-posts", type, page],
    queryFn: () => api.get<Paginated<Post>>("/website/posts", { type, page, pageSize: 20 }),
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {TYPES.map((t) => (
            <button
              key={t.type}
              onClick={() => (setParams({ type: t.type }), setPage(1))}
              className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium", t.type === type ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
            >
              <t.icon className="size-4" /> {t.label}
            </button>
          ))}
        </div>
        <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
          New {config.singular}
        </Button>
      </div>

      <Card padded={false}>
        <Table
          loading={isLoading}
          rows={data?.items}
          rowKey={(p) => p.id}
          onRowClick={setEditing}
          empty={
            <EmptyState
              icon={<config.icon className="size-8" />}
              title={`No ${config.label.toLowerCase()} yet`}
              description={type === "NOTICE" ? "Notices appear on the website's notice board and in the flash news bar." : type === "EVENT" ? "Upcoming events show on the home page automatically." : "Share achievements and stories from your school."}
              action={<Button size="sm" onClick={() => setEditing("new")}>Write the first one</Button>}
            />
          }
          columns={[
            {
              header: "Title",
              cell: (p) => (
                <div className="flex items-center gap-2">
                  {p.isPinned && <Pin className="size-3.5 shrink-0 text-amber-500" />}
                  <span className="font-medium text-slate-900">{p.title}</span>
                  {p.attachments.length > 0 && <Paperclip className="size-3.5 shrink-0 text-slate-400" />}
                </div>
              ),
            },
            ...(type === "EVENT"
              ? [{ header: "Date", cell: (p: Post) => <span className="text-sm">{formatDate(p.eventStart)}</span> }, { header: "Place", cell: (p: Post) => p.location ?? "—" }]
              : [{ header: "Published", cell: (p: Post) => <span className="text-sm">{p.publishedAt ? formatDate(p.publishedAt.slice(0, 10)) : "—"}</span> }]),
            { header: "Status", cell: (p) => (p.status === "PUBLISHED" ? <Badge tone="green">Published</Badge> : <Badge tone="amber">Draft</Badge>) },
            {
              header: "",
              className: "text-right",
              cell: (p) =>
                p.status === "PUBLISHED" && website ? (
                  <a href={siteUrl(website.schoolCode, `${config.path}/${p.slug}`)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-sm text-brand hover:underline">
                    View
                  </a>
                ) : null,
            },
          ]}
        />
        {data && <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} />}
      </Card>

      {editing && <PostEditor post={editing === "new" ? null : editing} type={type} onClose={() => setEditing(null)} />}
    </div>
  );
}

interface PostForm {
  title: string;
  excerpt: string;
  content: string;
  coverImageKey: string | null;
  attachments: { title: string; fileKey: string }[];
  isPinned: boolean;
  eventStart: string;
  eventEnd: string;
  location: string;
}

function PostEditor({ post, type, onClose }: { post: Post | null; type: PostType; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const config = TYPES.find((t) => t.type === (post?.type ?? type))!;
  const [form, setForm] = useState<PostForm>({
    title: post?.title ?? "",
    excerpt: post?.excerpt ?? "",
    content: post?.content ?? "",
    coverImageKey: post?.coverImageKey ?? null,
    attachments: post?.attachments.map(({ title, fileKey }) => ({ title, fileKey })) ?? [],
    isPinned: post?.isPinned ?? false,
    eventStart: post?.eventStart ?? "",
    eventEnd: post?.eventEnd ?? "",
    location: post?.location ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const set = (changes: Partial<PostForm>) => setForm((f) => ({ ...f, ...changes }));

  const save = useMutation({
    mutationFn: (status: "DRAFT" | "PUBLISHED") => {
      const body = {
        type: post?.type ?? type,
        title: form.title,
        excerpt: form.excerpt || null,
        content: form.content,
        coverImageKey: form.coverImageKey,
        attachments: form.attachments,
        isPinned: form.isPinned,
        eventStart: form.eventStart || null,
        eventEnd: form.eventEnd || null,
        location: form.location || null,
        status,
      };
      return post ? api.put(`/website/posts/${post.id}`, body) : api.post("/website/posts", body);
    },
    onSuccess: async (_, status) => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["website-posts"] }), queryClient.invalidateQueries({ queryKey: ["website"] })]);
      toast.success(status === "PUBLISHED" ? "Published on the website" : "Saved as draft");
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/website/posts/${post!.id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["website-posts"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const attach = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadFile(file, "website-file");
      set({ attachments: [...form.attachments, { title: file.name.replace(/\.[^.]+$/, ""), fileKey: uploaded.key }] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={post ? `Edit ${config.singular}` : `New ${config.singular}`}
      footer={
        <>
          {post && (
            <Button variant="ghost" className="mr-auto" icon={<Trash2 className="size-4" />} onClick={() => confirm("Delete this permanently?") && remove.mutate()}>
              Delete
            </Button>
          )}
          <Button variant="secondary" loading={save.isPending && save.variables === "DRAFT"} onClick={() => save.mutate("DRAFT")}>
            {post?.status === "PUBLISHED" ? "Unpublish & save draft" : "Save draft"}
          </Button>
          <Button loading={save.isPending && save.variables === "PUBLISHED"} disabled={!form.title.trim()} onClick={() => save.mutate("PUBLISHED")}>
            {post?.status === "PUBLISHED" ? "Update" : "Publish"}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
        <div className="space-y-4">
          <FormError message={error} />
          <Field label="Title" required>
            <Input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder={type === "NOTICE" ? "e.g. School closed for Dashain from Ashwin 28" : ""} autoFocus />
          </Field>
          <Field label="Details">
            <RichTextInput value={form.content} onChange={(content) => set({ content })} />
          </Field>
          <Field label="Short summary" hint="Shown in lists. Leave empty to use the start of the details.">
            <Textarea value={form.excerpt} rows={2} maxLength={300} onChange={(e) => set({ excerpt: e.target.value })} />
          </Field>
        </div>

        <div className="space-y-4">
          {(post?.type ?? type) === "EVENT" && (
            <>
              <Field label="Starts" required>
                <DateInput value={form.eventStart} onChange={(eventStart) => set({ eventStart })} />
              </Field>
              <Field label="Ends (optional)">
                <DateInput value={form.eventEnd} onChange={(eventEnd) => set({ eventEnd })} />
              </Field>
              <Field label="Place">
                <Input value={form.location} onChange={(e) => set({ location: e.target.value })} placeholder="e.g. School ground" />
              </Field>
            </>
          )}
          <Field label="Cover photo">
            <ImageInput value={form.coverImageKey} onChange={(coverImageKey) => set({ coverImageKey })} />
          </Field>
          <Field label="Attachments" hint="PDF, Word or images — e.g. the signed notice">
            <ul className="space-y-1">
              {form.attachments.map((a, index) => (
                <li key={a.fileKey} className="flex items-center gap-2">
                  <FileText className="size-4 shrink-0 text-slate-400" />
                  <Input className="h-8" value={a.title} onChange={(e) => set({ attachments: form.attachments.map((x, i) => (i === index ? { ...x, title: e.target.value } : x)) })} />
                  <button onClick={() => set({ attachments: form.attachments.filter((_, i) => i !== index) })} aria-label="Remove attachment">
                    <X className="size-4 text-slate-400" />
                  </button>
                </li>
              ))}
            </ul>
            <label className="mt-2 inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-brand hover:underline">
              <Paperclip className="size-4" /> {uploading ? "Uploading…" : "Attach a file"}
              <input type="file" className="hidden" accept=".pdf,.doc,.docx,image/*" onChange={(e) => (void attach(e.target.files?.[0]), (e.target.value = ""))} />
            </label>
          </Field>
          <Checkbox label="Pin to the top (important)" checked={form.isPinned} onChange={(e) => set({ isPinned: e.target.checked })} />
        </div>
      </div>
    </Modal>
  );
}
