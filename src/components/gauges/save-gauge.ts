/** Saving a gauge to My library (spec §6): update the item it came from, or create a new one. */
import { createLibraryItem, getLibraryItem, listLibrary, updateLibraryItem, type LibraryItem } from "@/lib/library";
import { stampFormat } from "@/lib/my-library/item-format";
import { isLinkCopy, linkedItem, type GaugeLink } from "@/lib/gauge-studio/gauge-link";
import { frameFiles, gaugeDataFor } from "@/lib/gauge-studio/gauge-data";
import { gaugeDataOf, type GaugeEntry, type GaugeLibraryData, type LibraryFrame } from "@/lib/gauge-studio/model";
import type { VectorGauge } from "@/lib/infopanel/gauges/vector";

export interface SaveGauge {
  name: string;
  /** The spec; null for an image sequence. */
  gauge: VectorGauge | null;
  /** The frames: an update keeps the item's when none are given, a new item from `from` takes that gauge's. */
  frames?: LibraryFrame[];
  animationSpeed?: number;
  /** The range of a new item with no `from` to take it from. */
  min?: number;
  max?: number;
  itemId?: string;
  /** Where a new one came from: a profile gauge records its profile as the item's `source`. */
  from?: GaugeEntry;
  /** Where a profile gauge lives: without an `itemId`, the item it is linked to is updated, else the new one is linked. */
  link?: GaugeLink;
  /** Save as new: always a new item, and a profile gauge's link moves to it from the item it had. */
  asNew?: boolean;
}

/** What was written, and whether an existing item was updated (else a new one was created). */
export type SavedGauge = LibraryItem<GaugeLibraryData> & { updated: boolean };

/** `gauge` (and its frames) as the library item `itemId`, or, without an item, as a new one. */
export async function saveGauge(p: SaveGauge): Promise<SavedGauge> {
  const old = p.asNew && p.link ? linkedItem(await listLibrary(), p.link) : undefined;
  const itemId = p.asNew ? undefined : (p.itemId ?? (p.link ? linkedItem(await listLibrary(), p.link)?.id : undefined));
  if (itemId) {
    const saved = await getLibraryItem(itemId);
    const prev = gaugeDataOf(saved.data) ?? undefined;
    const data = gaugeDataFor({ gauge: p.gauge, frames: p.frames, animationSpeed: p.animationSpeed, prev });
    const item = await updateLibraryItem<GaugeLibraryData>(itemId, { name: p.name, data, meta: stampFormat(saved.meta), ...(data.frames ? { files: frameFiles(data.frames) } : {}) });
    return { ...item, updated: true };
  }
  // Save as new keeps what the item it forks from has beyond the editor's pieces (source, frame rate, frames).
  const forkOf = p.itemId ?? old?.id;
  const prev = p.asNew && forkOf ? (gaugeDataOf((await getLibraryItem(forkOf).catch(() => undefined))?.data) ?? undefined) : undefined;
  const from = p.from;
  const inProfile = from?.source.kind === "canvas" || from?.source.kind === "widget";
  const data = gaugeDataFor({
    gauge: p.gauge,
    frames: p.frames ?? from?.files,
    min: from?.min ?? p.min,
    max: from?.max ?? p.max,
    animationSpeed: p.animationSpeed ?? from?.animationSpeed,
    ...(from && inProfile ? { source: from.where } : {}),
    prev,
  });
  const item = await createLibraryItem<GaugeLibraryData>({ kind: "gauge", name: p.name, data, meta: stampFormat(), ...(data.frames ? { files: frameFiles(data.frames) } : {}) });
  if (p.link) {
    const link = p.link;
    // The old link goes only once the new one is recorded: a failed record keeps the gauge linked to its old item
    // (recordCopy swallows errors, so the write is made here).
    const linked = await updateLibraryItem(item.id, { copies: [...item.copies, { ...link, label: p.name, at: new Date().toISOString() }] }).then(
      () => true,
      (e) => (console.error("Failed to link the gauge to its new library item", e), false),
    );
    if (linked && old) await updateLibraryItem(old.id, { copies: old.copies.filter((c) => !isLinkCopy(c, link)) }).catch((e) => console.error("Failed to unlink the gauge from its previous library item", e));
  }
  return { ...item, updated: false };
}
