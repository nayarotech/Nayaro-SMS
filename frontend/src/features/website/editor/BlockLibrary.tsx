import { useDraggable } from "@dnd-kit/core";
import { iconSvg } from "@site-renderer";
import { useState } from "react";
import { Input } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import type { BlockMeta } from "../website.api";
import { LIBRARY_PREFIX } from "./dnd-ids";

/** All blocks, grouped by category. Drag one onto the page, or click to add it. */
export function BlockLibrary({ blocks, onAdd }: { blocks: BlockMeta[]; onAdd: (type: string) => void }) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const visible = blocks.filter((b) => !query || `${b.label} ${b.description}`.toLowerCase().includes(query));
  const categories = [...new Set(visible.map((b) => b.category))];

  return (
    <div className="space-y-4 p-3">
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search blocks…" className="h-9" />
      <p className="text-xs text-slate-500">Drag a block onto the page, or click to add it below the selected block.</p>
      {categories.map((category) => (
        <div key={category}>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{category}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {visible
              .filter((b) => b.category === category)
              .map((block) => (
                <LibraryItem key={block.type} block={block} onAdd={onAdd} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function LibraryItem({ block, onAdd }: { block: BlockMeta; onAdd: (type: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `${LIBRARY_PREFIX}${block.type}`, data: { block } });
  return (
    <button
      ref={setNodeRef}
      type="button"
      title={block.description}
      onClick={() => onAdd(block.type)}
      {...attributes}
      {...listeners}
      className={cn(
        "flex cursor-grab flex-col items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-3 text-center text-xs font-medium text-slate-700 hover:border-brand hover:text-brand active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <span className="text-brand" dangerouslySetInnerHTML={{ __html: iconSvg(block.icon, 20) }} />
      {block.label}
    </button>
  );
}

/** What follows the pointer while dragging. */
export function DragPreview({ label, icon }: { label: string; icon: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-brand bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-xl">
      <span className="text-brand" dangerouslySetInnerHTML={{ __html: iconSvg(icon, 18) }} />
      {label}
    </div>
  );
}
