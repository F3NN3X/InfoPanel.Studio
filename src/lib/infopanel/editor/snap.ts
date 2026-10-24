/**
 * Snapping in the InfoPanel editor, as Ember's editor does it: a moved or resized box snaps to
 * the canvas's edges and centre and to the other visible items' edges and centres, within 4
 * screen pixels whatever the zoom; Alt turns it off. Shift keeps a drag on one axis and a resize
 * in proportion. Pure: the edit layer measures the boxes and draws the guides.
 */
import type { Box } from "./ops.ts";

/** How close, in screen pixels, a box edge or centre must come to a target to snap to it. */
export const SNAP_PX = 4;

/** Lines a box can snap to, in profile pixels: vertical lines by x, horizontal ones by y. */
export interface SnapTargets {
  x: number[];
  y: number[];
}

/** A guide drawn across the canvas where a box snapped: a vertical line at x, or a horizontal one at y. */
export interface Guide {
  axis: "x" | "y";
  at: number;
}

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** The canvas's edges and centre, then every other box's edges and centre. */
export function snapTargets(canvas: { Width: number; Height: number }, others: readonly Box[]): SnapTargets {
  const xs = [0, canvas.Width / 2, canvas.Width, ...others.flatMap((b) => [b.x, b.x + b.width / 2, b.x + b.width])];
  const ys = [0, canvas.Height / 2, canvas.Height, ...others.flatMap((b) => [b.y, b.y + b.height / 2, b.y + b.height])];
  return { x: [...new Set(xs)], y: [...new Set(ys)] };
}

/** The snap distance in profile pixels: SNAP_PX screen pixels at `k` profile pixels per screen pixel; 0 with Alt held. */
export const snapThreshold = (k: number, alt: boolean): number => (alt ? 0 : SNAP_PX * k);

/** The nearest target to any of `lines` within `threshold`: the shift that lands on it, and where. */
function nearest(lines: readonly number[], targets: readonly number[], threshold: number): { d: number; at: number } | null {
  if (threshold <= 0) return null;
  let best: { d: number; at: number } | null = null;
  for (const line of lines) {
    for (const t of targets) {
      const d = t - line;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: t };
    }
  }
  return best;
}

/** A moved box snapped: the extra shift for its left, centre or right (top, middle or bottom), and the guides. */
export function snapMove(box: Box, targets: SnapTargets, threshold: number): { dx: number; dy: number; guides: Guide[] } {
  const sx = nearest([box.x, box.x + box.width / 2, box.x + box.width], targets.x, threshold);
  const sy = nearest([box.y, box.y + box.height / 2, box.y + box.height], targets.y, threshold);
  return { dx: sx?.d ?? 0, dy: sy?.d ?? 0, guides: [...(sx ? [{ axis: "x" as const, at: sx.at }] : []), ...(sy ? [{ axis: "y" as const, at: sy.at }] : [])] };
}

/** A resized box snapped: only the edges the handle moves snap; the opposite edges stay put. */
export function snapResize(box: Box, handle: Handle, targets: SnapTargets, threshold: number): { box: Box; guides: Guide[] } {
  const out = { ...box };
  const guides: Guide[] = [];
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  if (handle.includes("e") || handle.includes("w")) {
    const west = handle.includes("w");
    const s = nearest([west ? box.x : right], targets.x, threshold);
    if (s) {
      if (west) {
        out.x = s.at;
        out.width = Math.max(1, right - s.at);
      } else out.width = Math.max(1, s.at - box.x);
      guides.push({ axis: "x", at: s.at });
    }
  }
  if (handle.includes("n") || handle.includes("s")) {
    const north = handle.includes("n");
    const s = nearest([north ? box.y : bottom], targets.y, threshold);
    if (s) {
      if (north) {
        out.y = s.at;
        out.height = Math.max(1, bottom - s.at);
      } else out.height = Math.max(1, s.at - box.y);
      guides.push({ axis: "y", at: s.at });
    }
  }
  return { box: out, guides };
}

/** Shift while dragging: the drag keeps to the axis it moved further along. */
export const constrainAxis = (dx: number, dy: number): { dx: number; dy: number } => (Math.abs(dx) >= Math.abs(dy) ? { dx, dy: 0 } : { dx: 0, dy });

/**
 * Shift while resizing: the box keeps the shape it started with (a square stays square). A side
 * handle sets the other side from it; a corner follows whichever side grew more. The edges
 * opposite the handle stay where they were.
 */
export function keepAspect(start: Box, box: Box, handle: Handle): Box {
  if (start.width <= 0 || start.height <= 0) return box;
  const ratio = start.width / start.height;
  const sides = handle.length === 1;
  const byWidth = sides ? handle === "e" || handle === "w" : box.width / start.width >= box.height / start.height;
  const width = Math.max(1, byWidth ? box.width : box.height * ratio);
  const height = Math.max(1, byWidth ? box.width / ratio : box.height);
  const x = handle.includes("w") ? start.x + start.width - width : handle === "n" || handle === "s" ? start.x + (start.width - width) / 2 : start.x;
  const y = handle.includes("n") ? start.y + start.height - height : handle === "e" || handle === "w" ? start.y + (start.height - height) / 2 : start.y;
  return { x, y, width, height };
}

/** The guides a box sits on (its edges or centres exactly on a target): what a constrained resize still shows. */
export function guidesAt(box: Box, targets: SnapTargets): Guide[] {
  const on = (lines: number[], ts: number[]) => ts.filter((t) => lines.some((l) => Math.abs(l - t) < 0.5));
  return [
    ...on([box.x, box.x + box.width / 2, box.x + box.width], targets.x).map((at) => ({ axis: "x" as const, at })),
    ...on([box.y, box.y + box.height / 2, box.y + box.height], targets.y).map((at) => ({ axis: "y" as const, at })),
  ];
}

/** The box around several boxes (a multi-item drag snaps as one). */
export function unionBox(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, width: Math.max(...boxes.map((b) => b.x + b.width)) - x, height: Math.max(...boxes.map((b) => b.y + b.height)) - y };
}
