/**
 * Group management on an InfoPanel item tree: group the selection, ungroup, and move items into,
 * out of and between groups. Pure and immutable, addressed by scene paths like `ops.ts`.
 *
 * Positions stay absolute: InfoPanel does not offset a group's children (a child's X/Y is on the
 * canvas, see `ops.ts`), so none of these touches X/Y and every item keeps its place on the canvas.
 * Draw order is list order, a group's children drawn in the group's place and in their own order, so
 * the Layers rows read top to bottom in that order (the first row is drawn first, at the back).
 *
 * A Cores element is a group of bars the element lays out itself: its bars can't be moved in or
 * out, but the group can move into another group as a whole.
 */
import { elementOf } from "../elements/spec.ts";
import type { DisplayItem, GroupItem } from "../schema.ts";
import { itemAt, topmost, updateList, type Path } from "./ops.ts";

const split = (p: Path) => p.split(".").map(Number);
const parentOf = (p: Path) => p.split(".").slice(0, -1).join(".");
const child = (parent: Path, i: number) => (parent === "" ? String(i) : `${parent}.${i}`);

/** Tree order (a group before its children, siblings by index). */
const byTree = (a: Path, b: Path) => {
  const x = split(a);
  const y = split(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
};

/** Whether the item is a group the element lays out itself (Cores). */
export const isManaged = (item: DisplayItem | undefined): boolean => item?.kind === "Group" && elementOf(item)?.type === "cores";

const MANAGED = "Cores places its own bars, so they can’t be moved in or out.";
const LOCKED = "That group is locked.";

/** The reason `path` can't leave or join its parent, or null: a Cores bar, or a locked group's item. */
function heldBy(items: readonly DisplayItem[], path: Path): string | null {
  const parent = itemAt(items, parentOf(path));
  if (parentOf(path) === "") return null;
  return isManaged(parent) ? MANAGED : parent?.IsLocked ? LOCKED : null;
}

export type Moved = { ok: true; items: DisplayItem[]; paths: Path[] } | { ok: false; reason: string };

/**
 * Why `paths` can't move into the group at `parent` ("" is the top level), or null: a drop into
 * the selection itself or what it holds, into Cores or a locked group, or out of one.
 */
export function moveBlock(items: readonly DisplayItem[], paths: readonly Path[], parent: Path): string | null {
  const sel = topmost(paths);
  if (sel.length === 0) return "Nothing selected.";
  if (sel.some((p) => parent === p || parent.startsWith(p + "."))) return "A group can’t go into itself.";
  for (const p of sel) {
    const why = heldBy(items, p);
    if (why) return why;
  }
  if (parent === "") return null;
  const target = itemAt(items, parent);
  if (target?.kind !== "Group") return "Items can only go into a group.";
  return isManaged(target) ? MANAGED : target.IsLocked ? LOCKED : null;
}

/**
 * Moves the selected items into the list at `parent`, ahead of the item now at `index` there
 * (`index` counts the parent's children before the move; past the end appends). The items keep their
 * own order (tree order), whatever level they came from. Returns their new paths.
 */
export function moveItems(items: readonly DisplayItem[], paths: readonly Path[], parent: Path, index: number): Moved {
  const reason = moveBlock(items, paths, parent);
  if (reason) return { ok: false, reason };
  const sel = topmost(paths).sort(byTree);
  const block = sel.map((p) => itemAt(items, p)!);
  const out: Path[] = [];
  const rebuild = (list: readonly DisplayItem[], orig: Path, into: Path): DisplayItem[] => {
    const next: DisplayItem[] = [];
    const emit = () => {
      block.forEach((_, k) => out.push(child(into, next.length + k)));
      next.push(...block);
    };
    list.forEach((item, i) => {
      const path = child(orig, i);
      if (orig === parent && i === index) emit();
      if (sel.includes(path)) return;
      const touched = sel.some((s) => s.startsWith(path + ".")) || parent === path || parent.startsWith(path + ".");
      next.push(item.kind === "Group" && touched ? { ...item, DisplayItems: rebuild(item.DisplayItems, path, child(into, next.length)) } : item);
    });
    if (orig === parent && index >= list.length) emit();
    return next;
  };
  return { ok: true, items: rebuild(items, "", ""), paths: out };
}

/**
 * Wraps the selected items in a new group, at the place of the first of them in tree order, which
 * is also where the group's X/Y come from. Items from different parents all move into it, in tree
 * order. Returns the group's path, or why not (Cores bars, a locked group's items, nothing selected).
 */
export function groupItems(items: readonly DisplayItem[], paths: readonly Path[], name = "Group"): { ok: true; items: DisplayItem[]; path: Path } | { ok: false; reason: string } {
  const sel = topmost(paths).sort(byTree);
  if (sel.length === 0) return { ok: false, reason: "Nothing selected." };
  for (const p of sel) {
    const why = heldBy(items, p);
    if (why) return { ok: false, reason: why };
  }
  const first = itemAt(items, sel[0])!;
  const g: GroupItem = {
    kind: "Group", Name: name, Hidden: false, X: first.X, Y: first.Y, IsLocked: false, Rotation: 0,
    IsExpanded: true, DisplayItems: [], unknown: {},
  };
  // The group takes the first item's place; nothing before it in tree order moves, so its path holds.
  const at = sel[0];
  const placeholder = { ...g, DisplayItems: sel.map((p) => itemAt(items, p)!) };
  const rebuild = (list: readonly DisplayItem[], orig: Path): DisplayItem[] =>
    list.flatMap((item, i) => {
      const path = child(orig, i);
      if (path === at) return [placeholder];
      if (sel.includes(path)) return [];
      return [item.kind === "Group" && sel.some((s) => s.startsWith(path + ".")) ? { ...item, DisplayItems: rebuild(item.DisplayItems, path) } : item];
    });
  return { ok: true, items: rebuild(items, ""), path: at };
}

/**
 * Replaces a group with its children, in place, each keeping its position on the canvas; a hidden
 * or locked group leaves its children hidden or locked (as InfoPanel applies the flags to them).
 * Returns their paths, or null for a non-group or a Cores group (its bars belong to the element).
 */
export function ungroupAt(items: readonly DisplayItem[], path: Path): { items: DisplayItem[]; paths: Path[] } | null {
  const g = itemAt(items, path);
  if (g?.kind !== "Group" || isManaged(g)) return null;
  const parent = parentOf(path);
  const i = split(path).at(-1)!;
  const kids = g.DisplayItems.map((c) => (g.Hidden || g.IsLocked ? ({ ...c, Hidden: c.Hidden || g.Hidden, IsLocked: c.IsLocked || g.IsLocked } as DisplayItem) : c));
  const kidsAt = (list: DisplayItem[]) => [...list.slice(0, i), ...kids, ...list.slice(i + 1)];
  return { items: updateList(items, parent, kidsAt), paths: kids.map((_, k) => child(parent, i + k)) };
}
