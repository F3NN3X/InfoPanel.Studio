import { CANVAS_ID, SCROLL_ROW_H, type DashboardConfig, type MonitorProfile, type Placement, type ProfilePage } from "./layout";
import { profileGap, profilePadding, trackSize, zoneBox, type GridBox } from "./profile-grid";
import type { StoredCanvas } from "./infopanel/import/stored";

/**
 * Free pages (one-editor SPEC §3.1, §6): a page that is one canvas placement spanning the grid, its canvas the
 * screen's size (v15 keeps no flag; the shape says it, Edit v3 SPEC §3.4's canvas-backed page). The kiosk draws it
 * as any canvas zone, fitted into the grid's area. These helpers keep that true while the screen changes, and give
 * the grid's geometry the layout switch (page-layout.ts) and the free areas made from Add work in. Light on purpose:
 * the studio's first bundle and the kiosk load it.
 */

/** A page that is Free: its one placement a canvas filling the grid. */
export function isFreePage(profile: Pick<MonitorProfile, "cols" | "rows">, page: Pick<ProfilePage, "placements"> | undefined): boolean {
  return page !== undefined && freePlacementOf(profile, page) !== null;
}

/** A page's one placement when it is a canvas filling the grid, else null. */
function freePlacementOf(profile: Pick<MonitorProfile, "cols" | "rows">, page: Pick<ProfilePage, "placements">): Placement | null {
  const [only, ...rest] = page.placements;
  if (!only || rest.length || only.module !== CANVAS_ID) return null;
  return only.colStart === 1 && only.rowStart === 1 && only.colSpan === profile.cols && only.rowSpan === profile.rows ? only : null;
}

/** The grid's area as the kiosk draws it, in design px: inside the padding, its rows fixed on a scrolling page. */
export function gridArea(profile: Pick<MonitorProfile, "width" | "height" | "rows" | "fit" | "gap" | "padding">): { width: number; height: number } {
  const pad = profilePadding(profile, true);
  const gap = profileGap(profile);
  const width = Math.max(1, profile.width - 2 * pad);
  const height = profile.fit === "fill" ? Math.max(1, profile.height - 2 * pad) : profile.rows * SCROLL_ROW_H + (profile.rows - 1) * gap;
  return { width, height };
}

/** One cell's track size: columns share the area's width, rows its height (or SCROLL_ROW_H on a scrolling page). */
export function trackOf(profile: Pick<MonitorProfile, "width" | "height" | "cols" | "rows" | "fit" | "gap" | "padding">): { width: number; height: number } {
  const area = gridArea(profile);
  const gap = profileGap(profile);
  return { width: trackSize(area.width, profile.cols, gap), height: profile.fit === "fill" ? trackSize(area.height, profile.rows, gap) : SCROLL_ROW_H };
}

/** A zone's box in the grid's area (design px). */
export function cellBox(
  profile: Pick<MonitorProfile, "width" | "height" | "cols" | "rows" | "fit" | "gap" | "padding">,
  zone: Pick<Placement, "colStart" | "rowStart" | "colSpan" | "rowSpan">,
): GridBox {
  return zoneBox({ col: zone.colStart, row: zone.rowStart, cols: zone.colSpan, rows: zone.rowSpan }, trackOf(profile), profileGap(profile));
}

/** A canvas with its profile's size set (Keep positions: the items stay where they are); the same canvas when it is that size. */
export function resizedCanvas(canvas: StoredCanvas, width: number, height: number): StoredCanvas {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (canvas.profile.Width === w && canvas.profile.Height === h) return canvas;
  return { ...canvas, profile: { ...canvas.profile, Width: w, Height: h } };
}

/**
 * The profile after a change to its size or grid, its Free pages kept Free: each one's placement spans the new grid,
 * and when the screen's size changed its canvas takes the new size, every item kept where it is (the plan's default,
 * Keep positions). `prev` is the profile before the change; the same `next` comes back when nothing needed doing.
 */
export function fitFreePages(prev: Pick<MonitorProfile, "width" | "height" | "cols" | "rows">, next: MonitorProfile): MonitorProfile {
  const sized = prev.width !== next.width || prev.height !== next.height;
  if (!sized && prev.cols === next.cols && prev.rows === next.rows) return next;
  let changed = false;
  const pages = next.pages.map((page) => {
    if (!freePlacementOf(prev, page)) return page;
    const [zone] = page.placements;
    const canvas = sized && zone.canvas ? resizedCanvas(zone.canvas, next.width, next.height) : zone.canvas;
    if (zone.colSpan === next.cols && zone.rowSpan === next.rows && canvas === zone.canvas) return page;
    changed = true;
    return { ...page, placements: [{ ...zone, colSpan: next.cols, rowSpan: next.rows, ...(canvas ? { canvas } : {}) }] };
  });
  return changed ? { ...next, pages } : next;
}

/**
 * A Free page's canvas replaced (the canvas editor's commit), the screen's size following the canvas's: resizing the
 * profile in the editor resizes the screen, as resizing the screen resizes its Free pages. A free area on a grid page
 * only has its canvas replaced.
 */
export function withFreeCanvas(config: DashboardConfig, zoneId: string, canvas: StoredCanvas): DashboardConfig {
  let hit = false;
  const profiles = config.profiles.map((p) => {
    const at = p.pages.findIndex((pg) => pg.placements.some((z) => z.id === zoneId));
    if (at < 0) return p;
    hit = true;
    const pages = p.pages.map((pg, i) => (i === at ? { ...pg, placements: pg.placements.map((z) => (z.id === zoneId ? { ...z, canvas } : z)) } : pg));
    const resized = { ...p, pages };
    const width = Number(canvas.profile.Width);
    const height = Number(canvas.profile.Height);
    if (!isFreePage(p, p.pages[at]) || !(width > 0 && height > 0) || (width === p.width && height === p.height)) return resized;
    return fitFreePages(p, { ...resized, width, height });
  });
  return hit ? { ...config, profiles } : config;
}
