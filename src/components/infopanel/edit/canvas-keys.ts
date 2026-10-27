/**
 * The canvas zone editor's keys (spec §7): Ctrl+D duplicate, Ctrl+G group, Ctrl+Shift+G ungroup, Ctrl+] / Ctrl+[
 * forward / backward (with Shift to the front / back), Ctrl+L lock, Ctrl+H hide, F2 rename (Edit v3 SPEC §14, the layer
 * menu's keys), Ctrl+Shift+S save as component, Del delete, arrows nudge 1 px (Shift: 10 px; by cells on a page
 * with a grid), Esc closes the Export check, clears the selection, then leaves a free area. While the editor is open the studio's zone shortcuts are held back ("block"), apart
 * from the ones that still make sense in Edit's shell: undo, redo, save, the palette, the cheat sheet, the inspector
 * toggle and the page keys.
 */
import { shortcutAction, type KeyInput } from "@/components/studio/use-studio-shortcuts";
import type { LayerAction } from "@/lib/page-model/layer-actions";

export type CanvasKeyAction =
  | { type: "duplicate" | "group" | "ungroup" | "component" | "remove" | "escape" | "block" | "forward" | "backward" | "rename" }
  /** A layer menu action with its own key (front, back, lock, hide). */
  | { type: "layer"; action: LayerAction }
  | { type: "nudge"; dx: number; dy: number }
  /** On a page with a grid (Edit v3 SPEC §14): one cell's move, or (Shift) one cell's resize. */
  | { type: "nudge-cell" | "resize-cell"; dx: number; dy: number };

const PASS = new Set(["undo", "redo", "save", "palette", "cheatsheet", "toggle-dock", "page-next", "page-prev"]);

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/**
 * The action for a key. On a page with a grid (`ctx.grid`, an imported profile) the arrows go by cells as SPEC §14 has
 * them: Arrows move one cell, Shift+Arrows resize one cell, Alt+Arrows nudge 1 px and Alt+Shift+Arrows 10 px.
 */
export function canvasKeyAction(e: KeyInput, ctx: { typing: boolean; overlay: boolean; grid?: boolean }): CanvasKeyAction | null {
  if (ctx.typing || ctx.overlay) return null;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (mod && !e.altKey && e.shiftKey && key === "s") return { type: "component" };
  if (mod && !e.altKey && key === "d" && !e.shiftKey) return { type: "duplicate" };
  if (mod && !e.altKey && key === "g") return { type: e.shiftKey ? "ungroup" : "group" };
  if (mod && !e.altKey && e.shiftKey && (e.code === "BracketRight" || key === "}")) return { type: "layer", action: "front" };
  if (mod && !e.altKey && e.shiftKey && (e.code === "BracketLeft" || key === "{")) return { type: "layer", action: "back" };
  if (mod && !e.altKey && !e.shiftKey && key === "l") return { type: "layer", action: "lock" };
  if (mod && !e.altKey && !e.shiftKey && key === "h") return { type: "layer", action: "hide" };
  if (!mod && !e.altKey && !e.shiftKey && key === "F2") return { type: "rename" };
  if (mod && !e.altKey && !e.shiftKey && (e.code === "BracketRight" || key === "]")) return { type: "forward" };
  if (mod && !e.altKey && !e.shiftKey && (e.code === "BracketLeft" || key === "[")) return { type: "backward" };
  if (!mod && !e.altKey && (key === "Delete" || key === "Backspace")) return { type: "remove" };
  if (!mod && !e.altKey && key === "Escape") return { type: "escape" };
  const arrow = ARROWS[key];
  if (arrow && !mod && ctx.grid) {
    if (e.altKey) return e.altGraph ? null : { type: "nudge", dx: arrow[0] * (e.shiftKey ? 10 : 1), dy: arrow[1] * (e.shiftKey ? 10 : 1) };
    return { type: e.shiftKey ? "resize-cell" : "nudge-cell", dx: arrow[0], dy: arrow[1] };
  }
  if (arrow && !mod && !e.altKey) {
    const step = e.shiftKey ? 10 : 1;
    return { type: "nudge", dx: arrow[0] * step, dy: arrow[1] * step };
  }
  const studio = shortcutAction(e, { ...ctx, widget: false, dragging: false });
  return studio && !PASS.has(studio.type) ? { type: "block" } : null;
}
