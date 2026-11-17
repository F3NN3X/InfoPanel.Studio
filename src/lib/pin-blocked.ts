import { BLANK_MODULE, CANVAS_ID, type Placement } from "./layout";

/** Why a page widget can't go to the pinned layer (null: it can). Its own module: Layers' menu reads it from the studio's entry, ahead of the pinned editor's chunk. */
export function pinBlocked(p: Pick<Placement, "module" | "item" | "canvas" | "canvasRef">): string | null {
  if (p.module === BLANK_MODULE) return "Blank space can't be pinned";
  if (p.item) return "An InfoPanel item can't be pinned";
  if (p.module === CANVAS_ID || p.canvas || p.canvasRef) return "An InfoPanel canvas can't be pinned";
  return null;
}
