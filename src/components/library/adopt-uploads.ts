/**
 * Every upload is in My library: a file in the asset store that no item holds and no imported canvas
 * carries (an older upload, or one picked straight into a widget or a background) becomes an item when
 * the Library loads. It keeps its stored file (nothing is uploaded again or renamed on disk); the asset
 * store keeps no original name, so the item is named "Upload 1a2b3c4d.png". Idempotent: once an item
 * holds a file it is no longer loose.
 */
import { useEffect, useRef, useState } from "react";
import { listAssets, type Asset } from "@/lib/assets";
import type { DashboardConfig } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import { hashOf } from "@/lib/my-library/model";
import { dataOf } from "./library-actions";

/** A library item's version: its data is fetched again only when it changes. */
const versionOf = (item: LibraryItem) => `${item.id}@${item.updatedAt}`;
const FAILED = Symbol("failed");

const hashOfId = (id: string) => id.slice(0, 64);

/** The name an adopted upload gets: "Upload 1a2b3c4d.png" reads better than the 64-hex id. */
export const uploadName = (a: Pick<Asset, "id">): string => `Upload ${a.id.slice(0, 8)}${a.id.includes(".") ? a.id.slice(a.id.lastIndexOf(".")) : ""}`;

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
export const heldIds = (item: Pick<LibraryItem, "files" | "data">): string[] => {
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

export interface AdoptUploadsOptions {
  items: readonly LibraryItem[];
  config: Pick<DashboardConfig, "profiles">;
  /** The library list has loaded (until then every upload would look loose). */
  ready: boolean;
  /** Make the files items (`useMyLibrary().importAssets`). */
  adopt: (assets: readonly Asset[]) => Promise<{ added: number; duplicates: number; failed: number }>;
  onAdopted?: (added: number) => void;
}

/**
 * Bring the loose uploads into My library once the list has loaded. Each file is tried once per mount
 * (a failed one isn't retried in a loop); the gauges whose data the list left out are read first, so
 * their frames are never taken for loose files.
 */
export function useAdoptUploads({ items, config, ready, adopt, onAdopted }: AdoptUploadsOptions): void {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const tried = useRef(new Set<string>());
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
  const [datas, setDatas] = useState<ReadonlyMap<string, unknown>>(() => new Map());
  const pending = items.filter((i) => i.kind === "gauge" && i.data === undefined && i.dataSize && !datas.has(versionOf(i)));
  const pendingKey = pending.map(versionOf).join();
  useEffect(() => {
    if (!ready || pending.length === 0) return;
    let live = true;
    void Promise.allSettled(pending.map((i) => dataOf(i))).then((results) => {
      if (!live) return;
      setDatas((m) => new Map([...m, ...results.map((r, n) => [versionOf(pending[n]), r.status === "fulfilled" ? r.value : FAILED] as const)]));
    });
    return () => {
      live = false;
    };
  }, [ready, pendingKey]);
  // A gauge whose data won't load leaves its frames unknown: nothing is adopted until it does.
  const failed = items.some((i) => datas.get(versionOf(i)) === FAILED);
  const judged = ready && assets && pending.length === 0 && !failed ? items.map((i) => (datas.has(versionOf(i)) ? { ...i, data: datas.get(versionOf(i)) } : i)) : null;
  const loose = judged && assets ? looseAssets(assets, judged, canvasHashes(config)).filter((a) => !tried.current.has(a.id)) : [];
  const looseKey = loose.map((a) => a.id).join();
  useEffect(() => {
    if (loose.length === 0) return;
    for (const a of loose) tried.current.add(a.id);
    void adopt(loose).then(
      (r) => r.added > 0 && onAdopted?.(r.added),
      () => {},
    );
  }, [looseKey]);
}
