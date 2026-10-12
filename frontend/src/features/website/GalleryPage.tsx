import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Images, Plus, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DateInput } from "@/components/ui/DateInput";
import { Badge, Card, EmptyState, Spinner } from "@/components/ui/display";
import { Checkbox, Field, FormError, Input, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast";
import { api, uploadFile } from "@/lib/api";
import { errorMessage } from "@/lib/forms";
import { useFormatDate } from "@/lib/use-format-date";
import { publicFileUrl, useAlbums, type Album } from "./website.api";

export function GalleryPage() {
  const { data: albums, isLoading } = useAlbums();
  const [editing, setEditing] = useState<Album | "new" | null>(null);
  const formatDate = useFormatDate();

  if (isLoading) return <Spinner />;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">Albums appear on the website's Gallery page and in "Photo gallery" blocks.</p>
        <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>New album</Button>
      </div>
      {!albums?.length ? (
        <Card>
          <EmptyState icon={<Images className="size-8" />} title="No albums yet" description="Create an album for sports day, annual function, trips and more." action={<Button size="sm" onClick={() => setEditing("new")}>Create an album</Button>} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {albums.map((album) => (
            <button key={album.id} onClick={() => setEditing(album)} className="overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition-shadow hover:shadow-md">
              {album.photos[0] ? (
                <img src={album.photos[0].url} alt="" className="aspect-[4/3] w-full object-cover" />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center bg-slate-100 text-slate-400"><Images className="size-8" /></div>
              )}
              <div className="p-3">
                <p className="font-medium text-slate-900">{album.title}</p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                  {album.photos.length} photos {album.eventDate && `· ${formatDate(album.eventDate)}`}
                  {!album.isPublished && <Badge tone="amber">Hidden</Badge>}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
      {editing && <AlbumEditor album={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

type Photo = { key: string; caption?: string };

function AlbumEditor({ album, onClose }: { album: Album | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(album?.title ?? "");
  const [description, setDescription] = useState(album?.description ?? "");
  const [eventDate, setEventDate] = useState(album?.eventDate ?? "");
  const [isPublished, setIsPublished] = useState(album?.isPublished ?? true);
  const [photos, setPhotos] = useState<Photo[]>(album?.photos.map(({ key, caption }) => ({ key, caption })) ?? []);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  /** Uploads one at a time so slow connections don't time out. */
  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files];
    setProgress({ done: 0, total: list.length });
    for (const [index, file] of list.entries()) {
      try {
        const uploaded = await uploadFile(file, "website-image");
        setPhotos((current) => [...current, { key: uploaded.key, caption: "" }]);
      } catch (e) {
        toast.error(`${file.name}: ${errorMessage(e)}`);
      }
      setProgress({ done: index + 1, total: list.length });
    }
    setProgress(null);
    if (input.current) input.current.value = "";
  };

  const save = useMutation({
    mutationFn: () => {
      const body = { title, description: description || null, eventDate: eventDate || null, isPublished, photos };
      return album ? api.patch(`/website/albums/${album.id}`, body) : api.post("/website/albums", body);
    },
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["website-albums"] }), queryClient.invalidateQueries({ queryKey: ["website"] })]);
      toast.success("Album saved");
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/website/albums/${album!.id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["website-albums"] });
      onClose();
    },
  });

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setPhotos((current) => arrayMove(current, current.findIndex((p) => p.key === active.id), current.findIndex((p) => p.key === over.id)));
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={album ? album.title : "New album"}
      footer={
        <>
          {album && <Button variant="ghost" className="mr-auto" icon={<Trash2 className="size-4" />} onClick={() => confirm("Delete this album?") && remove.mutate()}>Delete album</Button>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!title.trim() || progress !== null} loading={save.isPending} onClick={() => save.mutate()}>Save album</Button>
        </>
      }
    >
      <div className="space-y-5">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field label="Album title" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sports week 2083" autoFocus />
          </Field>
          <Field label="Date">
            <DateInput value={eventDate} onChange={setEventDate} />
          </Field>
        </div>
        <Field label="Description">
          <Textarea value={description} rows={2} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Checkbox label="Show on the website" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">Photos ({photos.length}) <span className="font-normal text-slate-400">— drag to reorder; the first is the cover</span></p>
            <Button size="sm" variant="secondary" icon={<ImagePlus className="size-4" />} disabled={progress !== null} onClick={() => input.current?.click()}>
              {progress ? `Uploading ${progress.done}/${progress.total}…` : "Add photos"}
            </Button>
            <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void uploadPhotos(e.target.files)} />
          </div>
          {photos.length === 0 ? (
            <button onClick={() => input.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-10 text-sm text-slate-500 hover:border-brand hover:text-brand">
              <ImagePlus className="size-8" /> Choose photos to upload (you can select many at once)
            </button>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={photos.map((p) => p.key)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {photos.map((photo, index) => (
                    <SortablePhoto
                      key={photo.key}
                      photo={photo}
                      isCover={index === 0}
                      onCaption={(caption) => setPhotos((all) => all.map((p) => (p.key === photo.key ? { ...p, caption } : p)))}
                      onRemove={() => setPhotos((all) => all.filter((p) => p.key !== photo.key))}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>
    </Modal>
  );
}

function SortablePhoto({ photo, isCover, onCaption, onRemove }: { photo: Photo; isCover: boolean; onCaption: (caption: string) => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.key });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? "relative z-10 opacity-70" : undefined}>
      <div className="group relative overflow-hidden rounded-lg">
        <img src={publicFileUrl(photo.key)} alt="" {...attributes} {...listeners} className="aspect-square w-full cursor-grab object-cover active:cursor-grabbing" />
        {isCover && <span className="absolute left-1.5 top-1.5"><Badge tone="brand">Cover</Badge></span>}
        <button onClick={onRemove} className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100" aria-label="Remove photo">
          <X className="size-3.5" />
        </button>
      </div>
      <input value={photo.caption ?? ""} onChange={(e) => onCaption(e.target.value)} placeholder="Caption" className="mt-1 w-full rounded border border-transparent px-1 py-0.5 text-xs text-slate-600 hover:border-slate-200 focus:border-brand focus:outline-none" />
    </div>
  );
}
