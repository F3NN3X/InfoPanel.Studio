/**
 * Arranging and picking items on the InfoPanel editor's canvas: align and distribute a
 * selection, the item a click lands on, and where a drop lands in profile pixels. Pure: the
 * edit layer measures the drawn boxes.
 */
import type { DisplayItem } from "../schema.ts";
import type { Box, Path } from "./ops.ts";

export type AlignEdge = "left" | "centre" | "right" | "top" | "middle" | "bottom";

export interface Placed {
  path: Path;
  box: Box;
}

/** A move for one item, in whole pixels. */
export interface Shift {
  path: Path;
  dx: number;
  dy: number;
}

/** Aligns two or more boxes on one edge or centre line of the box around them. Only boxes that move are returned. */
export function align(placed: readonly Placed[], edge: AlignEdge): Shift[] {
  if (placed.length < 2) return [];
  const x = Math.min(...placed.map((p) => p.box.x));
  const y = Math.min(...placed.map((p) => p.box.y));
  const bounds = { x, y, width: Math.max(...placed.map((p) => p.box.x + p.box.width)) - x, height: Math.max(...placed.map((p) => p.box.y + p.box.height)) - y };
  const target = ({ box: b }: Placed): { dx: number; dy: number } => {
    switch (edge) {
      case "left":
        return { dx: bounds.x - b.x, dy: 0 };
      case "centre":
        return { dx: bounds.x + bounds.width / 2 - (b.x + b.width / 2), dy: 0 };
      case "right":
        return { dx: bounds.x + bounds.width - (b.x + b.width), dy: 0 };
      case "top":
        return { dx: 0, dy: bounds.y - b.y };
      case "middle":
        return { dx: 0, dy: bounds.y + bounds.height / 2 - (b.y + b.height / 2) };
      case "bottom":
        return { dx: 0, dy: bounds.y + bounds.height - (b.y + b.height) };
    }
  };
  return placed.flatMap((p) => {
    const { dx, dy } = target(p);
    const s = { path: p.path, dx: Math.round(dx), dy: Math.round(dy) };
    return s.dx || s.dy ? [s] : [];
  });
}

/**
 * Spreads three or more boxes so the gaps between them are equal, across (horizontal) or down
 * (vertical). The first and last stay where they are; the others keep their order.
 */
export function distribute(placed: readonly Placed[], axis: "horizontal" | "vertical"): Shift[] {
  if (placed.length < 3) return [];
  const pos = (b: Box) => (axis === "horizontal" ? b.x : b.y);
  const size = (b: Box) => (axis === "horizontal" ? b.width : b.height);
  const order = [...placed].sort((a, b) => pos(a.box) - pos(b.box) || a.path.localeCompare(b.path));
  const first = order[0].box;
  const last = order[order.length - 1].box;
  const span = pos(last) + size(last) - pos(first);
  const gap = (span - order.reduce((n, p) => n + size(p.box), 0)) / (order.length - 1);
  let at = pos(first);
  return order.flatMap((p) => {
    const d = Math.round(at - pos(p.box));
    at += size(p.box) + gap;
    if (d === 0) return [];
    return [{ path: p.path, dx: axis === "horizontal" ? d : 0, dy: axis === "vertical" ? d : 0 }];
  });
}

const segments = (p: Path) => p.split(".").map(Number);

/** Draw order: InfoPanel draws the list in order (index 0 at the back) and a group's items in its place. */
export function drawnBefore(a: Path, b: Path): number {
  const x = segments(a);
  const y = segments(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}

/** Whether the mouse takes the item: drawn (not hidden) and not locked, nor inside a hidden or locked group. */
function pickable(items: readonly DisplayItem[], path: Path): boolean {
  let list: readonly DisplayItem[] = items;
  for (const i of segments(path)) {
    const item = list[i];
    if (!item || item.Hidden || item.IsLocked) return false;
    list = item.kind === "Group" ? item.DisplayItems : [];
  }
  return true;
}

/** A box over the whole canvas: a background, which only takes a click with nothing else there. */
export const coversCanvas = (b: Box, canvas: { Width: number; Height: number }): boolean =>
  b.x <= 0.5 && b.y <= 0.5 && b.x + b.width >= canvas.Width - 0.5 && b.y + b.height >= canvas.Height - 0.5;

/**
 * The item a click picks among those drawn under the pointer: the topmost one the mouse takes
 * (locked and hidden items let the click through to what is below). A full-canvas background
 * wins only when nothing else is there.
 */
export function hitTest(
  items: readonly DisplayItem[],
  under: readonly Path[],
  boxOf: (path: Path) => Box | null,
  canvas: { Width: number; Height: number },
): Path | null {
  const order = [...new Set(under)].filter((p) => pickable(items, p)).sort((a, b) => drawnBefore(b, a));
  const background = (p: Path) => {
    const b = boxOf(p);
    return b !== null && coversCanvas(b, canvas);
  };
  return order.find((p) => !background(p)) ?? order[0] ?? null;
}

/**
 * A pointer position on the canvas in profile pixels: the canvas area's top-left on screen, its
 * size, and the profile drawn centred in it at `scale` (screen pixels per profile pixel).
 */
export function profilePoint(
  client: { x: number; y: number },
  area: { left: number; top: number; width: number; height: number },
  profile: { Width: number; Height: number },
  scale: number,
): { x: number; y: number } {
  return {
    x: (client.x - area.left - (area.width - profile.Width * scale) / 2) / scale,
    y: (client.y - area.top - (area.height - profile.Height * scale) / 2) / scale,
  };
}
