/** A canvas Gauge item's frames as asset-store ids, for saving it to My library (spec §6). */
import type { OpenCanvas } from "@/lib/infopanel/canvas";
import { assetKey } from "@/lib/infopanel/assets/assets";
import { frameNames } from "@/lib/infopanel/gauges/frames";
import type { GaugeItem } from "@/lib/infopanel/schema";
import type { LibraryFrame } from "./model";

const ASSET_ID = /^[0-9a-f]{64}\.[a-z0-9]+$/;

/** The item's frames as library frames (the id the store holds the file under, and its file name); null if any frame is not a stored file. */
export function libraryFramesOf(open: OpenCanvas, item: GaugeItem): LibraryFrame[] | null {
  const names = frameNames(item);
  if (names.length === 0) return null;
  const out: LibraryFrame[] = [];
  for (const key of names) {
    const stored = key ? open.stored.assets.find((a) => assetKey(a.name) === key) : undefined;
    const id = key ? open.assets.get(key)?.url?.split("/").pop() : undefined;
    if (!stored || !id || !ASSET_ID.test(id)) return null;
    out.push({ id, name: stored.name });
  }
  return out;
}
