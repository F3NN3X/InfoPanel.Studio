/**
 * What the layer menu, its shortcuts and the inspector's LAYER buttons do to a page's selection (Edit v3 SPEC §8.3,
 * §14), as page model ops: z-order among siblings, group and ungroup, lock, hide, snap a placed-freely part to cells,
 * duplicate and delete; a Layers drag that moves nodes into a group or between rows; and a group's move, by cells when
 * it holds a widget. Any node can be selected, a part or a group. Pure: the editor applies what comes back as one undo
 * step.
 */
import { applyOp, boxOf, cellRect, findNode, nearestCells, partsOf, trackOf, walk, type GroupNode, type LayerNode, type PageModel, type PageOp, type PartNode, type PixelBox } from "./model.ts";
import { moveCells } from "./gesture.ts";

/** A layer menu row that acts on the selection (Rename and Move to group are the editor's). */
export type LayerAction = "front" | "forward" | "backward" | "back" | "group" | "ungroup" | "lock" | "hide" | "snap" | "duplicate" | "delete";

/** What an action does: ops (one undo step), and the selection after when it changes. */
export interface LayerResult {
  ops: PageOp[];
  select?: string[];
}

const siblingsOf = (model: PageModel, parentId: string | null): LayerNode[] =>
  parentId === null ? model.root : ((findNode(model.root, parentId)?.node as GroupNode | undefined)?.children ?? []);

/** The nodes with these ids that are in the model, in the order given. */
export const nodesOf = (model: PageModel, ids: readonly string[]): LayerNode[] =>
  ids.map((id) => findNode(model.root, id)?.node).filter((n): n is LayerNode => n !== undefined);

/** One op per id, each worked out on the model as the ones before it left it. */
function stepwise(model: PageModel, ids: readonly string[], opOf: (m: PageModel, id: string) => PageOp | null): PageOp[] {
  const ops: PageOp[] = [];
  let m = model;
  for (const id of ids) {
    const op = opOf(m, id);
    if (!op) continue;
    ops.push(op);
    m = applyOp(m, op);
  }
  return ops;
}

/** A move in the z-order among its siblings: `to` is the new index top first, given its index and the sibling count. */
function reorderOps(model: PageModel, ids: readonly string[], to: (index: number, count: number) => number): PageOp[] {
  return stepwise(model, ids, (m, id) => {
    const hit = findNode(m.root, id);
    if (!hit) return null;
    const list = siblingsOf(m, hit.parentId);
    const index = list.findIndex((n) => n.id === id);
    const next = Math.max(0, Math.min(list.length - 1, to(index, list.length)));
    return next === index ? null : { type: "reorder", id, parentId: hit.parentId, index: next };
  });
}

/** The ids in tree order, top first. */
function inTreeOrder(model: PageModel, ids: readonly string[]): string[] {
  const out: string[] = [];
  walk(model.root, (n) => {
    if (ids.includes(n.id)) out.push(n.id);
  });
  return out;
}

/** The group selected, else the group the primary node sits in. */
function groupToUngroup(model: PageModel, nodes: readonly LayerNode[]): string | null {
  const group = [...nodes].reverse().find((n) => n.type === "group");
  if (group) return group.id;
  const last = nodes.at(-1);
  return last ? (findNode(model.root, last.id)?.parentId ?? null) : null;
}

/** How many groups the page has. */
export function groupCount(model: PageModel): number {
  let n = 0;
  walk(model.root, (node) => (n += node.type === "group" ? 1 : 0));
  return n;
}

/** The placed-freely items and elements among the nodes, a group's members included, that aren't locked. */
const snappable = (nodes: readonly LayerNode[]): PartNode[] =>
  nodes.flatMap((n) => (n.type === "part" ? [n] : n.locked ? [] : partsOf(n.children))).filter((p) => p.kind !== "widget" && "px" in p.place && !p.locked);

/** Which actions apply to the selection `ids` (the menu disables the rest, it never hides them). */
export function layerActionsFor(model: PageModel, ids: readonly string[]): Record<LayerAction, boolean> {
  const nodes = nodesOf(model, ids);
  const any = nodes.length > 0;
  const parts = nodes.filter((n): n is PartNode => n.type === "part");
  return {
    front: any,
    forward: any,
    backward: any,
    back: any,
    group: any,
    ungroup: groupToUngroup(model, nodes) !== null,
    lock: any,
    hide: any,
    snap: snappable(nodes).length > 0,
    duplicate: parts.some((p) => p.ref.backing === "placement"),
    delete: nodes.some((n) => !n.locked),
  };
}

/**
 * The ops for `action` on the selected nodes `ids` (the primary last); `newId` names a group or a copy. Null when it
 * does nothing here.
 */
export function layerActionOps(model: PageModel, ids: readonly string[], action: LayerAction, newId: (prefix: string) => string): LayerResult | null {
  const nodes = nodesOf(model, ids);
  if (nodes.length === 0) return null;
  const order = inTreeOrder(model, nodes.map((n) => n.id));
  const result = (ops: PageOp[], select?: string[]): LayerResult | null => (ops.length ? { ops, ...(select ? { select } : {}) } : null);
  switch (action) {
    case "front":
      return result(reorderOps(model, [...order].reverse(), () => 0));
    case "forward":
      return result(reorderOps(model, order, (i) => i - 1));
    case "backward":
      return result(reorderOps(model, [...order].reverse(), (i) => i + 1));
    case "back":
      return result(reorderOps(model, order, (_i, n) => n - 1));
    case "lock": {
      const lock = nodes.some((n) => !n.locked);
      return result(nodes.map((n) => ({ type: "setLocked", id: n.id, locked: lock })));
    }
    case "hide": {
      const hide = nodes.some((n) => !n.hidden);
      return result(
        nodes.map((n) => ({ type: "setHidden", id: n.id, hidden: hide })),
        hide ? [] : undefined,
      );
    }
    case "group": {
      const id = newId("group");
      return result([{ type: "group", ids: order, id, name: `Group ${groupCount(model) + 1}` }], [id]);
    }
    case "ungroup": {
      const id = groupToUngroup(model, nodes);
      const group = id ? (findNode(model.root, id)?.node as GroupNode) : null;
      return group ? result([{ type: "ungroup", id: group.id }], group.children.map((c) => c.id)) : null;
    }
    case "snap":
      return result(snappable(nodes).map((p) => ({ type: "snapToGrid", id: p.id })));
    case "delete": {
      const gone = nodes.filter((n) => !n.locked);
      return result(gone.map((n) => ({ type: "remove", id: n.id })), []);
    }
    case "duplicate": {
      const copies = nodes.flatMap((p): { id: string; ops: PageOp[] }[] => {
        if (p.type !== "part" || p.ref.backing !== "placement") return [];
        const id = newId(p.ref.placement.module);
        const parentId = findNode(model.root, p.id)?.parentId ?? null;
        const add: PageOp = { type: "add", part: { ...p, id, ref: { backing: "placement", placement: { ...p.ref.placement, id } } }, parentId };
        // A copy placed freely sits 10 px down and right of its original, as InfoPanel's duplicate does.
        const shift: PageOp[] = "px" in p.place ? [{ type: "move", id, to: { x: p.place.px.x + 10, y: p.place.px.y + 10 } }] : [];
        return [{ id, ops: [add, ...shift] }];
      });
      return result(copies.flatMap((c) => c.ops), copies.map((c) => c.id));
    }
  }
}

/** Why the nodes `ids` can't go into `parentId` (a group can't go into itself), or null when they can. */
export function dropBlocked(model: PageModel, ids: readonly string[], parentId: string | null): string | null {
  if (parentId === null) return null;
  const target = findNode(model.root, parentId)?.node;
  if (target?.type !== "group") return "Only a group can hold parts.";
  for (const id of ids) {
    const n = findNode(model.root, id)?.node;
    if (n?.type !== "group") continue;
    let inside = n.id === parentId;
    walk(n.children, (c) => (inside ||= c.id === parentId));
    if (inside) return "A group can’t go into itself.";
  }
  return null;
}

/**
 * A Layers drop: the nodes `ids` moved into `parentId` (null: the top) at the gap before `index`, counted top first in
 * that list as it is now (the dragged nodes still in it). Their order is kept; only z changes, never a position. Null
 * when blocked.
 */
export function dropOps(model: PageModel, ids: readonly string[], parentId: string | null, index: number): PageOp[] | null {
  const order = inTreeOrder(model, ids).filter((id) => !insideAnother(model, ids, id));
  if (order.length === 0 || dropBlocked(model, order, parentId)) return null;
  // The first node under the gap that stays where it is; the dropped nodes go right above it, in their order.
  const anchor = siblingsOf(model, parentId).slice(Math.max(0, index)).find((n) => !order.includes(n.id))?.id;
  return stepwise(model, order, (m, id) => {
    const list = siblingsOf(m, parentId).filter((n) => n.id !== id);
    const at = anchor === undefined ? list.length : list.findIndex((n) => n.id === anchor);
    const hit = findNode(m.root, id);
    const now = siblingsOf(m, hit?.parentId ?? null).findIndex((n) => n.id === id);
    return hit?.parentId === parentId && now === at ? null : { type: "reorder", id, parentId, index: at };
  });
}

/** Whether `id` sits inside another of `ids` (it moves with that one). */
function insideAnother(model: PageModel, ids: readonly string[], id: string): boolean {
  for (let at = findNode(model.root, id)?.parentId ?? null; at !== null; at = findNode(model.root, at)?.parentId ?? null) if (ids.includes(at)) return true;
  return false;
}

/** The box around a node's parts in px (a group's members'), or null for an empty group. */
export function unionBox(model: PageModel, node: LayerNode): PixelBox | null {
  const parts = node.type === "part" ? [node] : partsOf(node.children);
  if (parts.length === 0) return null;
  const boxes = parts.map((p) => boxOf(model.grid, p.place));
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

/** Whether a node is locked, by itself or by a group around it. */
export function lockedInTree(model: PageModel, id: string): boolean {
  for (let at: string | null = id; at !== null; ) {
    const hit = findNode(model.root, at);
    if (!hit) return false;
    if (hit.node.locked) return true;
    at = hit.parentId;
  }
  return false;
}

/**
 * The ops that move the groups `ids` by a pointer delta (page px) from where their parts were (SPEC §8.3): a group
 * holding a widget moves by whole cells, every member keeping its offset, and the move is refused (null) when a widget
 * would leave the grid or land on a widget outside the groups. A group of items and elements only moves like an item:
 * to the pixel when `free`, else its box's corner snaps to the nearest cell. Locked groups and locked parts stay.
 */
export function groupMoveOps(model: PageModel, ids: readonly string[], dx: number, dy: number, free: boolean): PageOp[] | null {
  const groups = nodesOf(model, ids).filter((n): n is GroupNode => n.type === "group" && !lockedInTree(model, n.id));
  const members = groups.flatMap((g) => partsOf(g.children)).filter((p) => !p.locked);
  if (members.length === 0) return [];
  const { grid } = model;
  const t = trackOf(grid);
  const pitch = { x: t.w + grid.gap, y: t.h + grid.gap };
  const widgets = members.filter((p) => p.kind === "widget");
  const cellOf = (p: PartNode) => ("cell" in p.place ? p.place.cell : nearestCells(grid, p.place.px));
  let shift: { x: number; y: number };
  let cells: { dc: number; dr: number } | null = null;
  if (widgets.length > 0) {
    const dc = Math.round(dx / Math.max(1, pitch.x));
    const dr = Math.round(dy / Math.max(1, pitch.y));
    const moving = new Set(widgets.map((w) => w.id));
    const others = partsOf(model.root).filter((p) => p.kind === "widget" && !moving.has(p.id)).map(cellOf);
    if (!moveCells(grid, widgets.map(cellOf), others, dc, dr)) return null;
    cells = { dc, dr };
    shift = { x: dc * pitch.x, y: dr * pitch.y };
  } else if (free) {
    shift = { x: Math.round(dx), y: Math.round(dy) };
  } else {
    const boxes = groups.map((g) => unionBox(model, g)).filter((b): b is PixelBox => b !== null);
    const corner = { x: Math.min(...boxes.map((b) => b.x)), y: Math.min(...boxes.map((b) => b.y)) };
    const at = cellRect(grid, nearestCells(grid, { x: corner.x + dx, y: corner.y + dy, w: 1, h: 1 }));
    shift = { x: Math.round(at.x - corner.x), y: Math.round(at.y - corner.y) };
  }
  return members.map((p): PageOp => {
    if ("cell" in p.place) {
      const c = p.place.cell;
      const step = cells ?? { dc: Math.round(shift.x / Math.max(1, pitch.x)), dr: Math.round(shift.y / Math.max(1, pitch.y)) };
      return { type: "move", id: p.id, to: { col: c.col + step.dc, row: c.row + step.dr } };
    }
    return { type: "move", id: p.id, to: { x: Math.round(p.place.px.x + shift.x), y: Math.round(p.place.px.y + shift.y) } };
  });
}
