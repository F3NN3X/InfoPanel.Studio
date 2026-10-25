/**
 * Edits on an InfoPanel item tree, addressed by scene paths ("2.0" = first child
 * of the third item). All immutable: each returns a new tree and shares the rest.
 *
 * InfoPanel groups do not offset their children: a child's X/Y is on the canvas,
 * so moving a group moves every item in it.
 */
import type { DisplayItem } from "../schema.ts";

export type Path = string;
const split = (p: Path) => p.split(".").map(Number);
const join = (ix: number[]) => ix.join(".");

export function itemAt(items: readonly DisplayItem[], path: Path): DisplayItem | undefined {
  let list: readonly DisplayItem[] = items;
  let found: DisplayItem | undefined;
  for (const i of split(path)) {
    found = list[i];
    if (!found) return undefined;
    list = found.kind === "Group" ? found.DisplayItems : [];
  }
  return found;
}

/** Replaces the item at `path` with `fn(item)`. */
export function updateAt(items: readonly DisplayItem[], path: Path, fn: (item: DisplayItem) => DisplayItem): DisplayItem[] {
  const [head, ...rest] = split(path);
  return items.map((item, i) => {
    if (i !== head) return item;
    if (rest.length === 0) return fn(item);
    if (item.kind !== "Group") return item;
    return { ...item, DisplayItems: updateAt(item.DisplayItems, join(rest), fn) };
  });
}

/** The children list at `parent` ("" for the top level), replaced by `fn(list)`. */
export function updateList(items: readonly DisplayItem[], parent: Path, fn: (list: DisplayItem[]) => DisplayItem[]): DisplayItem[] {
  if (parent === "") return fn([...items]);
  return updateAt(items, parent, (g) => (g.kind === "Group" ? { ...g, DisplayItems: fn([...g.DisplayItems]) } : g));
}

const parentOf = (p: Path) => p.split(".").slice(0, -1).join(".");
const indexOf = (p: Path) => split(p).at(-1)!;
const child = (parent: Path, i: number) => (parent === "" ? String(i) : `${parent}.${i}`);

/** Drops paths inside another selected path (a selected group already carries its children). */
export function topmost(paths: readonly Path[]): Path[] {
  const set = [...new Set(paths)];
  return set.filter((p) => !set.some((q) => q !== p && p.startsWith(q + ".")));
}

/** Moves an item, and a group's whole subtree, by whole pixels. */
function shift(item: DisplayItem, dx: number, dy: number): DisplayItem {
  const moved = { ...item, X: item.X + dx, Y: item.Y + dy } as DisplayItem;
  return moved.kind === "Group" ? { ...moved, DisplayItems: moved.DisplayItems.map((c) => shift(c, dx, dy)) } : moved;
}

export function moveBy(items: readonly DisplayItem[], paths: readonly Path[], dx: number, dy: number): DisplayItem[] {
  if (dx === 0 && dy === 0) return [...items];
  return topmost(paths).reduce<DisplayItem[]>((tree, p) => updateAt(tree, p, (it) => shift(it, Math.round(dx), Math.round(dy))), [...items]);
}

/** Sets one field (no checks: the inspector validates with the schema first). */
export const setField = (items: readonly DisplayItem[], path: Path, field: string, value: unknown) =>
  updateAt(items, path, (it) => ({ ...it, [field]: value }) as DisplayItem);

export function removeAll(items: readonly DisplayItem[], paths: readonly Path[]): DisplayItem[] {
  // Deepest and last first, so earlier removals do not shift the later paths.
  const order = topmost(paths).sort((a, b) => (split(b).length - split(a).length) || indexOf(b) - indexOf(a) || b.localeCompare(a));
  return order.reduce<DisplayItem[]>((tree, p) => updateList(tree, parentOf(p), (list) => list.filter((_, i) => i !== indexOf(p))), [...items]);
}

/** Moves an item one place earlier (drawn below) or later (drawn above) among its siblings; returns its new path. */
export function reorder(items: readonly DisplayItem[], path: Path, step: -1 | 1): { items: DisplayItem[]; path: Path } {
  const parent = parentOf(path);
  const i = indexOf(path);
  const j = i + step;
  let ok = false;
  const tree = updateList(items, parent, (list) => {
    if (j < 0 || j >= list.length) return list;
    ok = true;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  return { items: tree, path: ok ? child(parent, j) : path };
}

/** Copies items (offset by 10 px) right after the last of them; returns the copies' paths. */
export function duplicate(items: readonly DisplayItem[], paths: readonly Path[]): { items: DisplayItem[]; paths: Path[] } {
  let tree = [...items];
  let out: Path[] = [];
  // Last first, so an insertion never moves an item still to be copied.
  for (const p of topmost(paths).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) {
    const copy = shift(structuredClone(itemAt(tree, p)!), 10, 10);
    const parent = parentOf(p);
    const i = indexOf(p) + 1;
    tree = updateList(tree, parent, (list) => [...list.slice(0, i), copy, ...list.slice(i)]);
    // Copies already placed after this one in the same list (or inside its later siblings) move down one.
    const prefix = parent === "" ? "" : parent + ".";
    out = out.map((q) => {
      if (!q.startsWith(prefix)) return q;
      const [k, ...rest] = q.slice(prefix.length).split(".");
      return Number(k) >= i ? [prefix + (Number(k) + 1), ...rest].join(".") : q;
    });
    out.push(child(parent, i));
  }
  return { items: tree, paths: out };
}

/** The box InfoPanel sizes an item by, before Scale (images, gauges) — what a resize writes back. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Writes a resized box back to the item's own fields. Images and gauges store their size
 * before Scale; text gets a Width (which turns on wrapping and alignment), and a Height only
 * if it had one. Returns the item unchanged for kinds without a size (groups).
 */
export function withBox(item: DisplayItem, box: Box): DisplayItem {
  const x = Math.round(box.x);
  const y = Math.round(box.y);
  const w = Math.max(1, Math.round(box.width));
  const h = Math.max(1, Math.round(box.height));
  switch (item.kind) {
    case "Group":
      return item;
    case "Image":
    case "HttpImage":
    case "SensorImage":
    case "Gauge": {
      const k = item.Scale > 0 ? 100 / item.Scale : 1;
      return { ...item, X: x, Y: y, Width: Math.round(w * k), Height: Math.round(h * k) };
    }
    case "Text":
    case "Clock":
    case "Calendar":
    case "Sensor":
    case "TableSensor":
      return { ...item, X: x, Y: y, Width: w, Height: item.Height > 0 ? h : 0 };
    default:
      return { ...item, X: x, Y: y, Width: w, Height: h };
  }
}

export const setBox = (items: readonly DisplayItem[], path: Path, box: Box) => updateAt(items, path, (it) => withBox(it, box));
