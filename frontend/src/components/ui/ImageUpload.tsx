import { ImagePlus, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { uploadFile } from "@/lib/api";
import { errorMessage } from "@/lib/forms";

interface ImageUploadProps {
  /** Upload purpose, see backend/src/modules/files/file.service.ts */
  purpose: string;
  url: string | null;
  onUploaded: (file: { key: string; url: string }) => void;
  shape?: "square" | "round";
  label?: string;
  disabled?: boolean;
}

/** Click-to-upload image with preview. Uploads immediately and returns the stored key. */
export function ImageUpload({ purpose, url, onUploaded, shape = "square", label = "Upload", disabled }: ImageUploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded = await uploadFile(file, purpose);
      onUploaded({ key: uploaded.key, url: uploaded.url });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
        className={`relative flex size-20 shrink-0 items-center justify-center overflow-hidden border-2 border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:border-brand hover:text-brand disabled:cursor-not-allowed ${shape === "round" ? "rounded-full" : "rounded-xl"}`}
      >
        {url ? <img src={url} alt="" className="size-full object-cover" /> : <ImagePlus className="size-6" />}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Loader2 className="size-5 animate-spin text-brand" />
          </span>
        )}
      </button>
      <div className="text-sm">
        <button type="button" disabled={disabled || busy} onClick={() => input.current?.click()} className="font-medium text-brand hover:underline disabled:opacity-50">
          {url ? "Change" : label}
        </button>
        <p className="text-xs text-slate-500">PNG, JPG or WebP</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
    </div>
  );
}
