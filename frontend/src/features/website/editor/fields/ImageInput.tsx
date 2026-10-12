import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { uploadFile } from "@/lib/api";
import { errorMessage } from "@/lib/forms";
import { publicFileUrl } from "../../website.api";

/** Pick and upload a website image; the value is its storage key. */
export function ImageInput({ value, onChange }: { value: string | null; onChange: (key: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange((await uploadFile(file, "website-image")).key);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="relative flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:border-brand hover:text-brand"
        >
          {value ? <img src={publicFileUrl(value)} alt="" className="size-full object-cover" /> : <ImagePlus className="size-6" />}
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-white/70">
              <Loader2 className="size-5 animate-spin text-brand" />
            </span>
          )}
        </button>
        <div className="space-y-1 text-sm">
          <button type="button" className="block font-medium text-brand hover:underline" onClick={() => input.current?.click()}>
            {value ? "Replace" : "Upload photo"}
          </button>
          {value && (
            <button type="button" className="flex items-center gap-1 text-slate-500 hover:text-red-600" onClick={() => onChange(null)}>
              <Trash2 className="size-3.5" /> Remove
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
    </div>
  );
}
