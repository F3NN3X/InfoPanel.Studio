/**
 * Grid ↔ Free (one-editor SPEC §6): a page's layout switched without losing anything. Pure; the studio commits the
 * page it returns as one undo step.
 *
 * Grid → Free (`toFree`) puts every zone on one canvas the screen's size, where the kiosk drew it: a widget, panel or
 * blank zone becomes a widget item (§3.3) at its cell box, a free area a Group holding its items (its canvas's own
 * settings kept on the Group, `$.area`). Placement order is the z-order, the first at the back.
 *
 * Free → Grid (`toGrid`) snaps each widget item, and each Group a free area became, to the nearest cells. What can't
 * be a zone of its own (an InfoPanel item or group, a widget that overlaps one placed before it, a locked or rotated
 * one) stays together in one free area over the cells they cover (decision D3), with the page canvas's profile, files
 * and fonts. The page keeps that canvas's settings (`ProfilePage.freeCanvas`), so the next switch to Free starts from
 * them. Positions and sizes keep the screen's pixels, through the same fit the kiosk draws a canvas with.
 */
import { CANVAS_ID, ITEM_ID, canvasTitle, uid, type DashboardConfig, type MonitorProfile, type Placement, type ProfilePage } from "./layout";
import { cellBox, gridArea, isFreePage, resizedCanvas, trackOf } from "./free-pages";
import { profileGap, profilePadding, type GridBox } from "./profile-grid";
import { fitScale } from "./infopanel/canvas";
import { assetKey } from "./infopanel/assets/assets";
import { decodeWidget, encodeItem, newStored, type AreaRecord, type StoredCanvas, type StoredItem, type WidgetItem } from "./infopanel/import/stored";
import { newWidgetItem } from "./infopanel/native/widget-item";
import { defaultItem, type DisplayItem } from "./infopanel/schema";
import { ON_INFOPANEL_KEY } from "./infopanel/export/native-choices";
import { joinAssets, joinFonts, moved, num, obj, renameFiles, roughBox, union, withoutItems } from "./page-model/stored-items";

/**
 * On the free area a switch to Grid made of loose parts: where its canvas sat on the page's canvas, so the switch
 * back puts the parts where they were (a JSON string `{ x, y, s, at }`).
 */
export const FROM_FREE_KEY = "$fromFree";

export interface LayoutSwitch {
  /** The page, switched. */
  page: ProfilePage;
  /** The toast's words. */
  message: string;
  /** Free → Grid: the parts that stayed together in one free area (0: none was made). */
  kept: number;
}

export type SwitchResult = LayoutSwitch | { refused: string };

/** Why a page with a canvas not loaded yet can't switch (SPEC §11). */
export const NOT_LOADED = "This page's content isn't loaded yet.";

type Raw = StoredItem;
type Rect = { x: number; y: number; w: number; h: number };
type Cells = Pick<Placement, "colStart" | "rowStart" | "colSpan" | "rowSpan">;
/** How a canvas sits in the grid's area: a canvas px `c` is drawn at `x + c * s`. */
interface Frame {
  s: number;
  x: number;
  y: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The fit the kiosk draws a `width`×`height` canvas with when it fills the screen's grid (CanvasZone, centred). */
function frameOf(profile: MonitorProfile, width: number, height: number): Frame {
  const area = gridArea(profile);
  const s = fitScale({ Width: width, Height: height }, area.width, area.height);
  return { s, x: (area.width - width * s) / 2, y: (area.height - height * s) / 2 };
}

/** A short fingerprint of a string (cyrb53), to tell whether parts are as a switch made them. */
function fingerprint(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/** Children relative to their group's corner, as text: the fingerprint's input. */
const relative = (items: readonly Raw[], x: number, y: number) => JSON.stringify(items.map((c) => moved(c, 1, -x, -y)));

/** Every file name the items use (an Image's FilePath, an element's `file`), lower case. */
function usedFiles(items: readonly Raw[]): Set<string> {
  const names = new Set<string>();
  JSON.stringify(items, (k, v) => {
    if (k === "FilePath" && typeof v === "string") names.add(assetKey(v));
    const o = obj(v);
    if (o && typeof o.file === "string" && typeof o.asset === "string") names.add(assetKey(o.file));
    return v;
  });
  return names;
}

/** A zone's cells from a box in the grid's area: the start and span rounded to the nearest cells (at least one), or out to the cells it touches. */
function snap(profile: MonitorProfile, box: GridBox, outward = false): Cells {
  const gap = profileGap(profile);
  const track = trackOf(profile);
  const axis = (start: number, size: number, pitch: number, count: number): [number, number] => {
    if (pitch <= 0) return [1, 1];
    const first = Math.min(count, Math.max(1, (outward ? Math.floor(start / pitch + 1e-6) : Math.round(start / pitch)) + 1));
    const span = outward ? Math.ceil((start + size) / pitch - 1e-6) - first + 1 : Math.round((size + gap) / pitch);
    return [first, Math.max(1, Math.min(count - first + 1, span))];
  };
  const [colStart, colSpan] = axis(box.left, box.width, track.width + gap, profile.cols);
  const [rowStart, rowSpan] = axis(box.top, box.height, track.height + gap, profile.rows);
  return { colStart, rowStart, colSpan, rowSpan };
}

const overlaps = (a: Cells, b: Cells) =>
  a.colStart < b.colStart + b.colSpan && b.colStart < a.colStart + a.colSpan && a.rowStart < b.rowStart + b.rowSpan && b.rowStart < a.rowStart + a.rowSpan;

/** A canvas box (page canvas px) in the grid's area. */
const toGridBox = (f: Frame, r: Rect): GridBox => ({ left: f.x + r.x * f.s, top: f.y + r.y * f.s, width: r.w * f.s, height: r.h * f.s });

/** A zone's widget record: what it hosts, without its cells. Its export rule moves from its settings onto the record. */
export function widgetOfZone(p: Placement): WidgetItem {
  const { [ON_INFOPANEL_KEY]: rule, ...settings } = p.settings ?? {};
  return {
    module: p.module,
    id: p.id,
    ...(Object.keys(settings).length ? { settings } : {}),
    ...(p.design ? { design: p.design } : {}),
    ...(p.follow ? { follow: p.follow } : {}),
    ...(p.panel ? { panel: p.panel as unknown as Record<string, unknown> } : {}),
    ...(rule === "recreate" || rule === "snapshot" || rule === "leave" ? { onInfoPanel: rule } : {}),
  };
}

/** A widget record back as a zone at `cells`. */
function zoneOfWidget(w: WidgetItem, cells: Cells, visible: boolean, id: string): Placement {
  const settings = { ...(w.settings ?? {}), ...(w.onInfoPanel ? { [ON_INFOPANEL_KEY]: w.onInfoPanel } : {}) };
  return {
    id,
    module: w.module,
    ...cells,
    visible,
    ...(Object.keys(settings).length ? { settings } : {}),
    ...(w.design ? { design: w.design } : {}),
    ...(w.follow ? { follow: w.follow as Placement["follow"] } : {}),
    ...(w.panel ? { panel: w.panel as unknown as Placement["panel"] } : {}),
  };
}

/** The `$fromFree` note on a free area a switch to Grid made: where its canvas's corner was on the page's canvas. */
function fromFreeOf(p: Placement): { x: number; y: number; s: number; at: string } | null {
  const raw = p.settings?.[FROM_FREE_KEY];
  if (typeof raw !== "string") return null;
  try {
    const o = obj(JSON.parse(raw));
    return o && typeof o.at === "string" ? { x: num(o.x), y: num(o.y), s: num(o.s), at: o.at } : null;
  } catch {
    return null;
  }
}
const cellsKey = (c: Cells) => `${c.colStart},${c.rowStart},${c.colSpan},${c.rowSpan}`;

/** A new Free page's canvas: the one the page had when it was last Free, else a new one, see-through so the screen's background shows as on the grid. */
function freeBase(profile: MonitorProfile, page: ProfilePage): StoredCanvas {
  if (page.freeCanvas) return resizedCanvas({ ...page.freeCanvas, items: [] } as StoredCanvas, profile.width, profile.height);
  const made = newStored({ name: page.name, width: profile.width, height: profile.height });
  return { ...made, profile: { ...made.profile, BackgroundColor: "#00000000" } };
}

/** Grid → Free (§6.2): every zone where the kiosk drew it, on one canvas the screen's size. `nameOf` names a widget item. */
export function toFree(profile: MonitorProfile, page: ProfilePage, nameOf: (zone: Placement) => string = (z) => z.module): SwitchResult {
  if (isFreePage(profile, page)) return { refused: "This page is Free already." };
  if (page.placements.some((p) => p.module === CANVAS_ID && !p.canvas)) return { refused: NOT_LOADED };
  const base = freeBase(profile, page);
  const f = frameOf(profile, profile.width, profile.height);
  const pad = profilePadding(profile, true);
  let assets = [...base.assets];
  let fonts = [...base.fonts];
  const notes: string[] = [];
  const items: Raw[] = [];
  for (const p of page.placements) {
    const box = cellBox(profile, p);
    const corner = { x: Math.round((box.left - f.x) / f.s), y: Math.round((box.top - f.y) / f.s) };
    if (p.module === ITEM_ID) {
      // An item placement (v15): the item itself, where it is on the screen (its px, or its cells' box); its files are the page's (`freeCanvas`).
      if (!p.item) continue;
      const at = p.px ?? { x: pad + box.left, y: pad + box.top };
      const item = moved({ ...p.item, X: at.x, Y: at.y }, 1 / f.s, -(pad + f.x) / f.s, -(pad + f.y) / f.s);
      items.push({ ...item, ...(p.visible ? {} : { Hidden: true }), ...(p.locked ? { IsLocked: true } : {}) });
      continue;
    }
    if (p.module !== CANVAS_ID || !p.canvas) {
      const host = newWidgetItem(widgetOfZone(p), { x: corner.x, y: corner.y, w: box.width / f.s, h: box.height / f.s }, nameOf(p));
      items.push(encodeItem((p.visible ? host : { ...host, Hidden: true }) as DisplayItem, () => null));
      continue;
    }
    // A free area: its items where the zone drew them (fitted and centred in its box), scaled when the fit differs.
    const area = p.canvas;
    const aw = num(area.profile.Width);
    const ah = num(area.profile.Height);
    const a = fitScale({ Width: aw, Height: ah }, box.width, box.height);
    const at = { x: (box.left + (box.width - aw * a) / 2 - f.x) / f.s, y: (box.top + (box.height - ah * a) / 2 - f.y) / f.s };
    const back = fromFreeOf(p);
    const same = back !== null && back.at === cellsKey(p) && Math.abs(back.s - f.s) < 1e-9;
    let k = Math.abs(a / f.s - 1) < 1e-6 ? 1 : a / f.s;
    let offset = k === 1 ? { x: Math.round(at.x), y: Math.round(at.y) } : at;
    if (same) {
      k = 1;
      offset = { x: back.x, y: back.y };
    }
    const joined = joinAssets(assets, area.assets);
    assets = joined.assets;
    fonts = joinFonts(fonts, area.fonts);
    const kids = renameFiles(area.items, joined.names).map((it) => moved(it, k, offset.x, offset.y));
    // The loose parts a switch to Grid put together go back as they were, unwrapped.
    if (back && p.visible) {
      items.push(...kids);
      continue;
    }
    if (k !== 1) notes.push(`${canvasTitle(p)} was resized to fit.`);
    const { canvas: _c, canvasRef: _r, ...zone } = p;
    const record: AreaRecord = {
      zone: zone as unknown as Record<string, unknown>,
      canvas: (k === 1 ? withoutItems(area) : area) as unknown as Record<string, unknown>,
      w: box.width / f.s,
      h: box.height / f.s,
      k,
      x: offset.x - corner.x,
      y: offset.y - corner.y,
      ...(k === 1 ? {} : { made: fingerprint(relative(kids, corner.x, corner.y)) }),
    };
    const group = encodeItem({ ...defaultItem("Group"), Name: canvasTitle(p) ?? "Free area", X: corner.x, Y: corner.y, Hidden: !p.visible, IsExpanded: false } as DisplayItem, () => null);
    items.push({ ...group, DisplayItems: kids, $: { area: record } });
  }
  const { freeCanvas: _kept, ...rest } = page;
  const canvas: StoredCanvas = { ...base, items, assets, fonts };
  const zone: Placement = { id: uid(CANVAS_ID), module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: profile.cols, rowSpan: profile.rows, visible: true, canvas };
  return { page: { ...rest, placements: [zone] }, message: ["Page is now Free. Every widget kept its place and size.", ...notes].join(" "), kept: 0 };
}

/** A top-level part of a Free page that can be a zone of its own: a widget item, or a Group a free area became. */
interface Block {
  index: number;
  cells: Cells;
  widget?: WidgetItem;
  area?: AreaRecord;
}

/** Free → Grid (§6.3): widgets snapped to cells, what can't be a zone of its own together in one free area. */
export function toGrid(profile: MonitorProfile, page: ProfilePage): SwitchResult {
  const [zone] = page.placements;
  if (!isFreePage(profile, page) || !zone) return { refused: "This page is a Grid page already." };
  if (!zone.canvas) return { refused: NOT_LOADED };
  const canvas = zone.canvas;
  const f = frameOf(profile, num(canvas.profile.Width), num(canvas.profile.Height));
  const fontScale = num(canvas.profile.FontScale) || 1;
  const items = canvas.items;

  // Each part that could be a zone, snapped; one that overlaps a part before it stays loose.
  const blocks: Block[] = [];
  const loose = new Set<number>();
  items.forEach((it, index) => {
    const $ = obj(it.$);
    const free = !it.IsLocked && !num(it.Rotation);
    const widget = it.kind === "Image" && $?.widget !== undefined ? decodeWidget($.widget) : null;
    const area = it.kind === "Group" && obj($?.area) ? ($!.area as AreaRecord) : null;
    if (!free || (!widget && !area)) return void loose.add(index);
    const box: Rect = widget ? roughBox(it, fontScale) : { x: num(it.X), y: num(it.Y), w: area!.w, h: area!.h };
    const cells = snap(profile, toGridBox(f, box));
    if (blocks.some((b) => overlaps(b.cells, cells))) return void loose.add(index);
    blocks.push({ index, cells, ...(widget ? { widget } : { area: area! }) });
  });
  // The free area covers the loose parts' cells; a zone under it joins them, until nothing more does.
  let areaCells: Cells | null = null;
  for (;;) {
    if (loose.size === 0) break;
    const box = union([...loose].map((i) => roughBox(items[i], fontScale)));
    areaCells = snap(profile, toGridBox(f, box), true);
    const under = blocks.filter((b) => !loose.has(b.index) && overlaps(b.cells, areaCells!));
    if (under.length === 0) break;
    for (const b of under) loose.add(b.index);
  }
  const placed = blocks.filter((b) => !loose.has(b.index));

  // Ids stay unique on the screen: a duplicated widget's copy gets a new one.
  const taken = new Set(profile.pages.filter((pg) => pg.id !== page.id).flatMap((pg) => pg.placements.map((p) => p.id)));
  const idFor = (want: unknown, prefix: string) => {
    const id = typeof want === "string" && want && !taken.has(want) ? want : uid(prefix);
    taken.add(id);
    return id;
  };

  const zoneOf = (b: Block): Placement => {
    const it = items[b.index];
    if (b.widget) return zoneOfWidget(b.widget, b.cells, !it.Hidden, idFor(b.widget.id, b.widget.module));
    const rec = b.area!;
    const kids = Array.isArray(it.DisplayItems) ? (it.DisplayItems as Raw[]) : [];
    const corner = { x: num(it.X), y: num(it.Y) };
    const kept = rec.canvas as unknown as StoredCanvas;
    const untouched = rec.made !== undefined && Array.isArray(kept.items) && rec.made === fingerprint(relative(kids, corner.x, corner.y));
    let restored: StoredCanvas;
    if (untouched) restored = kept;
    else {
      // Edited while Free (or never scaled): the items as they are now, back on the area's own canvas.
      const back = kids.map((c) => moved(c, 1 / rec.k, -(corner.x + rec.x) / rec.k, -(corner.y + rec.y) / rec.k));
      const names = usedFiles(back);
      const own = kept.assets ?? [];
      const extra = canvas.assets.filter((a) => names.has(assetKey(a.name)) && !own.some((o) => assetKey(o.name) === assetKey(a.name)));
      restored = { ...kept, items: back, assets: [...own, ...extra], fonts: joinFonts(kept.fonts ?? [], canvas.fonts) };
    }
    const { canvas: _c, canvasRef: _r, ...stored } = rec.zone as unknown as Placement;
    return { ...stored, id: idFor(stored.id, CANVAS_ID), module: CANVAS_ID, ...b.cells, visible: !it.Hidden, canvas: restored };
  };

  // The free area: the page canvas's settings, sized to its cells, the loose parts moved onto it.
  const areaZone = (cells: Cells): Placement => {
    const box = cellBox(profile, cells);
    const corner = { x: Math.round((box.left - f.x) / f.s), y: Math.round((box.top - f.y) / f.s) };
    const parts = items.filter((_, i) => loose.has(i)).map((it) => moved(it, 1, -corner.x, -corner.y));
    const { screenshot: _shot, ...rest } = canvas;
    const own = resizedCanvas({ ...rest, items: parts }, box.width / f.s, box.height / f.s);
    const note = JSON.stringify({ x: corner.x, y: corner.y, s: f.s, at: cellsKey(cells) });
    return { id: uid(CANVAS_ID), module: CANVAS_ID, ...cells, visible: true, settings: { [FROM_FREE_KEY]: note }, canvas: own };
  };

  // In z-order: each zone where its part was, the free area where its first part was.
  const first = loose.size ? Math.min(...loose) : -1;
  const placements: Placement[] = [];
  items.forEach((_, i) => {
    if (i === first && areaCells) placements.push(areaZone(areaCells));
    const b = placed.find((x) => x.index === i);
    if (b) placements.push(zoneOf(b));
  });

  const rest = page;
  const snapped = placed.filter((b) => b.widget).length;
  const kept = loose.size;
  const message = `Page is now Grid. ${plural(snapped, "widget")} snapped to cells.${kept ? ` ${plural(kept, "part")} stayed together in a free area.` : ""}`;
  return { page: { ...rest, placements, freeCanvas: withoutItems(canvas) }, message, kept };
}

/** A screen's page switched to `layout`, as one change of the config; the refusal when it can't switch. */
export function switchLayout(
  config: DashboardConfig,
  profileId: string,
  pageId: string,
  layout: "grid" | "free",
  nameOf?: (zone: Placement) => string,
): { config: DashboardConfig; result: LayoutSwitch } | { refused: string } {
  const profile = config.profiles.find((p) => p.id === profileId);
  const page = profile?.pages.find((pg) => pg.id === pageId);
  if (!profile || !page) return { refused: "That page is gone." };
  const result = layout === "free" ? toFree(profile, page, nameOf) : toGrid(profile, page);
  if ("refused" in result) return result;
  const next = { ...profile, pages: profile.pages.map((pg) => (pg.id === pageId ? result.page : pg)) };
  return { config: { ...config, profiles: config.profiles.map((p) => (p.id === profileId ? next : p)) }, result };
}

/** A new, empty free area on `cells` (SPEC §5.3, an InfoPanel item dropped on a grid cell): its canvas the cells' size. */
export function freeArea(profile: MonitorProfile | Omit<MonitorProfile, "pages">, cells: Cells, name = "Free area"): Placement {
  const box = cellBox(profile, cells);
  return { id: uid(CANVAS_ID), module: CANVAS_ID, ...cells, visible: true, canvas: newStored({ name, width: box.width, height: box.height }) };
}

/** A new Free page for the screen (a page added from a Free one copies its layout, SPEC §9): an empty canvas its size, in the page's look. */
export function newFreePage(profile: MonitorProfile, from: ProfilePage | undefined, name: string): ProfilePage {
  const made = newStored({ name, width: profile.width, height: profile.height });
  const look = from?.placements[0]?.canvas?.profile;
  const canvas = look ? { ...made, profile: { ...made.profile, BackgroundColor: look.BackgroundColor, Font: look.Font, FontSize: look.FontSize, Color: look.Color } } : made;
  return {
    id: uid("page"),
    name,
    placements: [{ id: uid(CANVAS_ID), module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: profile.cols, rowSpan: profile.rows, visible: true, canvas }],
  };
}

/**
 * Scale contents (the plan's resize choice): every Free page's items scaled by how much the screen grew or shrank
 * from `from`, keeping their proportions; the same profile when there is nothing to scale.
 */
export function scaleFreePages(profile: MonitorProfile, from: { width: number; height: number }): MonitorProfile {
  const k = Math.min(profile.width / Math.max(1, from.width), profile.height / Math.max(1, from.height));
  if (!Number.isFinite(k) || k <= 0 || Math.abs(k - 1) < 1e-6) return profile;
  let changed = false;
  const pages = profile.pages.map((page) => {
    const [zone] = page.placements;
    if (!isFreePage(profile, page) || !zone?.canvas) return page;
    changed = true;
    const canvas = { ...zone.canvas, items: zone.canvas.items.map((it) => moved(it, k, 0, 0)) };
    return { ...page, placements: [{ ...zone, canvas }] };
  });
  return changed ? { ...profile, pages } : profile;
}
