/** Saving a gauge to My library (spec §6): update the item it came from, or create a new one. */
import { createLibraryItem, getLibraryItem, updateLibraryItem, type LibraryItem } from "@/lib/library";
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
  itemId?: string;
  /** Where a new one came from: a profile gauge records its profile as the item's `source`. */
  from?: GaugeEntry;
}

/** `gauge` (and its frames) as the library item `itemId`, or, without an item, as a new one. */
export async function saveGauge(p: SaveGauge): Promise<LibraryItem<GaugeLibraryData>> {
  if (p.itemId) {
    const prev = gaugeDataOf((await getLibraryItem(p.itemId)).data) ?? undefined;
    const data = gaugeDataFor({ gauge: p.gauge, frames: p.frames, animationSpeed: p.animationSpeed, prev });
    return updateLibraryItem<GaugeLibraryData>(p.itemId, { name: p.name, data, ...(data.frames ? { files: frameFiles(data.frames) } : {}) });
  }
  const from = p.from;
  const inProfile = from?.source.kind === "canvas" || from?.source.kind === "widget";
  const data = gaugeDataFor({
    gauge: p.gauge,
    frames: p.frames ?? from?.files,
    min: from?.min,
    max: from?.max,
    animationSpeed: p.animationSpeed ?? from?.animationSpeed,
    ...(from && inProfile ? { source: from.where } : {}),
  });
  return createLibraryItem<GaugeLibraryData>({ kind: "gauge", name: p.name, data, ...(data.frames ? { files: frameFiles(data.frames) } : {}) });
}
