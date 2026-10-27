/**
 * v15 (Edit v3 SPEC §3.8, decisions Q1, Q2, Q8): every page becomes one kind, nothing on it lost or moved.
 *
 * - A page that is one canvas filling the screen stays canvas-backed when the canvas came from InfoPanel (a file, the
 *   corpus or the installed app) or its screen is made for InfoPanel (New InfoPanel profile). A screen of only such
 *   pages is made for InfoPanel and gets a grid of about 100 px cells with no gap or padding (§3.7); its items keep
 *   their X / Y / W / H.
 * - One whose canvas was made here on a Studio screen (a beta.35 Free page) becomes a normal page: its widgets go on
 *   the cells nearest where they are, its InfoPanel items and elements become item placements (`Placement.item`)
 *   placed freely at the same screen pixels, in a group named after the page; a Group item becomes a nested group.
 * - A free area (a canvas zone on a grid page) becomes a group named after it, its items the same way, fitted and
 *   scaled as the area drew them. A widget it held goes to the nearest free cells, or overlaps once (logged).
 * - The canvas's InfoPanel profile, files and fonts move to the page (`ProfilePage.freeCanvas`), files renamed where
 *   two areas used the same name for different bytes. The canvas zone and its canvas settings stay on the group
 *   (`PageGroup.from`). A canvas that isn't loaded (only its `canvasRef`) is left as it is.
 * - The `layout` flag goes.
 *
 * Each conversion is a line in the migration log. Light on purpose: `mergeConfig` runs it in the kiosk's first bundle.
 */
import { BLANK_MODULE, CANVAS_ID, ITEM_ID, uid, type MonitorProfile, type PageGroup, type Placement, type ProfilePage } from "../layout.ts";
import { cellBox } from "../free-pages.ts";
import { profilePadding } from "../profile-grid.ts";
import { freeCanvasOf } from "../screens/list.ts";
import type { StoredCanvas, StoredItem, WidgetItem } from "../infopanel/import/stored.ts";
import { cellsOverlap, nearestCells, type CellBox, type PageGrid } from "./model.ts";
import { readPlacements, screenGrid, writePlacements } from "./placements-adapter.ts";
import { fitScale, joinAssets, joinFonts, moved, num, obj, renameFiles, roughBox, withoutItems } from "./stored-items.ts";

/** The export rule's settings key (`export/native-choices.ts`, which this light module doesn't load). */
const ON_INFOPANEL_KEY = "$onInfoPanel";

type Store = Omit<StoredCanvas, "items">;

interface Ctx {
  profile: MonitorProfile;
  grid: PageGrid;
  /** Placement ids taken on the screen. */
  taken: Set<string>;
  log: (line: string) => void;
}

/**
 * Whether a page that is one canvas stays canvas-backed: the canvas came from InfoPanel, or its screen is made for
 * InfoPanel (New InfoPanel profile, whose canvas is made here; v14 marked every screen of only such pages).
 */
const keepsCanvas = (profile: Pick<MonitorProfile, "madeFor">, canvas: Pick<StoredCanvas, "source">) => canvas.source.origin !== "new" || profile.madeFor === "infopanel";

const flagged = (on: unknown) => on === true;

function freshId(ctx: Ctx, want: unknown, prefix: string): string {
  const id = typeof want === "string" && want && !ctx.taken.has(want) ? want : uid(prefix);
  ctx.taken.add(id);
  return id;
}

/** A widget item as the zone it stands for, on `cells`. */
function widgetZone(ctx: Ctx, item: StoredItem, w: WidgetItem, cells: CellBox, groupId: string | undefined): Placement {
  const settings = { ...(w.settings ?? {}), ...(w.onInfoPanel ? { [ON_INFOPANEL_KEY]: w.onInfoPanel } : {}) };
  return {
    id: freshId(ctx, w.id, w.module),
    module: w.module,
    colStart: cells.col,
    rowStart: cells.row,
    colSpan: cells.cols,
    rowSpan: cells.rows,
    visible: !flagged(item.Hidden),
    ...(Object.keys(settings).length ? { settings } : {}),
    ...(w.design ? { design: w.design } : {}),
    ...(w.follow ? { follow: w.follow as Placement["follow"] } : {}),
    ...(w.panel ? { panel: w.panel as unknown as Placement["panel"] } : {}),
    ...(flagged(item.IsLocked) ? { locked: true } : {}),
    ...(groupId ? { groupId } : {}),
  };
}

/** Cells for a widget: the nearest to its box; when a widget already sits there, the nearest free ones of the same span. */
function widgetCells(ctx: Ctx, want: CellBox, others: readonly Placement[], what: string): CellBox {
  const used = others.filter((p) => p.module !== ITEM_ID && p.module !== BLANK_MODULE && p.module !== CANVAS_ID).map((p) => ({ col: p.colStart, row: p.rowStart, cols: p.colSpan, rows: p.rowSpan }));
  if (!used.some((u) => cellsOverlap(u, want))) return want;
  let best: CellBox | null = null;
  let dist = Infinity;
  for (let row = 1; row + want.rows - 1 <= ctx.grid.rows; row++) {
    for (let col = 1; col + want.cols - 1 <= ctx.grid.cols; col++) {
      const c = { col, row, cols: want.cols, rows: want.rows };
      if (used.some((u) => cellsOverlap(u, c))) continue;
      const d = (col - want.col) ** 2 + (row - want.row) ** 2;
      if (d < dist) [best, dist] = [c, d];
    }
  }
  if (best) {
    ctx.log(`${what} moved to the nearest free cells (column ${best.col}, row ${best.row}).`);
    return best;
  }
  ctx.log(`${what} has no free cells, so it overlaps another widget for now.`);
  return want;
}

/**
 * A canvas's items (bottom first) as placements and groups on the screen: `toScreen` moves an item to screen px.
 * Placements are added to `out` (bottom first), groups to `groups`.
 */
function convertItems(
  ctx: Ctx,
  items: readonly StoredItem[],
  toScreen: (item: StoredItem) => StoredItem,
  fontScale: number,
  groupId: string | undefined,
  out: Placement[],
  groups: PageGroup[],
  where: string,
): void {
  for (const raw of items) {
    const $ = obj(raw.$);
    const widget = raw.kind === "Image" ? (obj($?.widget) as WidgetItem | null) : null;
    if (raw.kind === "Group" && !$?.element) {
      const { DisplayItems: kids, ...self } = raw;
      const id = uid("group");
      groups.push({
        id,
        name: typeof raw.Name === "string" && raw.Name ? raw.Name : "Group",
        ...(groupId ? { parentId: groupId } : {}),
        ...(flagged(raw.IsLocked) ? { locked: true } : {}),
        ...(flagged(raw.Hidden) ? { hidden: true } : {}),
        from: { item: self },
      });
      convertItems(ctx, Array.isArray(kids) ? (kids as StoredItem[]) : [], toScreen, fontScale, id, out, groups, where);
      continue;
    }
    const item = toScreen(raw);
    const box = roughBox(item, fontScale);
    const px = { x: num(item.X), y: num(item.Y), w: Math.max(1, Math.round(box.w)), h: Math.max(1, Math.round(box.h)) };
    if (widget && typeof widget.module === "string") {
      const name = typeof raw.Name === "string" && raw.Name ? raw.Name : widget.module;
      const cells = widgetCells(ctx, nearestCells(ctx.grid, px), out, `${where}: ${name}`);
      out.push(widgetZone(ctx, raw, widget, cells, groupId));
      continue;
    }
    const covering = nearestCells(ctx.grid, px, true);
    out.push({
      id: freshId(ctx, undefined, ITEM_ID),
      module: ITEM_ID,
      colStart: covering.col,
      rowStart: covering.row,
      colSpan: covering.cols,
      rowSpan: covering.rows,
      visible: !flagged(item.Hidden),
      item,
      px,
      ...(groupId ? { groupId } : {}),
      ...(flagged(item.IsLocked) ? { locked: true } : {}),
    });
  }
}

/** A canvas's own font scale (InfoPanel's 1.33 when unset). */
const fontScaleOf = (canvas: Pick<StoredCanvas, "profile">) => (typeof canvas.profile.FontScale === "number" && canvas.profile.FontScale > 0 ? canvas.profile.FontScale : 1.33);

/**
 * A canvas's background as a locked Shape filling it, so the page draws it where the canvas did; null when it is
 * see-through. Fields it doesn't set read as InfoPanel's defaults.
 */
function backdrop(canvas: StoredCanvas): StoredItem | null {
  const bg = canvas.profile.BackgroundColor;
  if (typeof bg !== "string" || (bg.length === 9 && bg.startsWith("#00"))) return null;
  const [w, h] = [num(canvas.profile.Width), num(canvas.profile.Height)];
  if (w <= 0 || h <= 0) return null;
  return { kind: "Shape", Name: "Background", X: 0, Y: 0, Width: w, Height: h, Type: "Rectangle", CornerRadius: 0, ShowFrame: false, ShowFill: true, FillColor: bg, ShowGradient: false, IsLocked: true, unknown: {} };
}

/** Items whose FontSize is baked by `k` (a free area's font scale onto the page's). */
function bakeFonts(items: readonly StoredItem[], k: number): StoredItem[] {
  if (Math.abs(k - 1) < 1e-9) return [...items];
  return items.map((it) => ({
    ...it,
    ...(typeof it.FontSize === "number" ? { FontSize: Math.max(1, Math.round(it.FontSize * k)) } : {}),
    ...(Array.isArray(it.DisplayItems) ? { DisplayItems: bakeFonts(it.DisplayItems as StoredItem[], k) } : {}),
  }));
}

/** Q1: a Free page on a Studio screen as a normal page; its items in a group named after it. */
function freePageToGrid(ctx: Ctx, page: ProfilePage, zone: Placement, canvas: StoredCanvas): ProfilePage {
  const where = `${ctx.profile.name} › ${page.name}`;
  const pad = profilePadding(ctx.profile, true);
  const areaBox = cellBox(ctx.profile, zone);
  const w = num(canvas.profile.Width);
  const h = num(canvas.profile.Height);
  const s = fitScale(w, h, areaBox.width, areaBox.height);
  const dx = pad + areaBox.left + (areaBox.width - w * s) / 2;
  const dy = pad + areaBox.top + (areaBox.height - h * s) / 2;
  const toScreen = (it: StoredItem) => moved(it, s, dx, dy);
  const groupId = uid("group");
  const { canvas: _c, canvasRef: _r, ...self } = zone;
  const groups: PageGroup[] = [{ id: groupId, name: page.name, ...(zone.visible ? {} : { hidden: true }), from: { zone: self } }];
  const placements: Placement[] = [];
  // Widgets sit at the top level, as they did on the grid; everything else in the page's group.
  const isWidget = (it: StoredItem) => it.kind === "Image" && obj(obj(it.$)?.widget) !== null;
  // The canvas's background behind everything, widgets too, as the page drew it.
  const back = backdrop(canvas);
  if (back) convertItems(ctx, [back], toScreen, fontScaleOf(canvas) * s, undefined, placements, groups, where);
  for (const it of canvas.items) convertItems(ctx, [it], toScreen, fontScaleOf(canvas) * s, isWidget(it) ? undefined : groupId, placements, groups, where);
  const widgets = canvas.items.filter(isWidget).length;
  const parts = canvas.items.length - widgets;
  ctx.log(
    `${where}: the Free page is a normal page now. ${widgets} widget${widgets === 1 ? "" : "s"} on cells, ${parts} part${parts === 1 ? "" : "s"} placed freely in the group "${page.name}".`,
  );
  const { freeCanvas: _old, ...kept } = page;
  return { ...kept, placements, groups: [...(page.groups ?? []), ...groups], freeCanvas: withoutItems(canvas) };
}

/** A free area as a group of its items, at the pixels the area drew them; the page's store takes its files and fonts. */
function areaToGroup(ctx: Ctx, page: ProfilePage, zone: Placement, canvas: StoredCanvas, store: Store | undefined, out: Placement[], groups: PageGroup[]): Store {
  const where = `${ctx.profile.name} › ${page.name}`;
  const name = typeof canvas.source?.name === "string" && canvas.source.name ? canvas.source.name : "Free area";
  const pad = profilePadding(ctx.profile, true);
  const box = cellBox(ctx.profile, zone);
  const w = num(canvas.profile.Width);
  const h = num(canvas.profile.Height);
  const a = fitScale(w, h, box.width, box.height);
  const dx = pad + box.left + (box.width - w * a) / 2;
  const dy = pad + box.top + (box.height - h * a) / 2;
  const base: Store = store ?? withoutItems({ ...canvas, assets: [], fonts: [] });
  const joined = joinAssets(base.assets, canvas.assets);
  const fontK = fontScaleOf(canvas) / fontScaleOf(base);
  const back = backdrop(canvas);
  const items = [...(back ? [back] : []), ...bakeFonts(renameFiles(canvas.items, joined.names), fontK)];
  const id = uid("group");
  const { canvas: _c, canvasRef: _r, ...self } = zone;
  groups.push({ id, name, ...(zone.visible ? {} : { hidden: true }), from: { zone: self, canvas: withoutItems(canvas) } });
  convertItems(ctx, items, (it) => moved(it, a, dx, dy), fontScaleOf(base) * a, id, out, groups, `${where} › ${name}`);
  const notes = [
    a !== 1 ? ` Scaled by ${Math.round(a * 1000) / 1000} as the area drew it.` : "",
    joined.names.size ? ` ${joined.names.size} file${joined.names.size === 1 ? "" : "s"} renamed.` : "",
    Math.abs(fontK - 1) > 1e-9 ? " Font sizes adjusted to the page's font scale." : "",
  ].join("");
  ctx.log(`${where}: the free area "${name}" is a group now, ${items.length} part${items.length === 1 ? "" : "s"} at the same pixels.${notes}`);
  return { ...base, assets: joined.assets, fonts: joinFonts(base.fonts, canvas.fonts) };
}

function migratePage(ctx: Ctx, page: ProfilePage): ProfilePage {
  const where = `${ctx.profile.name} › ${page.name}`;
  const whole = freeCanvasOf(ctx.profile, page);
  if (whole) {
    if (!whole.canvas) {
      ctx.log(`${where}: left as it is, its canvas isn't loaded.`);
      return page;
    }
    return keepsCanvas(ctx.profile, whole.canvas) ? page : freePageToGrid(ctx, page, whole, whole.canvas);
  }
  const areas = page.placements.filter((p) => p.module === CANVAS_ID);
  if (areas.length === 0) return page;
  let store = page.freeCanvas;
  const placements: Placement[] = [];
  const groups: PageGroup[] = [...(page.groups ?? [])];
  for (const p of page.placements) {
    if (p.module !== CANVAS_ID) placements.push(p);
    else if (!p.canvas) {
      ctx.log(`${where}: a free area was left as it is, its canvas isn't loaded.`);
      placements.push(p);
    } else store = areaToGroup(ctx, page, p, p.canvas, store, placements, groups);
  }
  return { ...page, placements, ...(groups.length ? { groups } : {}), ...(store ? { freeCanvas: store } : {}) };
}

/** §3.7's columns and rows for an imported profile: cells of about 100 px (at least the 2 columns a profile keeps). */
export const cellCount = (p: Pick<MonitorProfile, "width" | "height">): { cols: number; rows: number } => ({
  cols: Math.max(2, Math.round(p.width / 100)),
  rows: Math.max(1, Math.round(p.height / 100)),
});

/** A profile of pages that are each one canvas, on §3.7's columns and rows, each canvas spanning them. */
function cellsOf<P extends MonitorProfile>(p: P, pages: ProfilePage[]): P {
  const { cols, rows } = cellCount(p);
  return { ...p, cols, rows, pages: pages.map((pg) => ({ ...pg, placements: pg.placements.map((z) => ({ ...z, colStart: 1, rowStart: 1, colSpan: cols, rowSpan: rows })) })) };
}

/** §3.7: an imported profile's grid, about 100 px cells, no gap or padding; its canvases span it. Null when it already has it. */
function importedGrid(p: MonitorProfile): MonitorProfile | null {
  const { cols, rows } = cellCount(p);
  if (p.cols === cols && p.rows === rows && p.gap === 0 && p.padding === 0) return null;
  return { ...cellsOf(p, p.pages), gap: 0, padding: 0 };
}

/**
 * v15 for one profile. `legacy` (a config before v15) runs the conversions; a v15 config only loses a stale
 * `layout` flag. The same profile comes back when nothing changed.
 */
export function migrateProfileV15<P extends MonitorProfile>(p: P, opts: { legacy: boolean; log?: string[] }): P {
  const stale = p.pages.some((pg) => "layout" in pg);
  const unflagged = stale ? p.pages.map((pg) => (Object.hasOwn(pg, "layout") ? (({ layout: _l, ...rest }) => rest)(pg as ProfilePage & { layout?: unknown }) : pg)) : p.pages;
  if (!opts.legacy) return stale ? { ...p, pages: unflagged } : p;
  const log = (line: string) => opts.log?.push(line);
  const base = { ...p, pages: unflagged };
  const ctx: Ctx = {
    profile: base,
    grid: screenGrid(base),
    taken: new Set(p.pages.flatMap((pg) => pg.placements.map((z) => z.id))),
    log,
  };
  const pages = base.pages.map((pg) => {
    const next = migratePage(ctx, pg);
    // In the order the page model keeps: each group's members together, where its topmost member is.
    return next === pg ? pg : writePlacements(next, readPlacements(base, next));
  });
  let out: MonitorProfile = pages.every((pg, i) => pg === p.pages[i]) ? p : { ...base, pages };
  // An InfoPanel profile (imported or made with New InfoPanel profile): every page one loaded canvas it keeps.
  const imported = out.pages.length > 0 && out.pages.every((pg) => {
    const canvas = freeCanvasOf(out, pg)?.canvas;
    return canvas !== undefined && keepsCanvas(out, canvas);
  });
  if (imported) {
    if (out.madeFor === undefined) out = { ...out, madeFor: "infopanel" };
    if (out.fit !== "fill") ctx.log(`${out.name}: kept its grid, its page scrolls.`);
    else {
      const grid = importedGrid(out);
      if (grid) {
        ctx.log(`${out.name}: a grid of ${grid.cols} × ${grid.rows} cells; every item kept its place.`);
        out = grid;
      }
    }
  }
  return out as P;
}
