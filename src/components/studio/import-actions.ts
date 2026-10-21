import { onPage } from "@/lib/pages";
import { CANVAS_ID, SCROLL_ROW_H, newProfile, uid, type DashboardConfig, type Placement, type ProfileView } from "@/lib/layout";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import { withProfile } from "./profile-actions";
import { firstFreeRect, type ZoneRect } from "./zone-geometry";

/** A canvas zone holding `canvas` in `rect`. */
function canvasZone(id: string, canvas: StoredCanvas, rect: ZoneRect): Placement {
  return { id, module: CANVAS_ID, colStart: rect.col, rowStart: rect.row, colSpan: rect.cols, rowSpan: rect.rows, visible: true, canvas };
}

/**
 * A new profile sized like the InfoPanel one, its one canvas zone filling it, made the active
 * profile unless `activate` is off (the studio leaves what displays open on alone). Two columns, as profile normalization asks; the zone spans both.
 */
export function importAsProfile(
  config: DashboardConfig,
  canvas: StoredCanvas,
  name: string,
  size: { width: number; height: number },
  activate = true,
): { config: DashboardConfig; profileId: string; zoneId: string } {
  const zoneId = uid(CANVAS_ID);
  const base = newProfile(name, Math.max(1, Math.round(size.width)), Math.max(1, Math.round(size.height)));
  const profile = {
    ...base,
    cols: 2,
    rows: 1,
    fit: "fill" as const,
    pages: base.pages.map((p, i) => (i === 0 ? { ...p, placements: [canvasZone(zoneId, canvas, { col: 1, row: 1, cols: 2, rows: 1 })] } : p)),
  };
  return { config: withProfile(config, profile, activate), profileId: profile.id, zoneId };
}

/**
 * The free box of the view that draws a `width`×`height` canvas largest (fitted, aspect kept);
 * the smaller box wins a tie. Null when no cell is free.
 */
export function canvasRect(view: ProfileView, width: number, height: number): ZoneRect | null {
  const cellW = view.width / view.cols;
  const cellH = view.fit === "fill" ? view.height / view.rows : SCROLL_ROW_H;
  let best: { rect: ZoneRect; scale: number; area: number } | null = null;
  for (let cols = 1; cols <= view.cols; cols++) {
    for (let rows = 1; rows <= view.rows; rows++) {
      const rect = firstFreeRect(view.cols, view.rows, { cols, rows }, view.placements);
      if (!rect) continue;
      const scale = Math.min((cols * cellW) / Math.max(1, width), (rows * cellH) / Math.max(1, height));
      const area = cols * rows;
      if (!best || scale > best.scale + 1e-9 || (Math.abs(scale - best.scale) <= 1e-9 && area < best.area)) best = { rect, scale, area };
    }
  }
  return best?.rect ?? null;
}

/** A canvas zone added to one page of a profile (one undo step); null when the page has no room. */
export function importIntoProfile(
  config: DashboardConfig,
  view: ProfileView,
  canvas: StoredCanvas,
  size: { width: number; height: number },
): { config: DashboardConfig; zoneId: string } | null {
  const rect = canvasRect(view, size.width, size.height);
  if (!rect) return null;
  const zoneId = uid(CANVAS_ID);
  const add = onPage(view.pageId, (v) => ({ ...v, placements: [...v.placements, canvasZone(zoneId, canvas, rect)] }));
  return { config: { ...config, profiles: config.profiles.map((p) => (p.id === view.id ? add(p) : p)) }, zoneId };
}

/** The canvas zone of a profile view the Export dialog writes: the selected one, else the first. */
export function canvasZoneOf(view: ProfileView, selectedId?: string): Placement | undefined {
  const zones = view.placements.filter((p) => p.module === CANVAS_ID && p.canvas);
  return zones.find((p) => p.id === selectedId) ?? zones[0];
}

/** One canvas zone's stored form replaced (the export's baked frames); same config when absent. */
export function withCanvas(config: DashboardConfig, zoneId: string, canvas: StoredCanvas): DashboardConfig {
  let hit = false;
  const profiles = config.profiles.map((p) => {
    const pages = p.pages.map((pg) => {
      if (!pg.placements.some((z) => z.id === zoneId)) return pg;
      hit = true;
      return { ...pg, placements: pg.placements.map((z) => (z.id === zoneId ? { ...z, canvas } : z)) };
    });
    return pages.every((pg, i) => pg === p.pages[i]) ? p : { ...p, pages };
  });
  return hit ? { ...config, profiles } : config;
}

/** Every item in a canvas, inside groups too (the Library card's count). */
export function countItems(items: StoredCanvas["items"]): number {
  return items.reduce((n, i) => n + 1 + ("DisplayItems" in i && Array.isArray(i.DisplayItems) ? countItems(i.DisplayItems) : 0), 0);
}
