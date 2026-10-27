/**
 * The keyboard on the selected parts of a page (Edit v3 SPEC §14), as page model ops: arrows move, nudge and resize
 * (`arrowOps`), Ctrl+] / Ctrl+[ bring forward / send backward and with Shift to the front / back, Ctrl+G groups and
 * Ctrl+Shift+G ungroups, Ctrl+L locks, Ctrl+H (and H) hides, Ctrl+D duplicates, Del deletes, Esc clears the
 * selection. Pure: the studio reads the key and applies what comes back as one undo step.
 */
import { applyOp, findNode, walk, type GroupNode, type LayerNode, type PageModel, type PageOp, type PartNode } from "./model.ts";
import { arrowOps } from "./gesture.ts";

/** The parts of a key press it reads (`code` for the brackets, which Shift turns into braces). */
export interface PartKey {
  key: string;
  code?: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

/** What a key does: ops (one undo step, `merge` coalesces repeats), and the selection after, or the selection cleared. */
export type PartKeyResult = { ops: PageOp[]; merge?: string; select?: string[] } | { clear: true } | null;

const ARROWS: Record<string, [-1 | 0 | 1, -1 | 0 | 1]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

const siblingsOf = (model: PageModel, parentId: string | null): LayerNode[] =>
  parentId === null ? model.root : ((findNode(model.root, parentId)?.node as GroupNode | undefined)?.children ?? []);

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

/** The ops for a key on the selected parts `ids` (the primary last); `newId` names a group or a copy. */
export function partKeyOps(model: PageModel, ids: readonly string[], k: PartKey, newId: (prefix: string) => string): PartKeyResult {
  const parts = ids.map((id) => findNode(model.root, id)?.node).filter((n): n is PartNode => n?.type === "part");
  if (parts.length === 0) return null;
  const unlocked = parts.filter((p) => !p.locked);
  const arrow = ARROWS[k.key];
  if (arrow && !k.ctrl) {
    const ops = arrowOps(model.grid, parts, { dx: arrow[0], dy: arrow[1], alt: k.alt, shift: k.shift });
    return ops.length ? { ops, merge: "part-keys" } : null;
  }
  if (k.alt) return null;
  if (!k.ctrl) {
    if (k.key === "Escape") return { clear: true };
    if (k.key === "Delete" || k.key === "Backspace") return unlocked.length ? { ops: unlocked.map((p) => ({ type: "remove", id: p.id })), select: [] } : null;
    if ((k.key === "h" || k.key === "H") && !k.shift) return { ops: parts.map((p) => ({ type: "setHidden", id: p.id, hidden: true })), select: [] };
    return null;
  }
  const key = k.key.toLowerCase();
  const front = k.code === "BracketRight" || key === "]" || key === "}";
  const back = k.code === "BracketLeft" || key === "[" || key === "{";
  if (front || back) {
    const order = parts.map((p) => p.id);
    if (front) return { ops: reorderOps(model, order, (i) => (k.shift ? 0 : i - 1)) };
    return { ops: reorderOps(model, [...order].reverse(), (i, n) => (k.shift ? n - 1 : i + 1)) };
  }
  if (key === "l" && !k.shift) {
    const lock = parts.some((p) => !p.locked);
    return { ops: parts.map((p) => ({ type: "setLocked", id: p.id, locked: lock })) };
  }
  if (key === "h" && !k.shift) return { ops: parts.map((p) => ({ type: "setHidden", id: p.id, hidden: true })), select: [] };
  if (key === "g") {
    if (k.shift) {
      const parent = findNode(model.root, parts.at(-1)!.id)?.parentId ?? null;
      return parent === null ? null : { ops: [{ type: "ungroup", id: parent }] };
    }
    let groups = 0;
    walk(model.root, (n) => (groups += n.type === "group" ? 1 : 0));
    return { ops: [{ type: "group", ids: parts.map((p) => p.id), id: newId("group"), name: `Group ${groups + 1}` }] };
  }
  if (key === "d" && !k.shift) {
    const copies = parts.flatMap((p): { id: string; ops: PageOp[] }[] => {
      if (p.ref.backing !== "placement") return [];
      const id = newId(p.ref.placement.module);
      const parentId = findNode(model.root, p.id)?.parentId ?? null;
      const add: PageOp = { type: "add", part: { ...p, id, ref: { backing: "placement", placement: { ...p.ref.placement, id } } }, parentId };
      // A copy placed freely sits 10 px down and right of its original, as InfoPanel's duplicate does.
      const shift: PageOp[] = "px" in p.place ? [{ type: "move", id, to: { x: p.place.px.x + 10, y: p.place.px.y + 10 } }] : [];
      return [{ id, ops: [add, ...shift] }];
    });
    return copies.length ? { ops: copies.flatMap((c) => c.ops), select: copies.map((c) => c.id) } : null;
  }
  return null;
}
