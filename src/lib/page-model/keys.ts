/**
 * The keyboard on the selected parts of a page (Edit v3 SPEC §14), as page model ops: arrows move, nudge and resize
 * (`arrowOps`), Ctrl+] / Ctrl+[ bring forward / send backward and with Shift to the front / back, Ctrl+G groups and
 * Ctrl+Shift+G ungroups, Ctrl+L locks, Ctrl+H (and H) hides, Ctrl+D duplicates, Del deletes (`layer-actions.ts`, as the
 * layer menu does), Esc clears the selection. Pure: the studio reads the key and applies what comes back as one undo step.
 */
import type { PageModel, PageOp, PartNode } from "./model.ts";
import { arrowOps } from "./gesture.ts";
import { layerActionOps, nodesOf, type LayerAction } from "./layer-actions.ts";

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

/** The layer action a key with Ctrl (or none) stands for. */
function actionOf(k: PartKey): LayerAction | null {
  const key = k.key.toLowerCase();
  if (!k.ctrl) {
    if (k.key === "Delete" || k.key === "Backspace") return "delete";
    return key === "h" && !k.shift ? "hide" : null;
  }
  const front = k.code === "BracketRight" || key === "]" || key === "}";
  const back = k.code === "BracketLeft" || key === "[" || key === "{";
  if (front) return k.shift ? "front" : "forward";
  if (back) return k.shift ? "back" : "backward";
  if (key === "g") return k.shift ? "ungroup" : "group";
  if (k.shift) return null;
  return ({ l: "lock", h: "hide", d: "duplicate" } as const)[key as "l" | "h" | "d"] ?? null;
}

/** The ops for a key on the selected nodes `ids` (the primary last); `newId` names a group or a copy. */
export function partKeyOps(model: PageModel, ids: readonly string[], k: PartKey, newId: (prefix: string) => string): PartKeyResult {
  const nodes = nodesOf(model, ids);
  if (nodes.length === 0) return null;
  const parts = nodes.filter((n): n is PartNode => n.type === "part");
  const arrow = ARROWS[k.key];
  if (arrow && !k.ctrl) {
    const ops = arrowOps(model.grid, parts, { dx: arrow[0], dy: arrow[1], alt: k.alt, shift: k.shift });
    return ops.length ? { ops, merge: "part-keys" } : null;
  }
  if (k.alt) return null;
  if (!k.ctrl && k.key === "Escape") return { clear: true };
  const action = actionOf(k);
  if (!action) return null;
  const result = layerActionOps(model, ids, action, newId);
  // Delete with nothing it may delete leaves the key to others; any other layer key is taken even when it changes nothing.
  if (!result) return action === "delete" ? null : { ops: [] };
  return result;
}
