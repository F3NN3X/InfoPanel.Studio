/**
 * The editor's one model of a page (Edit v3 SPEC §3.4): every page, whichever store backs it, is a tree of parts
 * (widgets, InfoPanel items, studio elements) and groups, top first, each part on the grid's cells or placed freely
 * in px. Two adapters read a page into it and write it back (`placements-adapter.ts` for a screen's page,
 * `canvas-adapter.ts` for an imported profile's canvas); the ops here change the model and never touch storage, so
 * the editor never branches on backing. Pure.
 */
import type { CellBox } from "../infopanel/import/stored.ts";
import type { PageGroup, Placement, PixelBox } from "../layout.ts";
import type { StoredItem } from "../infopanel/import/stored.ts";

export type { CellBox, PixelBox };

/** A part's place: on the grid's cells, or placed freely to the pixel. Widgets always have `cell`. */
export type PartPlace = { cell: CellBox } | { px: PixelBox };

/** The page's grid in the model's coordinates: the whole page (padding included), its cells inside the padding. */
export interface PageGrid {
  cols: number;
  rows: number;
  gap: number;
  padding: number;
  width: number;
  height: number;
}

export type PartKind = "widget" | "item" | "element";

/**
 * Where a node lives in its store, as it was read: a screen's placement or page group, or a canvas item. A part an
 * `add` op brings carries the new record in either form; the adapter writes it in its own.
 */
export type PartRef = { backing: "placement"; placement: Placement } | { backing: "item"; item: StoredItem };
export type GroupRef = { backing: "group"; group: PageGroup } | { backing: "item"; item: StoredItem };

export interface GroupNode {
  type: "group";
  id: string;
  name: string;
  locked?: boolean;
  hidden?: boolean;
  /** Top first. */
  children: LayerNode[];
  /** Unset for a group an op made. */
  ref?: GroupRef;
}

export interface PartNode {
  type: "part";
  id: string;
  kind: PartKind;
  name: string;
  place: PartPlace;
  locked?: boolean;
  hidden?: boolean;
  ref: PartRef;
}

export type LayerNode = GroupNode | PartNode;

export interface PageModel {
  pageId: string;
  grid: PageGrid;
  /** Items and elements snap to cells while dragging (unset on the page = true). */
  snapItems: boolean;
  /** Top first. */
  root: LayerNode[];
}

/** A move to cells (keeps the span) or to a pixel corner (keeps the size). */
export type MoveTo = { col: number; row: number } | { x: number; y: number };
/** A new size in cells or in px. */
export type SizeTo = { cols: number; rows: number } | { w: number; h: number };

/** One change to the model. Ids are the nodes' as read; `index` counts top first. */
export type PageOp =
  | { type: "move"; id: string; to: MoveTo }
  | { type: "resize"; id: string; to: SizeTo }
  | { type: "reorder"; id: string; parentId: string | null; index: number }
  | { type: "group"; ids: readonly string[]; id: string; name: string }
  | { type: "ungroup"; id: string }
  | { type: "moveToGroup"; ids: readonly string[]; groupId: string | null }
  | { type: "setLocked"; id: string; locked: boolean }
  | { type: "setHidden"; id: string; hidden: boolean }
  | { type: "rename"; id: string; name: string }
  | { type: "add"; part: PartNode; parentId?: string | null }
  | { type: "remove"; id: string }
  | { type: "snapToGrid"; id: string }
  | { type: "setSnapItems"; snapItems: boolean };

/* ---- geometry ---- */

/** One cell's width and height. */
export function trackOf(grid: PageGrid): { w: number; h: number } {
  const w = (grid.width - 2 * grid.padding - (grid.cols - 1) * grid.gap) / Math.max(1, grid.cols);
  const h = (grid.height - 2 * grid.padding - (grid.rows - 1) * grid.gap) / Math.max(1, grid.rows);
  return { w: Math.max(0, w), h: Math.max(0, h) };
}

/** A cell box in px. */
export function cellRect(grid: PageGrid, cell: CellBox): PixelBox {
  const t = trackOf(grid);
  return {
    x: grid.padding + (cell.col - 1) * (t.w + grid.gap),
    y: grid.padding + (cell.row - 1) * (t.h + grid.gap),
    w: cell.cols * t.w + (cell.cols - 1) * grid.gap,
    h: cell.rows * t.h + (cell.rows - 1) * grid.gap,
  };
}

/**
 * The cells nearest a px box: its start and span rounded to whole cells (at least one), inside the grid. `outward`
 * takes every cell the box touches instead (what a placed-freely part covers).
 */
export function nearestCells(grid: PageGrid, box: PixelBox, outward = false): CellBox {
  const t = trackOf(grid);
  const axis = (start: number, size: number, pitch: number, count: number): [number, number] => {
    if (pitch <= 0) return [1, 1];
    const at = start - grid.padding;
    const first = Math.min(count, Math.max(1, (outward ? Math.floor(at / pitch + 1e-6) : Math.round(at / pitch)) + 1));
    const span = outward ? Math.ceil((at + size) / pitch - 1e-6) - first + 1 : Math.round((size + grid.gap) / pitch);
    return [first, Math.max(1, Math.min(count - first + 1, span))];
  };
  const [col, cols] = axis(box.x, box.w, t.w + grid.gap, grid.cols);
  const [row, rows] = axis(box.y, box.h, t.h + grid.gap, grid.rows);
  return { col, row, cols, rows };
}

/** A part's box in px, wherever it sits. */
export const boxOf = (grid: PageGrid, place: PartPlace): PixelBox => ("cell" in place ? cellRect(grid, place.cell) : place.px);

const sameCell = (a: CellBox, b: CellBox) => a.col === b.col && a.row === b.row && a.cols === b.cols && a.rows === b.rows;
const samePx = (a: PixelBox, b: PixelBox) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
/** Whether two places are the same. */
export const samePlace = (a: PartPlace, b: PartPlace): boolean =>
  "cell" in a ? "cell" in b && sameCell(a.cell, b.cell) : "px" in b && samePx(a.px, b.px);

/** Whether two cell boxes share a cell. */
export const cellsOverlap = (a: CellBox, b: CellBox): boolean =>
  a.col < b.col + b.cols && b.col < a.col + a.cols && a.row < b.row + b.rows && b.row < a.row + a.rows;

/* ---- the tree ---- */

/** Every node, depth first, top first. */
export function walk(nodes: readonly LayerNode[], visit: (node: LayerNode, parent: GroupNode | null) => void, parent: GroupNode | null = null): void {
  for (const n of nodes) {
    visit(n, parent);
    if (n.type === "group") walk(n.children, visit, n);
  }
}

/** The node with this id and its parent's id (null at the top), or null. */
export function findNode(root: readonly LayerNode[], id: string): { node: LayerNode; parentId: string | null } | null {
  let hit: { node: LayerNode; parentId: string | null } | null = null;
  walk(root, (n, parent) => {
    if (!hit && n.id === id) hit = { node: n, parentId: parent?.id ?? null };
  });
  return hit;
}

/** Every part, top first. */
export function partsOf(root: readonly LayerNode[]): PartNode[] {
  const out: PartNode[] = [];
  walk(root, (n) => {
    if (n.type === "part") out.push(n);
  });
  return out;
}

/** The tree with `fn` applied to the node with this id (the same tree when it isn't there or nothing changed). */
function mapNode(nodes: LayerNode[], id: string, fn: (n: LayerNode) => LayerNode): LayerNode[] {
  let changed = false;
  const out = nodes.map((n) => {
    if (n.id === id) {
      const next = fn(n);
      changed ||= next !== n;
      return next;
    }
    if (n.type !== "group") return n;
    const children = mapNode(n.children, id, fn);
    if (children === n.children) return n;
    changed = true;
    return { ...n, children };
  });
  return changed ? out : nodes;
}

/** The tree without the node with this id, and the node. */
function takeNode(nodes: LayerNode[], id: string): { nodes: LayerNode[]; taken: LayerNode | null } {
  let taken: LayerNode | null = null;
  const strip = (list: LayerNode[]): LayerNode[] => {
    const at = list.findIndex((n) => n.id === id);
    if (at >= 0) {
      taken = list[at];
      return [...list.slice(0, at), ...list.slice(at + 1)];
    }
    let changed = false;
    const out = list.map((n) => {
      if (n.type !== "group" || taken) return n;
      const children = strip(n.children);
      if (children === n.children) return n;
      changed = true;
      return { ...n, children };
    });
    return changed ? out : list;
  };
  const out = strip(nodes);
  return { nodes: out, taken };
}

/** The tree with `node` put into the group `parentId` (null: the top) at `index`, top first. */
function insertNode(nodes: LayerNode[], parentId: string | null, index: number, node: LayerNode): LayerNode[] {
  const put = (list: LayerNode[]) => {
    const at = Math.max(0, Math.min(list.length, index));
    return [...list.slice(0, at), node, ...list.slice(at)];
  };
  if (parentId === null) return put(nodes);
  return mapNode(nodes, parentId, (g) => (g.type === "group" ? { ...g, children: put(g.children) } : g));
}

/** Whether `id` is `groupId` or inside it. */
function within(root: readonly LayerNode[], groupId: string, id: string): boolean {
  const g = findNode(root, groupId)?.node;
  if (!g) return false;
  let hit = g.id === id;
  if (g.type === "group") walk(g.children, (n) => (hit ||= n.id === id));
  return hit;
}

/* ---- ops ---- */

/** A part's place after a move: a widget always lands on cells; an item moved to px is placed freely. */
function movedPlace(grid: PageGrid, part: PartNode, to: MoveTo): PartPlace {
  const box = boxOf(grid, part.place);
  if ("col" in to) {
    const span = "cell" in part.place ? part.place.cell : nearestCells(grid, box);
    return { cell: clampCell(grid, { col: to.col, row: to.row, cols: span.cols, rows: span.rows }) };
  }
  const px = { x: to.x, y: to.y, w: box.w, h: box.h };
  return part.kind === "widget" ? { cell: nearestCells(grid, px) } : { px };
}

function resizedPlace(grid: PageGrid, part: PartNode, to: SizeTo): PartPlace {
  if ("cols" in to) {
    const at = "cell" in part.place ? part.place.cell : nearestCells(grid, part.place.px);
    return { cell: clampCell(grid, { col: at.col, row: at.row, cols: to.cols, rows: to.rows }) };
  }
  const box = boxOf(grid, part.place);
  const px = { x: box.x, y: box.y, w: Math.max(1, to.w), h: Math.max(1, to.h) };
  return part.kind === "widget" ? { cell: nearestCells(grid, px) } : { px };
}

/** A cell box kept inside the grid, at least one cell. */
export function clampCell(grid: Pick<PageGrid, "cols" | "rows">, c: CellBox): CellBox {
  const col = Math.max(1, Math.min(grid.cols, Math.round(c.col)));
  const row = Math.max(1, Math.min(grid.rows, Math.round(c.row)));
  return { col, row, cols: Math.max(1, Math.min(grid.cols - col + 1, Math.round(c.cols))), rows: Math.max(1, Math.min(grid.rows - row + 1, Math.round(c.rows))) };
}

const onPart = (model: PageModel, id: string, fn: (p: PartNode) => PartNode): PageModel => {
  const root = mapNode(model.root, id, (n) => (n.type === "part" ? fn(n) : n));
  return root === model.root ? model : { ...model, root };
};

const flag = <K extends "locked" | "hidden">(n: LayerNode, key: K, on: boolean): LayerNode => {
  if (Boolean(n[key]) === on) return n;
  const { [key]: _old, ...rest } = n;
  return (on ? { ...rest, [key]: true } : rest) as LayerNode;
};

/** The model after one op; the same model when the op changes nothing or names nothing there. */
export function applyOp(model: PageModel, op: PageOp): PageModel {
  const { grid } = model;
  switch (op.type) {
    case "move":
      return onPart(model, op.id, (p) => {
        const place = movedPlace(grid, p, op.to);
        return samePlace(place, p.place) ? p : { ...p, place };
      });
    case "resize":
      return onPart(model, op.id, (p) => {
        const place = resizedPlace(grid, p, op.to);
        return samePlace(place, p.place) ? p : { ...p, place };
      });
    case "snapToGrid":
      return onPart(model, op.id, (p) => ("cell" in p.place ? p : { ...p, place: { cell: nearestCells(grid, p.place.px) } }));
    case "setLocked":
    case "setHidden": {
      const key = op.type === "setLocked" ? "locked" : "hidden";
      const on = op.type === "setLocked" ? op.locked : op.hidden;
      const root = mapNode(model.root, op.id, (n) => flag(n, key, on));
      return root === model.root ? model : { ...model, root };
    }
    case "rename": {
      const root = mapNode(model.root, op.id, (n) => (n.name === op.name ? n : { ...n, name: op.name }));
      return root === model.root ? model : { ...model, root };
    }
    case "setSnapItems":
      return model.snapItems === op.snapItems ? model : { ...model, snapItems: op.snapItems };
    case "remove": {
      const { nodes, taken } = takeNode(model.root, op.id);
      return taken ? { ...model, root: nodes } : model;
    }
    case "add": {
      if (findNode(model.root, op.part.id)) return model;
      const parent = op.parentId ?? null;
      if (parent !== null && findNode(model.root, parent)?.node.type !== "group") return model;
      return { ...model, root: insertNode(model.root, parent, 0, op.part) };
    }
    case "reorder": {
      if (op.parentId !== null && (findNode(model.root, op.parentId)?.node.type !== "group" || within(model.root, op.id, op.parentId))) return model;
      const { nodes, taken } = takeNode(model.root, op.id);
      return taken ? { ...model, root: insertNode(nodes, op.parentId, op.index, taken) } : model;
    }
    case "moveToGroup": {
      if (op.groupId !== null && findNode(model.root, op.groupId)?.node.type !== "group") return model;
      let root = model.root;
      // Kept in their order: the topmost stays on top inside the group.
      const order = topFirst(model.root, op.ids).filter((id) => op.groupId === null || !within(model.root, id, op.groupId));
      for (const id of [...order].reverse()) {
        const { nodes, taken } = takeNode(root, id);
        if (taken) root = insertNode(nodes, op.groupId, 0, taken);
      }
      return root === model.root ? model : { ...model, root };
    }
    case "group": {
      const ids = topFirst(model.root, op.ids);
      if (ids.length === 0 || findNode(model.root, op.id)) return model;
      // The new group takes the topmost member's place.
      const first = findNode(model.root, ids[0])!;
      const siblings = first.parentId === null ? model.root : (findNode(model.root, first.parentId)!.node as GroupNode).children;
      let index = siblings.findIndex((n) => n.id === ids[0]);
      let root = model.root;
      const children: LayerNode[] = [];
      for (const id of ids) {
        const { nodes, taken } = takeNode(root, id);
        if (!taken) continue;
        root = nodes;
        children.push(taken);
      }
      // Members taken from above the place in the same list move it up.
      const left = first.parentId === null ? root : (findNode(root, first.parentId)?.node as GroupNode | undefined)?.children ?? root;
      index = Math.min(index, left.length);
      return { ...model, root: insertNode(root, first.parentId, index, { type: "group", id: op.id, name: op.name, children }) };
    }
    case "ungroup": {
      const hit = findNode(model.root, op.id);
      if (hit?.node.type !== "group") return model;
      const siblings = hit.parentId === null ? model.root : (findNode(model.root, hit.parentId)!.node as GroupNode).children;
      const index = siblings.findIndex((n) => n.id === op.id);
      let { nodes: root } = takeNode(model.root, op.id);
      hit.node.children.forEach((c, i) => {
        root = insertNode(root, hit.parentId, index + i, c);
      });
      return { ...model, root };
    }
  }
}

/** The model after each op in turn. */
export const applyOps = (model: PageModel, ops: readonly PageOp[]): PageModel => ops.reduce(applyOp, model);

/** The ids that are in the tree, in tree order (top first), a node inside another listed one left out. */
function topFirst(root: readonly LayerNode[], ids: readonly string[]): string[] {
  const want = new Set(ids);
  const out: string[] = [];
  const visit = (nodes: readonly LayerNode[]) => {
    for (const n of nodes) {
      if (want.has(n.id)) out.push(n.id);
      else if (n.type === "group") visit(n.children);
    }
  };
  visit(root);
  return out;
}
