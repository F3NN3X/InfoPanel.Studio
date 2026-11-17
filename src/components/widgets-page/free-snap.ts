// Smart guides for the builder's free layout and grid areas (the owner's "visual lines to help with alignment and snapping"), pure and
// in the container's own px: a moved or resized box snaps within `GUIDE_PX` screen pixels (at any zoom) to its siblings' edges and
// centres, the container's edges, centre lines and padding, and to equal spacing with the blocks beside it, shown as distance markers.
// Alt places it freely. The edge and centre snapping is the InfoPanel editor's own (`snap.ts`: `snapTargets`, `snapMove`, `snapResize`,
// `keepAspect`, `guidesAt`); what is new here is the padding lines, equal spacing and the resize from the centre.
import type { Box } from "@/lib/infopanel/editor/ops";
import { type Guide, guidesAt, type Handle, keepAspect, snapMove, snapResize, type SnapTargets, snapTargets } from "@/lib/infopanel/editor/snap";

export type { Box, Guide, Handle };

/** How close, in screen pixels, an edge, a centre or a gap must come to snap. */
export const GUIDE_PX = 6;

/** The snap distance in the container's px at `scale` screen px per px; 0 (no snapping) when `off` (Alt held). */
export const snapDistance = (scale: number, off: boolean): number => (off ? 0 : GUIDE_PX / (scale > 0 ? scale : 1));

/** Equal spacing shown as a distance marker: a gap along `axis` from `from` to `to`, drawn at `at` across. */
export interface Gap {
  axis: "x" | "y";
  from: number;
  to: number;
  at: number;
}

/** What a snapped move or resize gives: the box, the guides it sits on, and the equal gaps it keeps. */
export interface Snapped {
  box: Box;
  guides: Guide[];
  gaps: Gap[];
}

/** The lines a box snaps to: the container's edges and centre lines, its padding (`pad` in from each edge), and every other box's edges and centre. */
export function freeTargets(size: { w: number; h: number }, pad: number, others: readonly Box[]): SnapTargets {
  const t = snapTargets({ Width: size.w, Height: size.h }, others);
  const inset = pad > 0 && pad * 2 < Math.min(size.w, size.h);
  return inset ? { x: [...new Set([...t.x, pad, size.w - pad])], y: [...new Set([...t.y, pad, size.h - pad])] } : t;
}

const lo = (b: Box, axis: "x" | "y"): number => (axis === "x" ? b.x : b.y);
const len = (b: Box, axis: "x" | "y"): number => (axis === "x" ? b.width : b.height);
const hi = (b: Box, axis: "x" | "y"): number => lo(b, axis) + len(b, axis);
const across = (axis: "x" | "y"): "x" | "y" => (axis === "x" ? "y" : "x");
/** The middle of a box across `axis` (where a marker of a gap along it is drawn). */
const mid = (b: Box, axis: "x" | "y"): number => lo(b, across(axis)) + len(b, across(axis)) / 2;

/**
 * Equal spacing along `axis` for a box being moved: among the others that share its row (they overlap it across), a place right between
 * its nearest neighbours before and after it, or one that repeats a gap two of them already keep beside a neighbour. The nearest within
 * `threshold`: the shift there and the gaps to mark, or null.
 */
export function spacingSnap(box: Box, others: readonly Box[], axis: "x" | "y", threshold: number): { d: number; gaps: Gap[] } | null {
  if (threshold <= 0) return null;
  const c = across(axis);
  const row = others.filter((o) => lo(o, c) < hi(box, c) && hi(o, c) > lo(box, c)).sort((a, b) => lo(a, axis) - lo(b, axis));
  const centre = lo(box, axis) + len(box, axis) / 2;
  const before = row.filter((o) => hi(o, axis) <= centre).sort((a, b) => hi(b, axis) - hi(a, axis))[0];
  const after = row.filter((o) => lo(o, axis) >= centre).sort((a, b) => lo(a, axis) - lo(b, axis))[0];
  const size = len(box, axis);
  const gap = (from: number, to: number, at: number): Gap => ({ axis, from, to, at });
  const found: { pos: number; gaps: (pos: number) => Gap[] }[] = [];
  // right between the two neighbours
  if (before && after && lo(after, axis) - hi(before, axis) >= size)
    found.push({ pos: (hi(before, axis) + lo(after, axis) - size) / 2, gaps: (pos) => [gap(hi(before, axis), pos, mid(box, axis)), gap(pos + size, lo(after, axis), mid(box, axis))] });
  // a gap two others keep, repeated beside a neighbour
  for (let k = 0; k + 1 < row.length; k++) {
    const [a, b] = [row[k], row[k + 1]];
    const g = lo(b, axis) - hi(a, axis);
    if (g <= 0) continue;
    const kept = gap(hi(a, axis), lo(b, axis), (mid(a, axis) + mid(b, axis)) / 2);
    // (beside the pair's own first or last block it would land on the other one)
    if (before && before !== a) found.push({ pos: hi(before, axis) + g, gaps: (pos) => [kept, gap(hi(before, axis), pos, mid(box, axis))] });
    if (after && after !== b) found.push({ pos: lo(after, axis) - g - size, gaps: (pos) => [kept, gap(pos + size, lo(after, axis), mid(box, axis))] });
  }
  const best = found.filter((f) => Math.abs(f.pos - lo(box, axis)) <= threshold).sort((a, b) => Math.abs(a.pos - lo(box, axis)) - Math.abs(b.pos - lo(box, axis)))[0];
  return best ? { d: best.pos - lo(box, axis), gaps: best.gaps(best.pos) } : null;
}

/**
 * A moved box snapped: on each axis to the nearer of an edge or centre line (`snapMove`) and equal spacing with its row's blocks; the
 * guides are every line the box then sits on. With no snapping (`threshold` 0) it stays where the pointer put it, with no guides.
 */
export function snapFreeMove(box: Box, targets: SnapTargets, others: readonly Box[], threshold: number): Snapped {
  if (threshold <= 0) return { box, guides: [], gaps: [] };
  const edge = snapMove(box, targets, threshold);
  const out = { ...box };
  const gaps: Gap[] = [];
  for (const axis of ["x", "y"] as const) {
    const lined = edge.guides.some((g) => g.axis === axis);
    const d = axis === "x" ? edge.dx : edge.dy;
    const even = spacingSnap(box, others, axis, threshold);
    const use = even && (!lined || Math.abs(even.d) < Math.abs(d)) ? even.d : d;
    if (axis === "x") out.x += use;
    else out.y += use;
    if (even && use === even.d) gaps.push(...even.gaps);
  }
  return { box: out, guides: guidesAt(out, targets), gaps };
}

/** A grid area as track lines: `[first column, last column, first row, last row]`, 1-based tracks (as `ZoneRect`). */
interface Cells {
  col: number;
  row: number;
  cols: number;
  rows: number;
}

/**
 * The track lines a moved grid area shares with the other areas (a track snaps by itself, so these are its guides): each line index
 * (0-based, 0 the grid's start) where one of its edges or its centre lines up with another's.
 */
export function areaGuides(moving: Cells, others: readonly Cells[]): { cols: number[]; rows: number[] } {
  const lines = (start: number, span: number) => [start - 1, start - 1 + span / 2, start - 1 + span];
  const shared = (own: number[], theirs: number[][]) => [...new Set(own.filter((l) => theirs.some((t) => t.includes(l))))].sort((a, b) => a - b);
  return { cols: shared(lines(moving.col, moving.cols), others.map((o) => lines(o.col, o.cols))), rows: shared(lines(moving.row, moving.rows), others.map((o) => lines(o.row, o.rows))) };
}

/** How a resize is held: Shift keeps the box's shape, Alt keeps its centre. */
export interface ResizeHow {
  aspect?: boolean;
  centre?: boolean;
}

/**
 * A box resized from `start` by a handle dragged `dx`, `dy` (px), before snapping: the handle's edges follow the pointer and the others
 * stay, or with `centre` the opposite edges move the other way; never under `min` px each way.
 */
export function resizeBy(start: Box, handle: Handle, dx: number, dy: number, centre: boolean, min: { w: number; h: number }): Box {
  const k = centre ? 2 : 1;
  const east = handle.includes("e");
  const west = handle.includes("w");
  const south = handle.includes("s");
  const north = handle.includes("n");
  const width = Math.max(min.w, start.width + (east ? dx * k : west ? -dx * k : 0));
  const height = Math.max(min.h, start.height + (south ? dy * k : north ? -dy * k : 0));
  const x = centre ? start.x + (start.width - width) / 2 : west ? start.x + start.width - width : start.x;
  const y = centre ? start.y + (start.height - height) / 2 : north ? start.y + start.height - height : start.y;
  return { x, y, width, height };
}

/** A box cut to its container (`size`): an edge past it stops at it. */
export function clipTo(b: Box, size: { w: number; h: number }): Box {
  const x = Math.max(0, b.x);
  const y = Math.max(0, b.y);
  return { x, y, width: Math.min(size.w, b.x + b.width) - x, height: Math.min(size.h, b.y + b.height) - y };
}

/**
 * A resize snapped: the moved edges to the lines near them (`snapResize`); with Shift the shape kept (`keepAspect`) and with Alt the centre
 * kept, neither snapped but both showing the lines the box sits on. Cut to the container.
 */
export function snapFreeResize(start: Box, handle: Handle, dx: number, dy: number, how: ResizeHow, targets: SnapTargets, threshold: number, size: { w: number; h: number }, min: { w: number; h: number }): Snapped {
  const raw = resizeBy(start, handle, dx, dy, !!how.centre, min);
  if (how.aspect || how.centre) {
    const box = clipTo(how.aspect ? keepAspect(start, raw, handle) : raw, size);
    return { box, guides: threshold > 0 ? guidesAt(box, targets) : [], gaps: [] };
  }
  const s = snapResize(raw, handle, targets, threshold);
  const box = clipTo(s.box, size);
  return { box, guides: threshold > 0 ? guidesAt(box, targets) : [], gaps: [] };
}
