import { useEffect, useRef, useState, type DragEvent } from "react";
import { Loader2, Upload } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { mediaUrl } from "@/lib/appearance";
import { AssetError, acceptOf, formatBytes, uploadAsset, type AssetKind } from "@/lib/assets";
import { cn } from "@/lib/utils";
import { BackgroundLibrary } from "./background-library";
import { addUpload } from "./add-upload";
import { MediaLibrary } from "./media-library";
import { FIELD } from "./setting-rows";

interface MediaFieldProps {
  label: string;
  kind: AssetKind;
  value: string | undefined;
  /** The new URL, or undefined when the field is cleared. */
  onChange: (src: string | undefined) => void;
  /** "large": a preview under the field (backgrounds); "thumb": a small one beside the input. */
  preview?: "large" | "thumb";
  /** The color behind a large preview (the background's letterbox fill). */
  fill?: string;
  /** The picker offers only the Library's Backgrounds of this kind (a page background's image or video). */
  backgrounds?: boolean;
  /** Open the Library, from the picker's empty state. */
  onOpenLibrary?: () => void;
}

type UploadStatus = { state: "idle" } | { state: "uploading"; name: string; size: number } | { state: "error"; message: string };

/**
 * A media URL: typed (applied on Enter or leaving the field), uploaded to
 * the dashboard server (Upload… or a file dropped on the field) or picked
 * from the uploaded files (the library).
 */
export function MediaField({ label, kind, value, onChange, preview = "large", fill, backgrounds, onOpenLibrary }: MediaFieldProps) {
  const [draft, setDraft] = useState(value ?? "");
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<UploadStatus>({ state: "idle" });
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(value ?? ""), [value]);
  const valid = draft.trim() === "" || mediaUrl(draft) !== undefined;

  const commit = () => {
    if (draft.trim() === "") {
      if (value !== undefined) onChange(undefined);
      return;
    }
    const src = mediaUrl(draft);
    if (src !== undefined && src !== value) onChange(src);
  };

  const upload = async (file: File) => {
    setStatus({ state: "uploading", name: file.name, size: file.size });
    try {
      const asset = await uploadAsset(file, kind);
      // A background's upload joins My library, so the picker (Backgrounds only) offers it next time.
      if (backgrounds) await addUpload(file, asset.id);
      setStatus({ state: "idle" });
      onChange(asset.url);
    } catch (err) {
      setStatus({ state: "error", message: err instanceof AssetError ? err.message : "The upload failed." });
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void upload(file);
  };

  const busy = status.state === "uploading";
  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
      className={cn("space-y-2 rounded-md", dragging && "outline-2 outline-offset-2 outline-ui-accent outline-dashed")}
    >
      <div>
        <div className="mb-2 flex min-h-[26px] items-center">
          <span className="text-[12.5px] text-ui-2">{label}</span>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={acceptOf(kind)}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
        <div className="flex items-center gap-2">
          <input
            type="text"
            aria-label="Image or video URL"
            value={draft}
            placeholder={dragging ? "Drop to upload" : "https://… or drop a file"}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
            }}
            className={cn(
              FIELD,
              "h-[30px] w-full min-w-0",
              !valid && "border-ui-danger"
            )}
          />
          {preview === "thumb" && value && <Thumb kind={kind} src={value} />}
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            title={`Upload ${kind === "image" ? "an image" : "a video"} to the dashboard server (or drop a file here)`}
            className="flex h-[30px] shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-ui-strong bg-ui-hover px-[9px] text-[11.5px] text-ui-1 hover:bg-[#222228] disabled:opacity-50"
          >
            <Upload className="h-[15px] w-[15px]" /> Upload
          </button>
          <span className="flex shrink-0">
            {backgrounds ? (
              <BackgroundLibrary kind={kind} value={value} onPick={onChange} onOpenLibrary={onOpenLibrary} />
            ) : (
              <MediaLibrary kind={kind} value={value} onPick={onChange} />
            )}
          </span>
        </div>
        {!valid && <div className="mt-1 text-[11px] text-ui-danger">Use an http(s) URL or a path such as /assets/…</div>}
        {status.state === "uploading" && (
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ui-4">
            <Loader2 className="h-3 w-3 animate-spin" />
            Uploading {status.name} ({formatBytes(status.size)})…
          </div>
        )}
        {status.state === "error" && (
          <div role="alert" className="mt-1 text-[11px] text-ui-danger">
            {status.message}
          </div>
        )}
      </div>
      {preview === "large" && value && <LargePreview kind={kind} src={value} fill={fill} />}
    </div>
  );
}

function Thumb({ kind, src }: { kind: AssetKind; src: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  if (broken) return null;
  const className = "h-7 w-7 shrink-0 rounded border border-ui-default object-cover";
  return kind === "image" ? (
    <img src={src} alt="" className={className} onError={() => setBroken(true)} />
  ) : (
    <video src={src} muted preload="metadata" className={className} onError={() => setBroken(true)} />
  );
}

function LargePreview({ kind, src, fill }: { kind: AssetKind; src: string; fill: string | undefined }) {
  const [broken, setBroken] = useState(false);
  const reducedMotion = useReducedMotion();
  useEffect(() => setBroken(false), [src]);
  return (
    <div
      className="flex h-24 items-center justify-center overflow-hidden rounded-md border border-ui-default bg-ui-app"
      style={{ backgroundColor: fill }}
    >
      {broken ? (
        <span className="text-[11px] text-ui-4">The {kind} could not be loaded</span>
      ) : kind === "image" ? (
        <img src={src} alt="" className="max-h-full max-w-full object-contain" onError={() => setBroken(true)} />
      ) : (
        <video
          src={src}
          muted
          loop
          autoPlay={!reducedMotion}
          playsInline
          className="max-h-full max-w-full object-contain"
          onError={() => setBroken(true)}
        />
      )}
    </div>
  );
}
