import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Cloud, CloudOff, ExternalLink, Layers, Loader2, Monitor, Plus, Redo2, Smartphone, Tablet, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { createBlock, newBlockId, type Block } from "@site-renderer";
import { Button } from "@/components/ui/Button";
import { Badge, Spinner } from "@/components/ui/display";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/forms";
import { PreviewFooter, PreviewHeader, SiteStyles } from "../preview";
import { preventNavigation, useEditorContext, usePreviewData } from "../preview-context";
import { useBuilderMeta, useWebsite, type BlockMeta, type BuilderMeta, type WebsiteOverview, type WebsitePageDetail } from "../website.api";
import { BlockLibrary, DragPreview } from "./BlockLibrary";
import { Canvas } from "./Canvas";
import { CANVAS_END, LIBRARY_PREFIX } from "./dnd-ids";
import { BlockInspector, PageSettingsPanel } from "./Inspector";
import { LayersPanel } from "./LayersPanel";
import { LinkTargetsContext } from "./link-targets";
import { useHistory } from "./useHistory";

type Device = "desktop" | "tablet" | "mobile";
const DEVICE_WIDTH: Record<Device, string> = { desktop: "100%", tablet: "820px", mobile: "390px" };
type SaveState = "saved" | "unsaved" | "saving" | "error";

/** Loads everything the editor needs, then renders it (re-mounted per page). */
export function PageEditor() {
  const { pageId } = useParams<{ pageId: string }>();
  const page = useQuery({ queryKey: ["website-page", pageId], queryFn: () => api.get<WebsitePageDetail>(`/website/pages/${pageId}`) });
  const website = useWebsite();
  const meta = useBuilderMeta();

  if (!page.data || !website.data || !meta.data) {
    return <div className="flex h-screen items-center justify-center">{page.error ? <p className="text-slate-500">{errorMessage(page.error)}</p> : <Spinner label="Opening editor…" />}</div>;
  }
  return <Editor key={page.data.id} initialPage={page.data} website={website.data} meta={meta.data} />;
}

function Editor({ initialPage, website, meta }: { initialPage: WebsitePageDetail; website: WebsiteOverview; meta: BuilderMeta }) {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(initialPage);
  const history = useHistory<Block[]>(initialPage.draftBlocks ?? []);
  const blocks = history.value;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<"add" | "layers">("add");
  const [device, setDevice] = useState<Device>("desktop");
  // What the server has; the save status is worked out by comparing with the current blocks
  const [savedBlocks, setSavedBlocks] = useState<Block[]>(blocks);
  // The blocks visitors currently see (compared by reference, so undoing back to them shows "Live" again)
  const [liveBlocks, setLiveBlocks] = useState<Block[] | null>(() =>
    initialPage.status === "PUBLISHED" && JSON.stringify(initialPage.draftBlocks) === JSON.stringify(initialPage.publishedBlocks) ? blocks : null,
  );
  const [saving, setSaving] = useState(false);
  // The content that last failed to save — not retried until it changes again
  const [failedBlocks, setFailedBlocks] = useState<Block[] | null>(null);
  const saveState: SaveState = saving ? "saving" : blocks === failedBlocks ? "error" : blocks === savedBlocks ? "saved" : "unsaved";
  const [dragging, setDragging] = useState<{ label: string; icon: string } | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const blockMeta = useMemo(() => new Map<string, BlockMeta>(meta.blocks.map((b) => [b.type, b])), [meta.blocks]);
  const data = usePreviewData(blocks);
  const ctx = useEditorContext(data, website.pages, website.schoolCode);
  const selected = blocks.find((b) => b.id === selectedId) ?? null;
  const anchors = useMemo(() => blocks.map((b) => b.style?.anchor).filter((a): a is string => Boolean(a)), [blocks]);

  // ─── Editing actions ───────────────────────────────────────

  const insertAt = useCallback(
    (type: string, index: number) => {
      const block = createBlock(type);
      const next = [...blocks];
      next.splice(index, 0, block);
      history.set(next);
      setSelectedId(block.id);
      return block.id;
    },
    [blocks, history],
  );

  const addBelowSelection = (type: string) => {
    const id = insertAt(type, selected ? blocks.indexOf(selected) + 1 : blocks.length);
    // Bring the new section into view once it has rendered
    requestAnimationFrame(() => document.querySelector(`[data-block-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  const updateBlock = useCallback((updated: Block, mergeKey?: string) => history.set(blocks.map((b) => (b.id === updated.id ? updated : b)), mergeKey), [blocks, history]);

  const moveBlock = useCallback(
    (id: string, by: number) => {
      const from = blocks.findIndex((b) => b.id === id);
      const to = from + by;
      if (to < 0 || to >= blocks.length) return;
      history.set(arrayMove(blocks, from, to));
    },
    [blocks, history],
  );

  const duplicateBlock = useCallback(
    (id: string) => {
      const index = blocks.findIndex((b) => b.id === id);
      const copy = { ...structuredClone(blocks[index]), id: newBlockId() };
      history.set([...blocks.slice(0, index + 1), copy, ...blocks.slice(index + 1)]);
      setSelectedId(copy.id);
    },
    [blocks, history],
  );

  const removeBlock = useCallback(
    (id: string) => {
      history.set(blocks.filter((b) => b.id !== id));
      setSelectedId((current) => (current === id ? null : current));
    },
    [blocks, history],
  );

  // ─── Drag and drop ─────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // Prefer whatever is under the pointer; fall back to the nearest section
  const collision: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    return hits.length ? hits : closestCenter(args);
  };

  const isLibraryDrag = (id: string | number) => String(id).startsWith(LIBRARY_PREFIX);

  // Where the pointer is right now (the canvas may auto-scroll while dragging)
  const pointer = useRef<number | null>(null);
  useEffect(() => {
    if (!dragging) return;
    const track = (e: PointerEvent) => (pointer.current = e.clientY);
    window.addEventListener("pointermove", track);
    return () => {
      window.removeEventListener("pointermove", track);
      pointer.current = null;
    };
  }, [dragging]);

  /** Index a library block would be inserted at: before the section under the pointer, or after it if over its lower half. */
  const indexForDrop = ({ over, activatorEvent, delta }: DragOverEvent | DragEndEvent): number | null => {
    if (!over) return null;
    if (over.id === CANVAS_END) return blocks.length;
    const index = blocks.findIndex((b) => b.id === over.id);
    if (index === -1) return null;
    const pointerY = pointer.current ?? (activatorEvent as PointerEvent).clientY + delta.y;
    return pointerY > over.rect.top + over.rect.height / 2 ? index + 1 : index;
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    if (isLibraryDrag(active.id)) {
      const block = active.data.current?.block as BlockMeta;
      setDragging({ label: block.label, icon: block.icon });
    } else {
      const block = blocks.find((b) => b.id === active.id);
      const info = block && blockMeta.get(block.type);
      setDragging({ label: info?.label ?? "Section", icon: info?.icon ?? "star" });
    }
  };

  const onDragOver = (event: DragOverEvent) => {
    if (isLibraryDrag(event.active.id)) setDropIndex(indexForDrop(event));
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (isLibraryDrag(active.id)) {
      const index = indexForDrop(event);
      if (index !== null) insertAt(String(active.id).slice(LIBRARY_PREFIX.length), index);
    } else if (over && active.id !== over.id) {
      const from = blocks.findIndex((b) => b.id === active.id);
      const to = over.id === CANVAS_END ? blocks.length - 1 : blocks.findIndex((b) => b.id === over.id);
      if (from !== -1 && to !== -1) history.set(arrayMove(blocks, from, to));
    }
    setDragging(null);
    setDropIndex(null);
  };

  // ─── Autosave ──────────────────────────────────────────────

  const latest = useRef(blocks);
  useEffect(() => {
    latest.current = blocks;
  }, [blocks]);

  const saveNow = useCallback(async () => {
    const snapshot = latest.current;
    setSaving(true);
    try {
      await api.put(`/website/pages/${page.id}/draft`, { blocks: snapshot });
      setSavedBlocks(snapshot);
      return true;
    } catch (e) {
      setFailedBlocks(snapshot);
      toast.error(errorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  }, [page.id, toast]);

  // Save a moment after the last change (edits made while saving trigger another save)
  useEffect(() => {
    if (blocks === savedBlocks || blocks === failedBlocks || saving) return;
    const timer = setTimeout(() => void saveNow(), 900);
    return () => clearTimeout(timer);
  }, [blocks, savedBlocks, failedBlocks, saving, saveNow]);

  // Warn before closing the tab with unsaved changes
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saveState !== "saved") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  const publish = useMutation({
    mutationFn: async () => {
      const snapshot = latest.current;
      if (saveState !== "saved" && !(await saveNow())) throw new Error("Could not save");
      return { page: await api.post<WebsitePageDetail>(`/website/pages/${page.id}/publish`), snapshot };
    },
    onSuccess: ({ page: published, snapshot }) => {
      setPage(published);
      setLiveBlocks(snapshot);
      void queryClient.invalidateQueries({ queryKey: ["website"] });
      void queryClient.invalidateQueries({ queryKey: ["website-revisions", page.id] });
      toast.success(website.isPublished ? "Published — visitors see the new version now" : "Published. Put the website online from the Website screen.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const openPreview = async () => {
    const tab = window.open("about:blank", "_blank");
    if (saveState !== "saved") await saveNow();
    try {
      const { path } = await api.get<{ path: string }>(`/website/pages/${page.id}/preview-link`);
      if (tab) tab.location.href = path;
    } catch (e) {
      tab?.close();
      toast.error(errorMessage(e));
    }
  };

  // ─── Keyboard shortcuts ────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest("input, textarea, select, [contenteditable]");
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
      } else if (mod && e.key.toLowerCase() === "y" && !typing) {
        e.preventDefault();
        history.redo();
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveNow();
      } else if (!typing && selectedId && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        removeBlock(selectedId);
      } else if (!typing && selectedId && mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateBlock(selectedId);
      } else if (e.key === "Escape") {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history, selectedId, removeBlock, duplicateBlock, saveNow]);

  const hasUnpublished = page.status === "DRAFT" || blocks !== liveBlocks;

  return (
    <LinkTargetsContext.Provider value={{ pages: website.pages, anchors }}>
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => (setDragging(null), setDropIndex(null))}>
        <div className="flex h-screen flex-col bg-slate-100">
          {/* Top bar */}
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3">
            <Link to="/website" className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
              <ArrowLeft className="size-4" /> Website
            </Link>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{page.title}</p>
              <p className="truncate text-xs text-slate-500">/{page.slug}</p>
            </div>
            {page.status === "DRAFT" ? <Badge tone="amber">Not published</Badge> : hasUnpublished ? <Badge tone="blue">Unpublished changes</Badge> : <Badge tone="green">Live</Badge>}

            <div className="mx-auto flex items-center gap-1">
              <IconButton label="Undo (Ctrl+Z)" disabled={!history.canUndo} onClick={history.undo}><Undo2 className="size-4" /></IconButton>
              <IconButton label="Redo (Ctrl+Shift+Z)" disabled={!history.canRedo} onClick={history.redo}><Redo2 className="size-4" /></IconButton>
              <span className="mx-2 h-6 w-px bg-slate-200" />
              {(["desktop", "tablet", "mobile"] as const).map((d) => (
                <IconButton key={d} label={`${d[0].toUpperCase()}${d.slice(1)} view`} active={device === d} onClick={() => setDevice(d)}>
                  {d === "desktop" ? <Monitor className="size-4" /> : d === "tablet" ? <Tablet className="size-4" /> : <Smartphone className="size-4" />}
                </IconButton>
              ))}
            </div>

            <SaveIndicator state={saveState} />
            <Button size="sm" variant="secondary" icon={<ExternalLink className="size-3.5" />} onClick={() => void openPreview()}>
              Preview
            </Button>
            {can("website.publish") && (
              <Button size="sm" disabled={!hasUnpublished} loading={publish.isPending} onClick={() => publish.mutate()}>
                {page.status === "DRAFT" ? "Publish page" : "Publish changes"}
              </Button>
            )}
          </header>

          <div className="flex min-h-0 flex-1">
            {/* Left: blocks and layers */}
            <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
              <div className="grid grid-cols-2 gap-1 border-b border-slate-200 p-2">
                <TabButton active={leftTab === "add"} onClick={() => setLeftTab("add")}><Plus className="size-4" /> Add</TabButton>
                <TabButton active={leftTab === "layers"} onClick={() => setLeftTab("layers")}><Layers className="size-4" /> Sections</TabButton>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {leftTab === "add" ? (
                  <BlockLibrary blocks={meta.blocks} onAdd={addBelowSelection} />
                ) : (
                  <LayersPanel blocks={blocks} blockMeta={blockMeta} selectedId={selectedId} onSelect={setSelectedId} onReorder={(next) => history.set(next)} />
                )}
              </div>
            </aside>

            {/* Middle: the page */}
            <main className="min-w-0 flex-1 overflow-y-auto p-4" onClick={() => setSelectedId(null)}>
              <div
                className="mx-auto overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-slate-200 transition-[max-width] duration-300"
                style={{ maxWidth: DEVICE_WIDTH[device] }}
                onClickCapture={preventNavigation}
              >
                <SiteStyles theme={website.theme} />
                <div className="sms-site">
                  <Canvas
                    blocks={blocks}
                    blockMeta={blockMeta}
                    ctx={ctx}
                    selectedId={selectedId}
                    dropBeforeId={dropIndex === null ? null : (blocks[dropIndex]?.id ?? CANVAS_END)}
                    header={<PreviewHeader header={website.header} footer={website.footer} pages={website.pages} ctx={ctx} />}
                    footer={<PreviewFooter footer={website.footer} ctx={ctx} />}
                    onSelect={setSelectedId}
                    onMove={moveBlock}
                    onDuplicate={duplicateBlock}
                    onRemove={removeBlock}
                  />
                </div>
              </div>
            </main>

            {/* Right: settings */}
            <aside className="w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white">
              {selected && blockMeta.get(selected.type) ? (
                <BlockInspector key={selected.id} block={selected} meta={blockMeta.get(selected.type)!} onChange={updateBlock} onClose={() => setSelectedId(null)} />
              ) : (
                <PageSettingsPanel
                  key={page.updatedAt}
                  page={page}
                  onSaved={(updated) => setPage({ ...updated, draftBlocks: blocks })}
                  onRestored={(restored) => {
                    setPage(restored);
                    history.set(restored.draftBlocks);
                  }}
                />
              )}
            </aside>
          </div>
        </div>
        <DragOverlay dropAnimation={null}>{dragging && <DragPreview label={dragging.label} icon={dragging.icon} />}</DragOverlay>
      </DndContext>
    </LinkTargetsContext.Provider>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const content = {
    saved: { icon: <Check className="size-3.5" />, text: "Saved", className: "text-slate-500" },
    unsaved: { icon: <Cloud className="size-3.5" />, text: "Unsaved", className: "text-slate-500" },
    saving: { icon: <Loader2 className="size-3.5 animate-spin" />, text: "Saving…", className: "text-slate-500" },
    error: { icon: <CloudOff className="size-3.5" />, text: "Not saved", className: "text-red-600" },
  }[state];
  return <span className={cn("flex items-center gap-1 text-xs", content.className)}>{content.icon}{content.text}</span>;
}

function IconButton({ label, onClick, disabled, active, children }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn("rounded-md p-2 disabled:opacity-30", active ? "bg-brand-soft text-brand" : "text-slate-600 hover:bg-slate-100")}
    >
      {children}
    </button>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium", active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}>
      {children}
    </button>
  );
}
