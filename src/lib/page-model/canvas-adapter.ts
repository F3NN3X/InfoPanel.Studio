/**
 * An imported profile's page (one canvas filling the screen) as the page model (Edit v3 SPEC §3.4, §3.6): the
 * canvas's item order is the z-order (the first at the back), a Group item is a group, a Studio widget an Image with
 * `$.widget` on its cells (`$.widget.cell`), and an item either placed freely at its X / Y (every imported item is) or
 * on cells (`$.cell`). Coordinates are the canvas's px. An item nothing changed is written back as the same object,
 * so an untouched profile exports the same bytes.
 */
import { ITEM_ID, type MonitorProfile, type Placement, type ProfilePage } from "../layout.ts";
import { profileGap } from "../profile-grid.ts";
import { freeCanvasOf } from "../screens/list.ts";
import { encodeItem, type CellBox, type StoredCanvas, type StoredItem, type WidgetItem } from "../infopanel/import/stored.ts";
import { newWidgetItem } from "../infopanel/native/widget-item.ts";
import { defaultItem, type DisplayItem } from "../infopanel/schema.ts";
import { widgetOfZone } from "../page-layout.ts";
import { applyOps, cellRect, nearestCells, samePlace, type LayerNode, type PageGrid, type PageModel, type PageOp, type PartNode, type PartPlace } from "./model.ts";
import { atBox, num, obj, roughBox } from "./stored-items.ts";

/** The canvas's grid: its own size, the screen's columns, rows and gap, no padding. */
export function canvasGrid(profile: Pick<MonitorProfile, "cols" | "rows" | "gap" | "fit" | "padding">, canvas: StoredCanvas): PageGrid {
  return { cols: profile.cols, rows: profile.rows, gap: profileGap(profile), padding: 0, width: Math.max(1, num(canvas.profile.Width)), height: Math.max(1, num(canvas.profile.Height)) };
}

const isGroup = (item: StoredItem) => item.kind === "Group" && !obj(item.$)?.element;
const widgetRecord = (item: StoredItem): WidgetItem | null => (item.kind === "Image" ? ((obj(item.$)?.widget as WidgetItem | undefined) ?? null) : null);
const cellOf = (item: StoredItem): CellBox | null => (obj(item.$)?.cell as CellBox | undefined) ?? null;
const nameOf = (item: StoredItem, fallback: string) => (typeof item.Name === "string" && item.Name ? item.Name : fallback);

/** Where an item sits as stored: a widget on its cells (or the cells nearest its box), an item on its `$.cell` or at its box. */
function storedPlace(grid: PageGrid, item: StoredItem, fontScale: number): PartPlace {
  const widget = widgetRecord(item);
  const box = roughBox(item, fontScale);
  if (widget) return { cell: widget.cell ?? nearestCells(grid, box) };
  const cell = cellOf(item);
  return cell ? { cell } : { px: box };
}

function nodeOf(grid: PageGrid, item: StoredItem, path: string, fontScale: number): LayerNode {
  const flags = { ...(item.IsLocked === true ? { locked: true } : {}), ...(item.Hidden === true ? { hidden: true } : {}) };
  if (isGroup(item)) {
    const kids = Array.isArray(item.DisplayItems) ? (item.DisplayItems as StoredItem[]) : [];
    const children = kids.map((c, i) => nodeOf(grid, c, `${path}.${i}`, fontScale)).reverse();
    return { type: "group", id: path, name: nameOf(item, "Group"), ...flags, children, ref: { backing: "item", item } };
  }
  const widget = widgetRecord(item);
  const kind = widget ? "widget" : obj(item.$)?.element ? "element" : "item";
  return { type: "part", id: path, kind, name: nameOf(item, widget?.module ?? item.kind), place: storedPlace(grid, item, fontScale), ...flags, ref: { backing: "item", item } };
}

/** The page as a model, or null when it isn't one canvas filling the screen or its canvas isn't loaded. */
export function readCanvas(profile: MonitorProfile, page: ProfilePage): PageModel | null {
  const canvas = freeCanvasOf(profile, page)?.canvas;
  if (!canvas) return null;
  const grid = canvasGrid(profile, canvas);
  const fontScale = num(canvas.profile.FontScale) || 1;
  const root = canvas.items.map((it, i) => nodeOf(grid, it, String(i), fontScale)).reverse();
  return { pageId: page.id, grid, snapItems: page.snapItems !== false, root };
}

/** An item at a place: X / Y at its box, its size too where it has one, `$.cell` set or cleared; a widget's cells on its record. */
function placed(grid: PageGrid, item: StoredItem, place: PartPlace): StoredItem {
  const widget = widgetRecord(item);
  const cell = "cell" in place ? place.cell : widget ? nearestCells(grid, place.px) : null;
  const box = cell ? cellRect(grid, cell) : (place as { px: { x: number; y: number; w: number; h: number } }).px;
  // A group (a studio element too) moves with its children, which InfoPanel keeps on the canvas.
  const out: StoredItem = { ...atBox(item, box) };
  const { cell: _cell, ...$rest } = (item.$ ?? {}) as Record<string, unknown>;
  const $ = widget ? { ...$rest, widget: { ...widget, cell: cell! } } : cell ? { ...$rest, cell } : $rest;
  if (Object.keys($).length) out.$ = $ as StoredItem["$"];
  else delete out.$;
  return out;
}

/** An item's name, lock and hide set as the node has them. */
function flagged(item: StoredItem, node: LayerNode, fallback: string): StoredItem {
  const renamed = node.name !== nameOf(item, fallback);
  if (!renamed && Boolean(item.IsLocked) === Boolean(node.locked) && Boolean(item.Hidden) === Boolean(node.hidden)) return item;
  return { ...item, ...(renamed ? { Name: node.name } : {}), IsLocked: Boolean(node.locked), Hidden: Boolean(node.hidden) };
}

/** A part a widget placement brought (an add from a screen page): a widget item on its cells. */
function widgetItemOf(grid: PageGrid, part: PartNode, p: Placement): StoredItem {
  const cell = "cell" in part.place ? part.place.cell : nearestCells(grid, part.place.px);
  const host = newWidgetItem({ ...widgetOfZone(p), cell }, cellRect(grid, cell), part.name);
  return encodeItem(host as DisplayItem, () => null);
}

function itemOfNode(grid: PageGrid, node: LayerNode, fontScale: number): StoredItem {
  if (node.type === "group") {
    const base = node.ref?.backing === "item" ? node.ref.item : encodeItem(defaultItem("Group") as DisplayItem, () => null);
    const kids = [...node.children].reverse().map((c) => itemOfNode(grid, c, fontScale));
    const before = Array.isArray(base.DisplayItems) ? (base.DisplayItems as StoredItem[]) : [];
    const sameKids = kids.length === before.length && kids.every((k, i) => k === before[i]);
    const withKids = sameKids ? base : { ...base, DisplayItems: kids };
    return flagged(withKids, node, "Group");
  }
  const ref = node.ref;
  if (ref.backing === "placement") {
    const p = ref.placement;
    if (p.module !== ITEM_ID) return flagged(widgetItemOf(grid, node, p), node, node.name);
    if (!p.item) return encodeItem(defaultItem("Text") as DisplayItem, () => null);
    return flagged(placed(grid, p.item, node.place), node, p.item.kind);
  }
  const item = ref.item;
  const was = storedPlace(grid, item, fontScale);
  const at = samePlace(was, node.place) ? item : placed(grid, item, node.place);
  return flagged(at, node, nameOf(item, widgetRecord(item)?.module ?? item.kind));
}

/** The model written back into the page's canvas; the same page when nothing changed. */
export function writeCanvas(profile: MonitorProfile, page: ProfilePage, model: PageModel): ProfilePage {
  const zone = freeCanvasOf(profile, page);
  const canvas = zone?.canvas;
  if (!zone || !canvas) return page;
  const fontScale = num(canvas.profile.FontScale) || 1;
  const items = [...model.root].reverse().map((n) => itemOfNode(model.grid, n, fontScale));
  const sameItems = items.length === canvas.items.length && items.every((it, i) => it === canvas.items[i]);
  const snapSame = (page.snapItems !== false) === model.snapItems;
  if (sameItems && snapSame) return page;
  const { snapItems: _s, ...rest } = page;
  const placements = sameItems ? page.placements : page.placements.map((z) => (z === zone ? { ...z, canvas: { ...canvas, items } } : z));
  return { ...rest, placements, ...(model.snapItems ? {} : { snapItems: false }) };
}

/** The page after `ops`, through the model; the same page when they change nothing (or the canvas isn't loaded). */
export function applyCanvas(profile: MonitorProfile, page: ProfilePage, ops: readonly PageOp[]): ProfilePage {
  const model = readCanvas(profile, page);
  if (!model) return page;
  const next = applyOps(model, ops);
  return next === model ? page : writeCanvas(profile, page, next);
}
