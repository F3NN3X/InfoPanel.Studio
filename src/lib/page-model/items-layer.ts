/**
 * How the kiosk and the studio draw a screen page's item placements (`ITEM_ID`, v15) until the one canvas of Edit v3
 * draws every part: each run of item placements between two zones becomes one canvas spanning the grid, holding those
 * items at their screen pixels, drawn in its place in the z-order (a later zone over it, an earlier one under it).
 * The canvas draws through the canvas zone's renderer (`CanvasZone`), with the page's files and fonts. Light on
 * purpose: the kiosk loads it.
 */
import { CANVAS_ID, ITEM_ID, type MonitorProfile, type Placement, type ProfilePage } from "../layout.ts";
import { gridArea } from "../free-pages.ts";
import { profilePadding } from "../profile-grid.ts";
import type { StoredCanvas, StoredItem } from "../infopanel/import/stored.ts";
import { cellRect } from "./model.ts";
import { screenGrid } from "./placements-adapter.ts";
import { atBox, moved } from "./stored-items.ts";

/** `stored.ts`'s format and version, which this light module doesn't load. */
const FORMAT: StoredCanvas["format"] = "infopanel-canvas";
const VERSION: StoredCanvas["version"] = 1;

/** The id prefix of a layer's placement (never stored). */
export const ITEMS_LAYER = "items-layer:";

/** Whether a placement is one of these layers. */
export const isItemsLayer = (p: Pick<Placement, "id">): boolean => p.id.startsWith(ITEMS_LAYER);

type Screen = Pick<MonitorProfile, "width" | "height" | "cols" | "rows" | "fit" | "gap" | "padding">;

/**
 * An item placement's item where the part sits, in screen px: placed freely at its `px`, else at its cells' box, so
 * an item on the grid follows the grid's columns, rows, gap and padding (SPEC §3.3).
 */
export function placedItem(profile: Screen, p: Placement): StoredItem | undefined {
  if (!p.item) return undefined;
  return atBox(p.item, p.px ?? cellRect(screenGrid(profile), { col: p.colStart, row: p.rowStart, cols: p.colSpan, rows: p.rowSpan }));
}

/** Whether a part in the group `groupId` is hidden by that group or one around it. */
export function hiddenByGroups(page: Pick<ProfilePage, "groups">): (groupId: string | undefined) => boolean {
  const hidden = new Set((page.groups ?? []).filter((g) => g.hidden).map((g) => g.id));
  const parent = new Map((page.groups ?? []).map((g) => [g.id, g.parentId]));
  return (id) => {
    for (let at = id, n = 0; at !== undefined && n < 64; at = parent.get(at), n++) if (hidden.has(at)) return true;
    return false;
  };
}

/** A see-through canvas `width`×`height` holding `items`, with the page's files, fonts and InfoPanel profile. */
function pageCanvas(page: ProfilePage, items: StoredItem[], width: number, height: number): StoredCanvas {
  const store = page.freeCanvas;
  return {
    format: FORMAT,
    version: VERSION,
    source: store?.source ?? { name: page.name, origin: "new", importedAt: "" },
    dataApi: store?.dataApi ?? null,
    defaultMode: store?.defaultMode ?? "infopanel",
    profile: { ...(store?.profile ?? {}), Width: Math.max(1, Math.round(width)), Height: Math.max(1, Math.round(height)), BackgroundColor: "#00000000" },
    items,
    assets: store?.assets ?? [],
    fonts: store?.fonts ?? [],
    ...(store?.palette ? { palette: store.palette } : {}),
  };
}

/** A canvas the grid's area in size, see-through, holding `items` moved from screen px into it. */
function layerCanvas(profile: Screen, page: ProfilePage, items: StoredItem[]): StoredCanvas {
  const area = gridArea(profile);
  const pad = profilePadding(profile, true);
  return pageCanvas(page, items.map((it) => moved(it, 1, -pad, -pad)), area.width, area.height);
}

/**
 * The zones to draw, in z-order, with the page's item placements as layers between them. `zones` are the view's
 * (`profileWithPage`), so a zone keeps its object; the same list comes back when the page has no item placements.
 */
export function withItemLayers(profile: Screen, page: ProfilePage | undefined, zones: Placement[]): Placement[] {
  if (!page?.placements.some((p) => p.module === ITEM_ID)) return zones;
  const byId = new Map(zones.map((z) => [z.id, z]));
  // A part inside a hidden group is hidden too.
  const inHidden = hiddenByGroups(page);
  const out: Placement[] = [];
  let run: Placement[] = [];
  const flush = () => {
    const items = run.filter((p) => p.visible && p.item && !inHidden(p.groupId)).map((p) => placedItem(profile, p)!);
    if (items.length) {
      out.push({ id: `${ITEMS_LAYER}${run[0].id}`, module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: profile.cols, rowSpan: profile.rows, visible: true, canvas: layerCanvas(profile, page, items) });
    }
    run = [];
  };
  const placed = new Set<string>();
  for (const p of page.placements) {
    if (p.module === ITEM_ID) {
      run.push(p);
      continue;
    }
    flush();
    const zone = byId.get(p.id);
    if (!zone) continue;
    placed.add(zone.id);
    if (!inHidden(zone.groupId)) out.push(zone);
  }
  flush();
  // A zone the view has that the page doesn't (yet) still draws.
  for (const z of zones) if (!placed.has(z.id)) out.push(z);
  return out;
}

/** One part of a screen page as the .infopanel writer takes it: a zone, or a run of item placements as a canvas. */
export type ExportPart = { zone: Placement } | { items: StoredCanvas };

/**
 * A screen page in the order it exports (SPEC §11.4), bottom first: each of `zones` (the zones to convert, by id) where
 * the page has it, and each run of item placements between them as one canvas the screen's size holding the items at
 * their box in screen px, so they export as the items they are and z-order follows the layer order. Hidden parts and
 * parts of hidden groups are left out, as the kiosk leaves them out.
 */
export function exportParts(profile: Screen, page: ProfilePage, zones: readonly Placement[]): ExportPart[] {
  const byId = new Map(zones.map((z) => [z.id, z]));
  const inHidden = hiddenByGroups(page);
  const out: ExportPart[] = [];
  let run: StoredItem[] = [];
  const flush = () => {
    if (run.length) out.push({ items: pageCanvas(page, run, profile.width, profile.height) });
    run = [];
  };
  for (const p of page.placements) {
    if (inHidden(p.groupId)) continue;
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
}
