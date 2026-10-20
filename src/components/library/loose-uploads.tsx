import { useEffect, useState } from "react";
import { FolderInput } from "lucide-react";
import { listAssets, type Asset } from "@/lib/assets";
import type { DashboardConfig } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import { hashOf } from "@/lib/my-library/model";

const hashOfId = (id: string) => id.slice(0, 64);

/**
 * The asset hashes the config's imported canvases carry (their asset tables, supplied fonts and
 * screenshots); null while a canvas is not loaded yet, when the split is unknown.
 */
export function canvasHashes(config: Pick<DashboardConfig, "profiles">): Set<string> | null {
  const out = new Set<string>();
  for (const profile of config.profiles)
    for (const page of profile.pages)
      for (const z of page.placements) {
        // A Custom gauge zone keeps its library frames as JSON `{id, name}[]` (addGaugeZone).
        const frames = z.settings?.frames;
        if (typeof frames === "string" && frames) {
          try {
            for (const f of JSON.parse(frames) as { id?: unknown }[]) if (typeof f?.id === "string") out.add(hashOfId(f.id));
          } catch {
            // Not frames we can read: nothing to exclude.
          }
        }
        if (!z.canvas) {
          if (z.canvasRef) return null;
          continue;
        }
        for (const a of z.canvas.assets) out.add(a.hash);
        for (const f of z.canvas.fonts) if (f.supplied) out.add(f.supplied.hash);
        if (z.canvas.screenshot) out.add(hashOfId(z.canvas.screenshot));
      }
  return out;
}

/** Every asset id an item holds: its files and a gauge's frames. */
const heldIds = (item: LibraryItem): string[] => {
  const frames = (item.data as { frames?: { id?: unknown }[] } | undefined)?.frames;
  return [...item.files, ...(Array.isArray(frames) ? frames.flatMap((f) => (typeof f?.id === "string" ? [f.id] : [])) : [])];
};

/**
 * The user's own loose uploads: images and videos no library item holds (files, gauge frames) and no
 * imported canvas carries. Background-referenced and unreferenced ones count; when a canvas is not
 * loaded the split is unknown and nothing is offered.
 */
export const looseAssets = (assets: readonly Asset[], items: readonly LibraryItem[], canvases: ReadonlySet<string> | null): Asset[] => {
  if (!canvases) return [];
  const held = new Set([...items.map(hashOf), ...items.flatMap(heldIds).map(hashOfId)]);
  return assets.filter((a) => (a.kind === "image" || a.kind === "video") && !held.has(hashOfId(a.id)) && !canvases.has(hashOfId(a.id)));
};

interface LooseUploadsProps {
  items: readonly LibraryItem[];
  config: Pick<DashboardConfig, "profiles">;
  /** The library list has loaded (until then every upload would look loose). */
  ready: boolean;
  onImport: (assets: readonly Asset[]) => Promise<{ added: number; duplicates: number; failed: number }>;
  onResult: (message: string) => void;
}

/** A one-time offer to add the uploaded files that are not in My library; hidden when there are none. */
export function LooseUploads({ items, config, ready, onImport, onResult }: LooseUploadsProps) {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    listAssets().then(
      (all) => live && setAssets(all),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [ready]);
  const loose = assets && ready ? looseAssets(assets, items, canvasHashes(config)) : [];
  if (loose.length === 0) return null;
  const run = async () => {
    setBusy(true);
    const r = await onImport(loose);
    setBusy(false);
    onResult(`Added ${r.added} uploaded file${r.added === 1 ? "" : "s"} to My library${r.failed ? `, ${r.failed} failed` : ""}`);
  };
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-ui-subtle bg-ui-panel px-5 py-2.5 text-[12.5px] text-ui-2">
      <FolderInput className="h-4 w-4 text-ui-accent-text" />
      <span className="flex-1">
        {loose.length} uploaded file{loose.length === 1 ? "" : "s"} {loose.length === 1 ? "is" : "are"} not in My library yet.
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className="h-[28px] rounded-[7px] border border-ui-default px-2.5 text-[12px] text-ui-1 hover:bg-ui-hover disabled:opacity-50"
      >
        {busy ? "Adding…" : "Add uploaded files to My library"}
      </button>
    </div>
  );
}
