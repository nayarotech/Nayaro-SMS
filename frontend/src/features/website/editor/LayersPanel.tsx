import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { iconSvg, type Block } from "@site-renderer";
import { EyeOff, GripVertical } from "lucide-react";
import { cn } from "@/lib/cn";
import type { BlockMeta } from "../website.api";

/** Outline of the page's sections — drag to reorder, click to select. */
export function LayersPanel({
  blocks,
  blockMeta,
  selectedId,
  onSelect,
  onReorder,
}: {
  blocks: Block[];
  blockMeta: Map<string, BlockMeta>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (blocks: Block[]) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = blocks.findIndex((b) => b.id === active.id);
    const to = blocks.findIndex((b) => b.id === over.id);
    onReorder(arrayMove(blocks, from, to));
  };

  if (blocks.length === 0) return <p className="p-4 text-sm text-slate-500">This page has no sections yet.</p>;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-1 p-3">
          {blocks.map((block, index) => (
            <Layer key={block.id} block={block} index={index} meta={blockMeta.get(block.type)} selected={block.id === selectedId} onSelect={onSelect} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function Layer({ block, index, meta, selected, onSelect }: { block: Block; index: number; meta?: BlockMeta; selected: boolean; onSelect: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const heading = String(block.props.heading ?? block.props.label ?? "").slice(0, 32);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2 py-2 text-sm",
        selected ? "border-brand bg-brand-soft" : "border-slate-200 bg-white hover:border-slate-300",
        isDragging && "relative z-10 shadow-lg",
      )}
    >
      <button {...attributes} {...listeners} className="cursor-grab text-slate-400 active:cursor-grabbing" aria-label="Drag to reorder">
        <GripVertical className="size-4" />
      </button>
      <button type="button" onClick={() => onSelect(block.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className="text-xs tabular-nums text-slate-400">{index + 1}</span>
        <span className="shrink-0 text-brand" dangerouslySetInnerHTML={{ __html: iconSvg(meta?.icon ?? "star", 16) }} />
        <span className="min-w-0">
          <span className="block truncate font-medium text-slate-800">{meta?.label ?? block.type}</span>
          {heading && <span className="block truncate text-xs text-slate-500">{heading}</span>}
        </span>
      </button>
      {block.style?.hideOnMobile && <EyeOff className="size-3.5 shrink-0 text-amber-500" aria-label="Hidden on phones" />}
    </li>
  );
}
