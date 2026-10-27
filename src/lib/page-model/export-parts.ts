/**
 * A screen page as the .infopanel writer takes it (Edit v3 SPEC §11.4): its layer tree, bottom first. Its own module
 * so the kiosk, which loads `items-layer.ts`, doesn't carry it; only the conversion (`convert-view.ts`) does.
 */
import { ITEM_ID, type MonitorProfile, type Placement, type ProfilePage } from "../layout.ts";
import type { StoredCanvas, StoredItem } from "../infopanel/import/stored.ts";
import { pageCanvas, placedItem, type Screen } from "./items-layer.ts";
import type { LayerNode } from "./model.ts";
import { readPlacements } from "./placements-adapter.ts";

/**
 * One part of a screen page as the .infopanel writer takes it: a zone, a run of item placements as a canvas, or a page
 * group with its own parts (an InfoPanel Group named after it).
 */
export type ExportPart = { zone: Placement } | { items: StoredCanvas } | { group: { name: string; parts: ExportPart[] } };

/**
 * A screen page in the order it exports (SPEC §11.4), bottom first, as its layer tree has it: each of `zones` (the
 * zones to convert, by id) where the page has it, each run of item placements between them as one canvas the screen's
 * size holding the items at their box in screen px, so they export as the items they are, and each page group as a
 * group of its own parts, so InfoPanel shows the same tree. Hidden parts and hidden groups are left out, as the kiosk
 * leaves them out; an empty group too.
 */
export function exportParts(profile: Screen, page: ProfilePage, zones: readonly Placement[]): ExportPart[] {
  const byId = new Map(zones.map((z) => [z.id, z]));
  const list = (nodes: readonly LayerNode[]): ExportPart[] => {
    const out: ExportPart[] = [];
    let run: StoredItem[] = [];
    const flush = () => {
      if (run.length) out.push({ items: pageCanvas(page, run, profile.width, profile.height) });
      run = [];
    };
    for (const n of [...nodes].reverse()) {
      if (n.type === "group") {
        if (n.hidden) continue;
        const parts = list(n.children);
        if (parts.length === 0) continue;
        flush();
        out.push({ group: { name: n.name, parts } });
        continue;
      }
      if (n.ref.backing !== "placement") continue;
      const p = n.ref.placement;
      if (p.module === ITEM_ID) {
        if (p.visible && p.item) run.push(placedItem(profile, p)!);
        continue;
      }
      const zone = byId.get(p.id);
      if (!zone) continue;
      flush();
      out.push({ zone });
    }
    flush();
    return out;
  };
  return list(readPlacements(profile as MonitorProfile, page).root);
}
