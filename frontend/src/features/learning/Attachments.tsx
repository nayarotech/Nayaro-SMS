import { FileText, Image as ImageIcon, Paperclip, X } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { uploadFile } from "@/lib/api";
import { errorMessage } from "@/lib/forms";
import { fileSize, type Attachment } from "./learning.api";

const ACCEPT = "image/*,application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx";

/** Files on a homework or material: upload more, remove, or open. */
export function AttachmentPicker({ value, onChange, purpose }: { value: Omit<Attachment, "url">[]; onChange: (files: Omit<Attachment, "url">[]) => void; purpose: "homework-file" | "material-file" }) {
  const toast = useToast();
  const [uploading, setUploading] = useState(0);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files];
    setUploading((n) => n + list.length);
    const added: Omit<Attachment, "url">[] = [];
    for (const file of list) {
      try {
        const uploaded = await uploadFile(file, purpose);
        added.push({ key: uploaded.key, name: file.name, mimeType: file.type, size: file.size });
      } catch (e) {
        toast.error(`${file.name}: ${errorMessage(e)}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    onChange([...value, ...added]);
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {value.map((file) => (
            <li key={file.key} className="flex items-center gap-2 px-3 py-2 text-sm">
              {file.mimeType.startsWith("image/") ? <ImageIcon className="size-4 text-slate-400" /> : <FileText className="size-4 text-slate-400" />}
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="text-xs text-slate-500">{fileSize(file.size)}</span>
              <button type="button" onClick={() => onChange(value.filter((f) => f.key !== file.key))} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label={`Remove ${file.name}`}>
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-brand hover:text-brand">
        <Paperclip className="size-4" /> {uploading ? `Uploading ${uploading}…` : "Attach files (photos, PDF, Word, PowerPoint)"}
        <input type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
      </label>
    </div>
  );
}

/** Read-only list of attachments with download links. */
export function AttachmentLinks({ files }: { files: Attachment[] }) {
  if (!files.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {files.map((file) => (
        <a key={file.key} href={file.url} target="_blank" rel="noreferrer" className="inline-flex max-w-56 items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-brand-soft hover:text-brand">
          {file.mimeType.startsWith("image/") ? <ImageIcon className="size-3.5 shrink-0" /> : <FileText className="size-3.5 shrink-0" />}
          <span className="truncate">{file.name}</span>
        </a>
      ))}
    </div>
  );
}
