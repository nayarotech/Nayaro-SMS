import { Bold, Heading2, Heading3, Italic, Link, List, ListOrdered, Quote, RemoveFormatting, Unlink } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * A small rich-text editor (bold, italic, headings, lists, quotes, links).
 * The HTML it produces is cleaned again by the server before saving.
 */
export function RichTextInput({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  // Only overwrite the content when it changed from outside (undo, another block),
  // never while typing — that would move the cursor.
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value && document.activeElement !== el) el.innerHTML = value;
  }, [value]);

  const run = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    onChange(ref.current?.innerHTML ?? "");
  };

  const addLink = () => {
    const url = prompt("Link address (https://…, or /notices)");
    if (url) run("createLink", url);
  };

  return (
    <div className="rounded-lg border border-slate-300 bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
      <div className="flex flex-wrap gap-0.5 border-b border-slate-200 p-1">
        <ToolButton label="Bold" onClick={() => run("bold")}><Bold className="size-4" /></ToolButton>
        <ToolButton label="Italic" onClick={() => run("italic")}><Italic className="size-4" /></ToolButton>
        <ToolButton label="Heading" onClick={() => run("formatBlock", "h2")}><Heading2 className="size-4" /></ToolButton>
        <ToolButton label="Small heading" onClick={() => run("formatBlock", "h3")}><Heading3 className="size-4" /></ToolButton>
        <ToolButton label="Bulleted list" onClick={() => run("insertUnorderedList")}><List className="size-4" /></ToolButton>
        <ToolButton label="Numbered list" onClick={() => run("insertOrderedList")}><ListOrdered className="size-4" /></ToolButton>
        <ToolButton label="Quote" onClick={() => run("formatBlock", "blockquote")}><Quote className="size-4" /></ToolButton>
        <ToolButton label="Add link" onClick={addLink}><Link className="size-4" /></ToolButton>
        <ToolButton label="Remove link" onClick={() => run("unlink")}><Unlink className="size-4" /></ToolButton>
        <ToolButton label="Clear formatting" onClick={() => { run("removeFormat"); run("formatBlock", "p"); }}><RemoveFormatting className="size-4" /></ToolButton>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        onPaste={(e) => {
          // Paste as plain text so formatting from Word/websites doesn't come along
          e.preventDefault();
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }}
        className="rich-text-input max-h-80 min-h-28 overflow-y-auto px-3 py-2 text-sm text-slate-800 focus:outline-none [&_blockquote]:border-l-4 [&_blockquote]:pl-3 [&_blockquote]:italic [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_a]:text-brand [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_p+p]:mt-2"
      />
    </div>
  );
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      // Keep the text selection when clicking a toolbar button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="rounded p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    >
      {children}
    </button>
  );
}
