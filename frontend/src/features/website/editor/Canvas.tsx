import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, type SortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, Copy, EyeOff, GripVertical, Plus, Trash2 } from "lucide-react";
import { memo, useMemo, type ReactNode } from "react";
import { renderBlock, type Block, type RenderContext } from "@site-renderer";
import { cn } from "@/lib/cn";
import type { BlockMeta } from "../website.api";
import { CANVAS_END } from "./dnd-ids";


interface CanvasProps {
  blocks: Block[];
  blockMeta: Map<string, BlockMeta>;
  ctx: RenderContext;
  selectedId: string | null;
  /** Where a dragged block would land (shows a blue line) */
  dropBeforeId: string | null;
  header: ReactNode;
  footer: ReactNode;
  onSelect: (id: string | null) => void;
  onMove: (id: string, by: number) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}

/**
 * Sections slide out of the way only when reordering existing sections. When a new
 * block is dragged in from the library (not in the list), they stay put and a
 * blue line shows where it will land.
 */
const sortingStrategy: SortingStrategy = (args) => (args.activeIndex === -1 ? null : verticalListSortingStrategy(args));

/** The page as visitors will see it, with editing controls on each section. */
export function Canvas(props: CanvasProps) {
  const { setNodeRef: setEndRef, isOver } = useDroppable({ id: CANVAS_END });

  return (
    <SortableContext items={props.blocks.map((b) => b.id)} strategy={sortingStrategy}>
      <div className="pointer-events-none opacity-90" title="Edit under Website → Header & footer">{props.header}</div>
      {props.blocks.length === 0 && (
        <div className="m-6 rounded-xl border-2 border-dashed border-slate-300 p-12 text-center text-slate-500" data-editor-ui>
          <Plus className="mx-auto mb-2 size-8" />
          Drag blocks here from the left, or click one to add it.
        </div>
      )}
      {props.blocks.map((block, index) => (
        <CanvasBlock
          key={block.id}
          block={block}
          label={props.blockMeta.get(block.type)?.label ?? block.type}
          ctx={props.ctx}
          selected={props.selectedId === block.id}
          showDropLine={props.dropBeforeId === block.id}
          isFirst={index === 0}
          isLast={index === props.blocks.length - 1}
          onSelect={props.onSelect}
          onMove={props.onMove}
          onDuplicate={props.onDuplicate}
          onRemove={props.onRemove}
        />
      ))}
      <div ref={setEndRef} className={cn("h-16 transition-colors", (isOver || props.dropBeforeId === CANVAS_END) && "border-t-4 border-brand bg-brand-soft/40")} />
      <div className="pointer-events-none opacity-90">{props.footer}</div>
    </SortableContext>
  );
}

interface CanvasBlockProps {
  block: Block;
  label: string;
  ctx: RenderContext;
  selected: boolean;
  showDropLine: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, by: number) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}

const CanvasBlock = memo(function CanvasBlock({ block, label, ctx, selected, showDropLine, isFirst, isLast, onSelect, onMove, onDuplicate, onRemove }: CanvasBlockProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  // Re-render the HTML only when this block (or the shared data) changes
  const markup = useMemo(() => renderBlock(block, ctx).value, [block, ctx]);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("group relative", isDragging && "z-10 opacity-60")}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(block.id);
      }}
    >
      {showDropLine && <div className="absolute inset-x-0 -top-0.5 z-20 h-1 bg-brand" />}
      <div dangerouslySetInnerHTML={{ __html: markup }} />

      {/* Outline and toolbar (not part of the website) */}
      <div
        data-editor-ui
        className={cn(
          "pointer-events-none absolute inset-0 z-10 ring-inset transition-shadow",
          selected ? "ring-2 ring-brand" : "group-hover:ring-2 group-hover:ring-brand/40",
        )}
      />
      <div
        data-editor-ui
        className={cn(
          "absolute right-2 top-2 z-20 flex items-center gap-0.5 rounded-lg bg-slate-900 p-0.5 text-white shadow-lg",
          selected ? "flex" : "hidden group-hover:flex",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={setActivatorNodeRef} {...attributes} {...listeners} className="cursor-grab rounded-md p-1.5 hover:bg-white/15 active:cursor-grabbing" title="Drag to move" aria-label="Drag to move">
          <GripVertical className="size-4" />
        </button>
        <span className="px-1.5 text-xs font-medium">{label}</span>
        {block.style?.hideOnMobile && <EyeOff className="mx-1 size-3.5 text-amber-300" aria-label="Hidden on phones" />}
        <ToolbarButton label="Move up" disabled={isFirst} onClick={() => onMove(block.id, -1)}><ArrowUp className="size-4" /></ToolbarButton>
        <ToolbarButton label="Move down" disabled={isLast} onClick={() => onMove(block.id, 1)}><ArrowDown className="size-4" /></ToolbarButton>
        <ToolbarButton label="Duplicate" onClick={() => onDuplicate(block.id)}><Copy className="size-4" /></ToolbarButton>
        <ToolbarButton label="Delete" onClick={() => onRemove(block.id)}><Trash2 className="size-4" /></ToolbarButton>
      </div>
    </div>
  );
});

function ToolbarButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick} className="rounded-md p-1.5 hover:bg-white/15 disabled:opacity-30">
      {children}
    </button>
  );
}
