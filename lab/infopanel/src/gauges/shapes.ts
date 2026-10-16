/**
 * The gauge creator's later parts (L13), as geometry: the liquid and grid
 * shapes, decorative rings around an arc, a pattern over a bar's fill, a row
 * of icons instead of a bar, and an icon in the middle. Colours follow the
 * fill modes as the arc and bar do; motion (a drifting wave or pattern) is
 * drawn live only, so baked frames stay still.
 */
import { arcPath, circlePath, clamp, fmt, roundedRectPath } from "./geom.ts";
import {
  isGaugeIcon, placeColor, type CentreIcon, type Checks, type Grid, type IconRow, type Liquid, type Pattern, type Prim, type Rings, type VectorGauge,
} from "./vector.ts";

export const DEFAULT_LIQUID: Liquid = { container: "circle", radius: 16, inset: 4, amplitude: 6, waves: 2, speed: 3 };
export const DEFAULT_GRID: Grid = { rows: 5, cols: 10, order: "rows", cell: "rounded" };
export const DEFAULT_RINGS: Rings = { count: 3, spacing: 6, width: 2, color: "muted", opacity: 0.5 };
export const DEFAULT_PATTERN: Pattern = { style: "stripes", color: "#FFFFFF", opacity: 0.25, size: 12, speed: 0 };
export const DEFAULT_ICONS: IconRow = { name: "heart", count: 5, progressive: true };
export const DEFAULT_ICON: CentreIcon = { name: "cpu", size: 40, color: "muted", y: 0.32 };

const glowing = (g: VectorGauge, prim: Prim): Prim => ((g.glow ?? 0) > 0 ? { ...prim, glow: true } : prim);
const trackOf = (g: VectorGauge, prim: Prim): Prim => (g.trackOpacity !== undefined ? { ...prim, opacity: g.trackOpacity } : prim);

/* ---- liquid ---- */

/** The container (filled with the track) and the liquid clipped to it, its surface at the value. */
export function liquidPrims(g: VectorGauge, p: number): Prim[] {
  const l = g.liquid ?? DEFAULT_LIQUID;
  const circle = l.container === "circle";
  const size = Math.min(g.width, g.height);
  // The container: a centred circle, or the whole frame less a pixel.
  const box = circle ? { x: (g.width - size) / 2 + 1, y: (g.height - size) / 2 + 1, w: size - 2, h: size - 2 } : { x: 1, y: 1, w: g.width - 2, h: g.height - 2 };
  const shape = (inset: number) =>
    circle
      ? circlePath(g.width / 2, g.height / 2, Math.max(1, box.w / 2 - inset))
      : roundedRectPath(box.x + inset, box.y + inset, Math.max(1, box.w - 2 * inset), Math.max(1, box.h - 2 * inset), Math.max(0, l.radius - inset));
  const out: Prim[] = [];
  if (g.track) out.push(trackOf(g, { kind: "path", d: shape(0), fill: g.track }));
  if (p <= 0) return out;

  const inset = clamp(l.inset, 0, Math.min(box.w, box.h) / 2 - 1);
  const [top, bottom, left, width] = [box.y + inset, box.y + box.h - inset, box.x + inset, box.w - 2 * inset];
  const a = clamp(l.amplitude, 0, (bottom - top) / 4);
  // From just under the bottom (crests hidden) to just over the top (troughs hidden).
  const level = bottom + a - p * (bottom - top + 2 * a);
  const wave = width / Math.max(1, l.waves);
  // One extra wave each side, so a drift of one wave never shows an edge.
  const x0 = left - wave;
  const halves = Math.ceil((width + 2 * wave) / (wave / 2));
  let d = `M${fmt(x0)} ${fmt(level)}`;
  if (a > 0) {
    d += `Q${fmt(x0 + wave / 4)} ${fmt(level - 2 * a)} ${fmt(x0 + wave / 2)} ${fmt(level)}`;
    for (let i = 2; i <= halves; i++) d += `T${fmt(x0 + (i * wave) / 2)} ${fmt(level)}`;
  } else d += `H${fmt(x0 + (halves * wave) / 2)}`;
  d += `V${fmt(bottom + 1)}H${fmt(x0)}Z`;
  const liquid: Prim = { kind: "path", d, fill: placeColor(g, p * 100) };
  out.push(glowing(g, { kind: "group", clip: shape(inset), children: [liquid], ...(l.speed > 0 && a > 0 ? { drift: { dx: wave, dy: 0, seconds: l.speed } } : {}) }));
  return out;
}

/* ---- grid ---- */

/** Square cells, centred, lit in order from the bottom left (from the other end when reversed). */
export function gridPrims(g: VectorGauge, p: number): Prim[] {
  const grid = g.grid ?? DEFAULT_GRID;
  const [rows, cols] = [Math.round(grid.rows), Math.round(grid.cols)];
  const n = rows * cols;
  const gap = clamp(g.gap, 0, Math.min(g.width / cols, g.height / rows) - 1);
  const cell = Math.max(1, Math.min((g.width - 2 - gap * (cols - 1)) / cols, (g.height - 2 - gap * (rows - 1)) / rows));
  const x0 = (g.width - (cols * cell + (cols - 1) * gap)) / 2;
  const y0 = (g.height - (rows * cell + (rows - 1) * gap)) / 2;
  const r = grid.cell === "circle" ? cell / 2 : grid.cell === "rounded" ? cell * 0.2 : 0;
  const count = Math.round(p * n);
  const out: Prim[] = [];
  for (let k = 0; k < n; k++) {
    const [row, col] = grid.order === "columns" ? [k % rows, Math.floor(k / rows)] : [Math.floor(k / cols), k % cols];
    const x = x0 + col * (cell + gap);
    const y = y0 + (rows - 1 - row) * (cell + gap);
    const lit = g.reverse ? k >= n - count : k < count;
    const at = (((g.reverse ? n - 1 - k : k) + 0.5) / n) * 100;
    if (lit) out.push(glowing(g, { kind: "rect", x, y, w: cell, h: cell, r, fill: placeColor(g, at) }));
    else if (g.track) out.push(trackOf(g, { kind: "rect", x, y, w: cell, h: cell, r, fill: g.track }));
  }
  return out;
}

/* ---- arc rings ---- */

/** Rings over the arc's span outside it (and its ticks), fading outwards. */
export function ringPrims(g: VectorGauge, a: { cx: number; cy: number; r: number; sweep: number }): Prim[] {
  const rings = g.rings!;
  const base = a.r + g.thickness / 2 + (g.ticks ? g.ticks.length + 2 : 0);
  return Array.from({ length: Math.round(rings.count) }, (_, i) => ({
    kind: "path" as const,
    d: arcPath(a.cx, a.cy, base + rings.spacing * (i + 1), g.start, g.start + a.sweep),
    stroke: rings.color,
    width: rings.width,
    cap: "butt" as const,
    opacity: clamp(rings.opacity * (1 - i / rings.count), 0, 1),
  }));
}

/* ---- bar icons ---- */

/**
 * Icons along the bar, one per slot: each drawn in the track colour, then in its fill colour clipped to
 * the lit part of its box (progressive), or whole when lit.
 */
export function iconRowPrims(g: VectorGauge, p: number, b: { length: number; across: number; offset: number; vertical: boolean }): Prim[] {
  const row = g.icons!;
  const n = Math.round(row.count);
  const slot = b.length / n;
  const size = Math.max(1, Math.min(b.across, slot * 0.9));
  const lit = row.progressive ? p * n : Math.round(p * n);
  const out: Prim[] = [];
  for (let i = 0; i < n; i++) {
    // Slot i in fill order; along the bar from its start (bottom when vertical), reversed from the end.
    const along = 1 + (g.reverse ? n - 1 - i : i) * slot + slot / 2;
    const [x, y] = b.vertical ? [b.offset + b.across / 2, g.height - along] : [along, b.offset + b.across / 2];
    const icon = (color: string): Prim => ({ kind: "icon", name: row.name, x, y, size, color });
    if (g.track) out.push(trackOf(g, icon(g.track)));
    const f = clamp(lit - i, 0, 1);
    if (f <= 0) continue;
    const color = placeColor(g, ((i + 0.5) / n) * 100);
    if (f >= 1) {
      out.push(glowing(g, icon(color)));
      continue;
    }
    // The lit part of the icon's box, from the side the fill comes from (stroke overhang included).
    const pad = size * 0.1;
    const [bx, by, bs] = [x - size / 2 - pad, y - size / 2 - pad, size + 2 * pad];
    const cut = bs * f;
    const clip = b.vertical
      ? g.reverse ? roundedRectPath(bx, by, bs, cut, 0) : roundedRectPath(bx, by + bs - cut, bs, cut, 0)
      : g.reverse ? roundedRectPath(bx + bs - cut, by, cut, bs, 0) : roundedRectPath(bx, by, cut, bs, 0);
    out.push(glowing(g, { kind: "group", clip, children: [icon(color)] }));
  }
  return out;
}

/* ---- centre icon ---- */

export function centreIcon(g: VectorGauge): Prim {
  const c = g.icon!;
  return { kind: "icon", name: c.name, x: g.width / 2, y: g.height * c.y, size: c.size, color: c.color };
}

/* ---- specs ---- */

/** The shape parts from untrusted JSON, each kept only when given (older specs gain none). */
export function normalizeShapeParts(o: Record<string, unknown>, c: Checks): Partial<VectorGauge> {
  const liquid = c.obj(o.liquid);
  const grid = c.obj(o.grid);
  const rings = c.obj(o.rings);
  const pattern = c.obj(o.pattern);
  const icons = c.obj(o.icons);
  const icon = c.obj(o.icon);
  const d = { liquid: DEFAULT_LIQUID, grid: DEFAULT_GRID, rings: DEFAULT_RINGS, pattern: DEFAULT_PATTERN, icons: DEFAULT_ICONS, icon: DEFAULT_ICON };
  const pick = <T extends string>(v: unknown, values: readonly T[], def: T): T => (values.includes(v as T) ? (v as T) : def);
  const int = (v: unknown, def: number, lo: number, hi: number) => Math.round(c.num(v, def, lo, hi));
  return {
    ...(liquid
      ? {
          liquid: {
            container: pick(liquid.container, ["circle", "rect"], d.liquid.container), radius: c.num(liquid.radius, d.liquid.radius, 0, 1024),
            inset: c.num(liquid.inset, d.liquid.inset, 0, 256), amplitude: c.num(liquid.amplitude, d.liquid.amplitude, 0, 64),
            waves: c.num(liquid.waves, d.liquid.waves, 0.5, 8), speed: c.num(liquid.speed, d.liquid.speed, 0, 30),
          },
        }
      : {}),
    ...(grid
      ? {
          grid: {
            rows: int(grid.rows, d.grid.rows, 1, 32), cols: int(grid.cols, d.grid.cols, 1, 32),
            order: pick(grid.order, ["rows", "columns"], d.grid.order), cell: pick(grid.cell, ["square", "rounded", "circle"], d.grid.cell),
          },
        }
      : {}),
    ...(rings
      ? {
          rings: {
            count: int(rings.count, d.rings.count, 1, 8), spacing: c.num(rings.spacing, d.rings.spacing, 1, 64), width: c.num(rings.width, d.rings.width, 0.5, 32),
            color: c.color(rings.color, d.rings.color), opacity: c.num(rings.opacity, d.rings.opacity, 0, 1),
          },
        }
      : {}),
    ...(pattern
      ? {
          pattern: {
            style: pick(pattern.style, ["stripes", "dots", "chevrons"], d.pattern.style), color: c.color(pattern.color, d.pattern.color),
            opacity: c.num(pattern.opacity, d.pattern.opacity, 0, 1), size: c.num(pattern.size, d.pattern.size, 4, 256), speed: c.num(pattern.speed, d.pattern.speed, 0, 30),
          },
        }
      : {}),
    ...(icons
      ? { icons: { name: isGaugeIcon(icons.name) ? icons.name : d.icons.name, count: int(icons.count, d.icons.count, 1, 20), progressive: typeof icons.progressive === "boolean" ? icons.progressive : d.icons.progressive } }
      : {}),
    ...(icon
      ? { icon: { name: isGaugeIcon(icon.name) ? icon.name : d.icon.name, size: c.num(icon.size, d.icon.size, 4, 1024), color: c.color(icon.color, d.icon.color), y: c.num(icon.y, d.icon.y, 0, 1) } }
      : {}),
  };
}
