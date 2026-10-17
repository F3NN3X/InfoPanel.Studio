/**
 * The canvas zone editor's keys (spec §7): Ctrl+D duplicate, Ctrl+G group, Ctrl+Shift+G ungroup,
 * Del delete, arrows nudge 1 px (Shift: 10 px), Esc clears the selection, then leaves. While the
 * editor is open the studio's zone shortcuts are held back ("block"), apart from the ones that
 * still make sense: undo, redo, save, the palette and the cheat sheet.
 */
import { shortcutAction, type KeyInput } from "@/components/studio/use-studio-shortcuts";

export type CanvasKeyAction =
  | { type: "duplicate" | "group" | "ungroup" | "remove" | "escape" | "block" }
  | { type: "nudge"; dx: number; dy: number };

const PASS = new Set(["undo", "redo", "save", "palette", "cheatsheet"]);

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

export function canvasKeyAction(e: KeyInput, ctx: { typing: boolean; overlay: boolean }): CanvasKeyAction | null {
  if (ctx.typing || ctx.overlay) return null;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (mod && !e.altKey && key === "d" && !e.shiftKey) return { type: "duplicate" };
  if (mod && !e.altKey && key === "g") return { type: e.shiftKey ? "ungroup" : "group" };
  if (!mod && !e.altKey && (key === "Delete" || key === "Backspace")) return { type: "remove" };
  if (!mod && !e.altKey && key === "Escape") return { type: "escape" };
  const arrow = ARROWS[key];
  if (arrow && !mod && !e.altKey) {
    const step = e.shiftKey ? 10 : 1;
    return { type: "nudge", dx: arrow[0] * step, dy: arrow[1] * step };
  }
  const studio = shortcutAction(e, { ...ctx, widget: false, dragging: false });
  return studio && !PASS.has(studio.type) ? { type: "block" } : null;
}
