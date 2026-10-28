import { onPage } from "@/lib/pages";
import { BLANK_MODULE, CANVAS_ID, ITEM_ID, SCROLL_ROW_H, newProfile, uid, type DashboardConfig, type Placement, type ProfileView } from "@/lib/layout";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import { withProfile } from "./profile-actions";
import { firstFreeRect, type ZoneRect } from "./zone-geometry";
import { canvasAsGroup } from "@/lib/page-model/canvas-group";
import { cellCount } from "@/lib/page-model/migrate";
import { cellsOverlap } from "@/lib/page-model/model";

/** A canvas zone holding `canvas` in `rect`. */
function canvasZone(id: string, canvas: StoredCanvas, rect: ZoneRect): Placement {
  return { id, module: CANVAS_ID, colStart: rect.col, rowStart: rect.row, colSpan: rect.cols, rowSpan: rect.rows, visible: true, canvas };
}

/**
 * A new profile sized like the InfoPanel one, its one canvas zone filling it (a canvas-backed page, made for InfoPanel), made the
 * active profile unless `activate` is off (the studio leaves what displays open on alone). Its grid has cells of about 100 px with
 * no gap or padding (Edit v3 SPEC §3.7); the zone spans it, so every item keeps its X / Y.
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
  const { cols, rows } = cellCount(base);
  const profile = {
    ...base,
    cols,
    rows,
    gap: 0,
    padding: 0,
    fit: "fill" as const,
    madeFor: "infopanel" as const,
    pages: base.pages.map((p, i) => (i === 0 ? { ...p, placements: [canvasZone(zoneId, canvas, { col: 1, row: 1, cols, rows })] } : p)),
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

/**
 * An InfoPanel profile or component added to one page of a profile (one undo step), in the cells it draws largest
 * in: its items become item placements at the pixels it draws them, in a group named after it (Edit v3 SPEC §3.8, as
 * v15 converts a free area; none is made any more), a widget item a widget on the nearest free cells. `zoneId` is the
 * group's id. Null when the page has no room, for the canvas or for a widget it holds.
 */
export function importIntoProfile(
  config: DashboardConfig,
  view: ProfileView,
  canvas: StoredCanvas,
  size: { width: number; height: number },
  at?: ZoneRect,
): { config: DashboardConfig; zoneId: string } | null {
  const rect = at ?? canvasRect(view, size.width, size.height);
  if (!rect) return null;
  const zoneId = uid(CANVAS_ID);
  const add = onPage(view.pageId, (v) => ({ ...v, placements: [...v.placements, canvasZone(zoneId, canvas, rect)] }));
  const made: { groupId: string | null; collides: boolean } = { groupId: null, collides: false };
  const profiles = config.profiles.map((p) => {
    if (p.id !== view.id) return p;
    const added = add(p);
    const pages = added.pages.map((pg) => {
      if (!pg.placements.some((z) => z.id === zoneId)) return pg;
      const r = canvasAsGroup(added, pg, zoneId);
      made.groupId = r.groupId;
      made.collides = widgetsCollide(r.page.placements, pg.placements);
      return r.page;
    });
    return { ...added, pages };
  });
  // A widget it holds (a component saved from a screen's page) never lands on another (decision Q3): no room, no add.
  return made.groupId && !made.collides ? { config: { ...config, profiles }, zoneId: made.groupId } : null;
}

const isWidget = (p: Placement) => p.module !== ITEM_ID && p.module !== BLANK_MODULE && p.module !== CANVAS_ID;
const cellsOf = (p: Placement) => ({ col: p.colStart, row: p.rowStart, cols: p.colSpan, rows: p.rowSpan });

/** Whether a widget added to the page (not in `before`) shares a cell with another widget. */
function widgetsCollide(placements: readonly Placement[], before: readonly Placement[]): boolean {
  const old = new Set(before.map((p) => p.id));
  const widgets = placements.filter(isWidget);
  return widgets.some((a) => !old.has(a.id) && widgets.some((b) => b !== a && cellsOverlap(cellsOf(a), cellsOf(b))));
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

/** One zone's settings replaced (the InfoPanel conversion's remembered choices); same config when the zone is absent. */
export function withZoneSettings(config: DashboardConfig, zoneId: string, settings: NonNullable<Placement["settings"]>): DashboardConfig {
  let hit = false;
  const profiles = config.profiles.map((p) => {
    const pages = p.pages.map((pg) => {
      if (!pg.placements.some((z) => z.id === zoneId)) return pg;
      hit = true;
      return { ...pg, placements: pg.placements.map((z) => (z.id === zoneId ? { ...z, settings } : z)) };
    });
    return pages.every((pg, i) => pg === p.pages[i]) ? p : { ...p, pages };
  });
  return hit ? { ...config, profiles } : config;
}

export { countItems } from "@/lib/my-library/canvas-link";
