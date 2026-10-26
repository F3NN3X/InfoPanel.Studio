// Sizing: size tiers, grid-span shapes, element measurement and eased value history.
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Shape, Tier } from "./types";

/* ───────── sizing ─────────
   Every widget measures itself and picks a layout tier.
   xs < 220×140 ≤ sm < 340×210 ≤ md < 500×320 ≤ lg */
// Measured on the widget's outer (border-box) size so padding changes can never feed back into the tier.
export const tierOf = (w: number, h: number): Tier =>
  w < 220 || h < 140 ? "xs" : w < 340 || h < 210 ? "sm" : w < 500 || h < 320 ? "md" : "lg";
/**
 * The size a widget's content is drawn for unless its kind says otherwise: the `lg` tier's smallest box. Past it the
 * shell zooms the content with the zone (`zoomFor`), so a large zone shows the `lg` layout bigger, not emptier.
 */
export const DESIGN_SIZE = { w: 500, h: 320 } as const;
// Shape follows the zone's grid span: 1×1 → tile, 3×1 / 4×1 → strip, 1×2 / 1×3 → column, everything else → box.
// A strip is one row of a square grid (under 160px tall): on a grid of short rows (a 1920×550 strip
// profile) a wide zone several rows tall is a box, so it shows the widget, not the one-line summary.
export const shapeOf = (w: number, h: number): Shape => {
  if (!w || !h) return "box";
  const r = w / h;
  if (r >= 2.6 && h < 160) return "strip";
  if (r <= 0.62 && w < 260) return "column";
  if (w < 240 && h < 240) return "tile";
  return "box";
};

/** The Summary card setting: `auto` in small zones (the default), `off` never, `on` at any size. */
export type SummaryMode = "auto" | "off" | "on";

/**
 * The form the summary card takes, or null for the full layout. Auto shows it for tile, strip and
 * column zones; Always also turns a box into a strip (wide), a column (tall) or a tile.
 */
export const summaryShape = (mode: SummaryMode | undefined, shape: Shape, w: number, h: number): Shape | null => {
  if (mode === "off") return null;
  if (shape !== "box") return shape;
  if (mode !== "on") return null;
  if (!w || !h) return "tile";
  return w >= h * 2.2 ? "strip" : h >= w * 1.6 ? "column" : "tile";
};

export interface Box {
  w: number;
  h: number;
  size: Tier;
  shape: Shape;
}

/**
 * The box a widget lays out in. `zoom` is the shell's CSS zoom: the zoomed content sees the
 * measured size divided by it, so tier and shape are taken from that size.
 */
export const boxOf = (w: number, h: number, forced: Tier | "auto" | undefined, zoom = 1): Box => {
  const zw = w / zoom,
    zh = h / zoom;
  return { w: zw, h: zh, size: forced && forced !== "auto" ? forced : tierOf(zw, zh), shape: shapeOf(zw, zh) };
};

/**
 * The shell's measured box. `zoom` is the content's zoom, or how to get it from the measured outer size; the zoom
 * used is returned with the box.
 */
export function useBox(forced: Tier | "auto" | undefined, zoom: number | ((w: number, h: number) => number) = 1): [RefObject<HTMLDivElement | null>, Box, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [outer, setOuter] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const bb = e.borderBoxSize?.[0];
      const w = bb ? bb.inlineSize : el.offsetWidth,
        h = bb ? bb.blockSize : el.offsetHeight;
      setOuter((s) => (s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const z = typeof zoom === "function" ? zoom(outer.w, outer.h) : zoom;
  const box = outer.w || outer.h ? boxOf(outer.w, outer.h, forced, z) : { w: 0, h: 0, size: forced && forced !== "auto" ? forced : "md", shape: "box" as Shape };
  return [ref, box, z];
}

export const pickBy = <T,>(size: Tier, map: Partial<Record<Tier, T>> & { md: T }): T => map[size] ?? map.md;

/**
 * One step of an eased (EMA) history: the next history after `value` arrives. Returns `hist`
 * unchanged for a non-finite value. A first value seeds two points so a graph has a line.
 */
export function easeHistory(hist: number[], value: number, len = 48, ease = 0.45): number[] {
  if (!Number.isFinite(value)) return hist;
  const prev = hist.length ? hist[hist.length - 1] : value;
  const v = prev + (value - prev) * ease;
  return (hist.length ? [...hist, v] : [v, v]).slice(-len);
}

/** How many rows of height `rowH` (separated by `gap`) fit in `h`; always at least one. */
export const fitRows = (h: number, rowH: number, gap = 0): number => Math.max(1, Math.floor((h + gap) / (rowH + gap)));

/**
 * The grid of `n` items (each `aspect` wide per 1 tall, `gap` apart) in w×h that makes them biggest:
 * `cell` is the item's width. The last row is short when `n` does not fill it (the view centres it).
 */
export function fitGrid(n: number, w: number, h: number, { aspect = 1, gap = 0 }: { aspect?: number; gap?: number } = {}): { cols: number; rows: number; cell: number } {
  let best = { cols: 0, rows: 0, cell: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cell = Math.max(0, Math.min((w - (cols - 1) * gap) / cols, ((h - (rows - 1) * gap) / rows) * aspect));
    if (cell > best.cell || best.cols === 0) best = { cols, rows, cell };
  }
  return best;
}

/** `fitRows` for use in a widget body; stateless, so safe to call from any render branch. */
export const useFitRows = (h: number, rowH: number, gap = 0): number => fitRows(h, rowH, gap);

/** The default rolling history length (samples); a smooth graph keeps this width while a history fills. */
export const HISTORY_LEN = 48;

// Rolling history, eased (EMA) so graphs glide instead of jitter. ease 1 = raw.
export function useHistory(value: number, len = HISTORY_LEN, ease = 0.45): number[] {
  const ref = useRef<number[]>([]);
  const last = useRef<number | undefined>(undefined);
  if (Number.isFinite(value) && value !== last.current) {
    ref.current = easeHistory(ref.current, value, len, ease);
    last.current = value;
  }
  return ref.current;
}
