/** The Profile assets files table (spec §3): one row per file, the missing ones after, and the images outside the profile. */
import { useEffect, useRef } from "react";
import { BookmarkPlus, ImageOff, Replace, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/assets";
import { assetKey, MIME, scanRefs, type AssetFile, type AssetRef, type Doc } from "@/lib/infopanel/assets/assets";
import { drawnSize, typeNote, type Finding, type Findings } from "@/lib/infopanel/assets/stored-doc";
import { FilePick } from "./file-pick";

export const FINDING_LABEL: Record<Finding, string> = {
  unused: "Unused",
  identical: "Identical",
  larger: "Larger than drawn",
  large: "Over 1 MB",
  missing: "Missing",
};

const TYPE_LABEL: Record<string, string> = { jpeg: "JPEG", png: "PNG", gif: "GIF", webp: "WebP", bmp: "BMP", ico: "ICO", svg: "SVG", video: "Video", other: "File" };
const COLUMNS = "grid-cols-[64px_minmax(0,1.5fr)_minmax(0,1fr)_96px_96px_72px_48px_minmax(0,1.3fr)_104px]";
const checker = "bg-[repeating-conic-gradient(#2c2c32_0_25%,#1c1c21_0_50%)] bg-[length:10px_10px]";
const ICON = "flex h-[28px] w-[28px] items-center justify-center rounded-[6px] text-ui-4 hover:bg-ui-hover hover:text-ui-1";

/** One object URL per file content for files the asset store does not serve yet (added ones), revoked on unmount. */
function useObjectUrls(): (f: AssetFile) => string | undefined {
  const cache = useRef(new Map<string, string>());
  useEffect(() => {
    const urls = cache.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);
  return (f) => {
    if (f.url) return f.url;
    if (f.bytes.length === 0) return undefined;
    let url = cache.current.get(f.hash);
    if (!url) {
      url = URL.createObjectURL(new Blob([f.bytes.slice()], { type: MIME[f.type] }));
      cache.current.set(f.hash, url);
    }
    return url;
  };
}

function Preview({ file, url }: { file: AssetFile | null; url: string | undefined }) {
  const box = cn("flex h-[36px] w-[56px] items-center justify-center overflow-hidden rounded-[6px] border border-ui-subtle", checker);
  if (!file) {
    return (
      <div className={box}>
        <ImageOff className="h-4 w-4 text-ui-danger/70" strokeWidth={1.5} />
      </div>
    );
  }
  if (!url || file.type === "other") return <div className={cn(box, "text-[11px] text-ui-4")}>?</div>;
  return (
    <div className={box}>
      {file.type === "video" ? <video src={url} muted preload="metadata" className="h-full w-full object-contain" /> : <img src={url} alt="" loading="lazy" className="h-full w-full object-contain" />}
    </div>
  );
}

function Chip({ finding }: { finding: Finding }) {
  return (
    <span className={cn("rounded-[5px] border px-1.5 py-px text-[11px]", finding === "missing" ? "border-ui-danger/50 text-ui-danger" : "border-ui-warning/50 text-ui-warning")}>{FINDING_LABEL[finding]}</span>
  );
}

const pathsOf = (refs: readonly { path: string }[]) => [...new Set(refs.map((r) => r.path))];

interface FilesTableProps {
  doc: Doc;
  found: Findings;
  uses: ReadonlyMap<string, AssetRef[]>;
  filter: Finding | null;
  disabled: boolean;
  onSelectUses: (paths: string[]) => void;
  onSave: (file: AssetFile) => void;
  onReplace: (name: string, files: File[]) => void;
  onRemove: (name: string) => void;
}

export function FilesTable(p: FilesTableProps) {
  const urlOf = useObjectUrls();
  const shown = (key: string) => !p.filter || p.found.byName.get(key)?.includes(p.filter);
  const files = [...p.doc.assets.values()].filter((f) => shown(assetKey(f.name)));
  const missing = p.found.missing.filter((m) => shown(m.name));
  const others = scanRefs(p.doc.items).others;
  const outside = [...new Map(others.map((o) => [`${o.kind}:${o.value}`, o])).values()];

  const uses = (refs: readonly AssetRef[], danger?: boolean) =>
    refs.length === 0 ? (
      <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[5px] bg-ui-raised px-1.5 font-ui-mono text-[11.5px] text-ui-warning">0</span>
    ) : (
      <button
        type="button"
        title={`Select ${refs.length === 1 ? "this use" : "these uses"} on the canvas`}
        onClick={() => p.onSelectUses(pathsOf(refs))}
        className={cn("inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[5px] bg-ui-raised px-1.5 font-ui-mono text-[11.5px] hover:bg-ui-hover", danger ? "text-ui-danger" : "text-ui-1")}
      >
        {refs.length}
      </button>
    );

  return (
    <div className="px-6 pb-8 font-ui">
      <div role="table" aria-label="Profile files">
        <div role="row" className={cn("grid items-center gap-3 px-2 py-2 text-[11.5px] text-ui-4", COLUMNS)}>
          <span role="columnheader" />
          {["Name", "Type", "Pixels", "Drawn at", "Size", "Uses", "Findings"].map((h) => (
            <span key={h} role="columnheader">
              {h}
            </span>
          ))}
          <span role="columnheader" />
        </div>
        {files.map((f) => {
          const refs = p.uses.get(assetKey(f.name)) ?? [];
          const drawn = drawnSize(refs);
          const note = typeNote(f);
          return (
            <div key={f.name} role="row" className={cn("grid items-center gap-3 border-t border-ui-subtle px-2 py-2 text-[12px] text-ui-2 hover:bg-ui-hover/40", COLUMNS)}>
              <div role="cell">
                <Preview file={f} url={urlOf(f)} />
              </div>
              <span role="cell" className="truncate font-ui-mono text-ui-1" title={f.name}>
                {f.name}
              </span>
              <span role="cell" className="text-ui-3">
                {TYPE_LABEL[f.type]}
                {note && ` · ${note}`}
              </span>
              <span role="cell" className="font-ui-mono">
                {f.width ? `${f.width} × ${f.height}` : "–"}
              </span>
              <span role="cell" className="font-ui-mono">
                {drawn ? `${drawn.width} × ${drawn.height}` : refs.length ? "Own size" : "–"}
              </span>
              <span role="cell" className="font-ui-mono">
                {f.bytes.length ? formatBytes(f.bytes.length) : "–"}
              </span>
              <div role="cell">{uses(refs)}</div>
              <div role="cell" className="flex flex-wrap gap-1">
                {(p.found.byName.get(assetKey(f.name)) ?? []).map((x) => (
                  <Chip key={x} finding={x} />
                ))}
              </div>
              <div role="cell" className="flex justify-end">
                <button type="button" aria-label={`Save a copy of ${f.name} to My library`} title="Save a copy to My library" disabled={f.bytes.length === 0} onClick={() => p.onSave(f)} className={ICON}>
                  <BookmarkPlus className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <FilePick label={`Replace ${f.name}`} title="Replace: every use follows" className={ICON} disabled={p.disabled} onFiles={(list) => p.onReplace(f.name, list)}>
                  <Replace className="h-4 w-4" strokeWidth={1.75} />
                </FilePick>
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  title={refs.length ? "Remove: its uses lose their image" : "Remove"}
                  disabled={p.disabled}
                  onClick={() => p.onRemove(f.name)}
                  className={cn(ICON, "hover:text-ui-danger")}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          );
        })}
        {missing.map((m) => (
          <div key={m.name} role="row" className={cn("grid items-center gap-3 border-t border-ui-subtle px-2 py-2 text-[12px] text-ui-2", COLUMNS)}>
            <div role="cell">
              <Preview file={null} url={undefined} />
            </div>
            <span role="cell" className="truncate font-ui-mono text-ui-danger" title={m.name}>
              {m.name}
            </span>
            <span role="cell">–</span>
            <span role="cell">–</span>
            <span role="cell" className="font-ui-mono">
              {drawnSize(m.refs) ? `${drawnSize(m.refs)!.width} × ${drawnSize(m.refs)!.height}` : "–"}
            </span>
            <span role="cell">–</span>
            <div role="cell">{uses(m.refs, true)}</div>
            <div role="cell">
              <Chip finding="missing" />
            </div>
            <span role="cell" />
          </div>
        ))}
        {files.length + missing.length === 0 && <div className="border-t border-ui-subtle px-2 py-8 text-center text-[12.5px] text-ui-4">{p.filter ? "No file has this finding." : "This canvas has no files."}</div>}
      </div>

      {outside.length > 0 && (
        <section className="mt-6" aria-label="Outside the profile">
          <h3 className="mb-2 text-[12px] font-semibold text-ui-1">Outside the profile</h3>
          {outside.map((o) => (
            <div key={`${o.kind}:${o.value}`} className="flex items-center gap-3 border-t border-ui-subtle py-2 text-[12px]">
              <span className="w-[96px] shrink-0 rounded-[5px] bg-ui-raised px-2 py-0.5 text-center text-[11px] text-ui-3">{o.kind === "url" ? "URL" : "Absolute path"}</span>
              <button
                type="button"
                title="Select the items that draw it"
                onClick={() => p.onSelectUses(pathsOf(others.filter((x) => x.kind === o.kind && x.value === o.value)))}
                className="min-w-0 flex-1 truncate text-left font-ui-mono text-ui-2 hover:text-ui-1"
              >
                {o.value}
              </button>
              <span className="shrink-0 text-ui-4">{o.kind === "url" ? "Size unknown until it loads; stays InfoPanel" : "Not inside the profile. Add it to include it"}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
