/**
 * InfoPanel's drawing geometry as SVG paths and paints, ported from
 * `Drawing/PanelDraw.cs` (shapes), `Drawing/GraphDraw.cs` (bar, graph, donut),
 * `Drawing/SkiaGraphics.cs` (donut pies, gradients) and
 * `Models/GaugeDisplayItem.cs` (frame choice), InfoPanel d3fe32c.
 *
 * C# integer arithmetic is kept where InfoPanel uses it: `(int)` truncates,
 * `/` between ints divides with truncation, Math.Round is half-to-even unless
 * AwayFromZero is named.
 */
import type { GRADIENT_TYPES, SHAPE_TYPES } from "../schema.ts";

/** C# `(int)x` for a double on .NET 8 x64: truncation; NaN and out-of-range give int.MinValue. */
export function toInt(x: number): number {
  return Number.isFinite(x) && Math.abs(x) < 2 ** 31 ? Math.trunc(x) : -(2 ** 31);
}
/** `Math.Round(x)`: half to even. */
export function roundHalfEven(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  return d > 0.5 || (d === 0.5 && f % 2 !== 0) ? f + 1 : f;
}
/** `Math.Round(x, 0, MidpointRounding.AwayFromZero)`. */
export const roundAway = (x: number) => Math.sign(x) * Math.floor(Math.abs(x) + 0.5);
/** C# int division. */
const idiv = (a: number, b: number) => Math.trunc(a / b);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/* ---------------- paths ---------------- */

const n = (x: number) => String(+x.toFixed(3));
export type Point = readonly [number, number];

export const polygon = (pts: readonly Point[]) => `M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join("L")}Z`;
export const rectPath = (l: number, t: number, r: number, b: number) => polygon([[l, t], [r, t], [r, b], [l, b]]);

/** SKRoundRect: radii that do not fit are scaled down to fit, both axes alike. */
export function roundRectPath(l: number, t: number, r: number, b: number, radius: number): string {
  const w = r - l;
  const h = b - t;
  if (w <= 0 || h <= 0) return "";
  const k = Math.min(Math.max(radius, 0), w / 2, h / 2);
  if (k <= 0) return rectPath(l, t, r, b);
  const a = (x: number, y: number) => `A${n(k)} ${n(k)} 0 0 1 ${n(x)} ${n(y)}`;
  return (
    `M${n(l + k)} ${n(t)}H${n(r - k)}${a(r, t + k)}V${n(b - k)}${a(r - k, b)}` +
    `H${n(l + k)}${a(l, b - k)}V${n(t + k)}${a(l + k, t)}Z`
  );
}

export function ellipsePath(x: number, y: number, w: number, h: number): string {
  const rx = w / 2;
  const ry = h / 2;
  const cy = y + ry;
  return `M${n(x)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 1 ${n(x + w)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 1 ${n(x)} ${n(cy)}Z`;
}

const circle = (cx: number, cy: number, r: number, clockwise: boolean) => {
  const s = clockwise ? 1 : 0;
  return `M${n(cx + r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 ${s} ${n(cx - r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 ${s} ${n(cx + r)} ${n(cy)}Z`;
};
/** A ring: outer circle clockwise, inner counter-clockwise (nonzero fill leaves the hole). */
export const ringPath = (cx: number, cy: number, outer: number, inner: number) =>
  circle(cx, cy, outer, true) + (inner > 0 ? circle(cx, cy, inner, false) : "");

const polar = (cx: number, cy: number, r: number, deg: number): Point => [
  cx + r * Math.cos((deg * Math.PI) / 180),
  cy + r * Math.sin((deg * Math.PI) / 180),
];
/** An arc from `start` sweeping `sweep` degrees (clockwise when positive, y down), |sweep| < 360. */
function arc(cx: number, cy: number, r: number, start: number, sweep: number, move: boolean): string {
  const [x0, y0] = polar(cx, cy, r, start);
  const [x1, y1] = polar(cx, cy, r, start + sweep);
  const head = move ? `M${n(x0)} ${n(y0)}` : `L${n(x0)} ${n(y0)}`;
  return `${head}A${n(r)} ${n(r)} 0 ${Math.abs(sweep) > 180 ? 1 : 0} ${sweep > 0 ? 1 : 0} ${n(x1)} ${n(y1)}`;
}

/** SkiaGraphics.FillPie: outer arc, then the inner arc back, closed. */
export const piePath = (cx: number, cy: number, outer: number, inner: number, start: number, sweep: number) =>
  arc(cx, cy, outer, start, sweep, true) + arc(cx, cy, inner, start + sweep, -sweep, false) + "Z";

/* ---------------- paints ---------------- */

export interface Stop {
  offset: number;
  color: string;
}
export type Paint =
  | { kind: "solid"; color: string }
  | { kind: "linear"; x1: number; y1: number; x2: number; y2: number; stops: Stop[] }
  | { kind: "radial"; cx: number; cy: number; r: number; stops: Stop[] }
  /** Skia sweep gradient as a CSS conic gradient: `from` is degrees clockwise from 12 o'clock. */
  | { kind: "conic"; cx: number; cy: number; from: number; stops: Stop[] }
  /** Two linear gradients composed with Multiply. */
  | { kind: "diamond"; a: Extract<Paint, { kind: "linear" }>; b: Extract<Paint, { kind: "linear" }> };

export type GradientType = (typeof GRADIENT_TYPES)[number];

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export function boundsOf(pts: readonly Point[]): Bounds {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

const stops = (colors: string[], offsets: number[]): Stop[] => colors.map((color, i) => ({ color, offset: offsets[i] }));
const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * SkiaGraphics.CreateGradient over the path's bounds. `third` is GradientColor2
 * (InfoPanel falls back to `color` when it is null).
 */
export function gradientPaint(b: Bounds, color: string, gradient: string, third: string, angle: number, type: GradientType): Paint {
  const cx = (b.left + b.right) / 2;
  const cy = (b.top + b.bottom) / 2;
  const w = b.right - b.left;
  const h = b.bottom - b.top;
  const half = Math.sqrt(w * w + h * h) / 2;
  const line = (deg: number, s: Stop[]): Extract<Paint, { kind: "linear" }> => {
    const dx = Math.cos(rad(deg)) * half;
    const dy = Math.sin(rad(deg)) * half;
    return { kind: "linear", x1: cx - dx, y1: cy - dy, x2: cx + dx, y2: cy + dy, stops: s };
  };
  switch (type) {
    case "Linear":
      return line(90 - angle, stops([color, gradient, third], [0, 0.5, 1]));
    case "Sweep":
      // Skia's sweep starts at 3 o'clock; InfoPanel rotates it by angle - 90.
      return { kind: "conic", cx, cy, from: angle, stops: stops([color, gradient, third, color], [0, 0.33, 0.67, 1]) };
    case "Radial": {
      const pulse = (Math.sin(rad(angle)) + 1) / 2;
      const p1 = Math.min(0.3 * pulse * 1.2, 1);
      const p2 = Math.min(0.6 * pulse * 1.1, 1);
      return { kind: "radial", cx, cy, r: Math.max(w, h) * (0.8 + 0.5 * pulse), stops: stops([color, gradient, third, third], [0, p1, p2, 1]) };
    }
    case "Diamond": {
      const s = stops([third, gradient, color, gradient, third], [0, 0.25, 0.5, 0.75, 1]);
      return { kind: "diamond", a: line(angle, s), b: line(angle + 90, s) };
    }
    case "Reflected":
      return line(angle, stops([color, gradient, third, gradient, color], [0, 0.25, 0.5, 0.75, 1]));
    case "Spiral": {
      const cycle = [color, gradient, third];
      const s = Array.from({ length: 10 }, (_, i) => ({ color: cycle[i % 3], offset: i / 9 }));
      return { kind: "conic", cx, cy, from: 90 + angle, stops: s };
    }
  }
}

/* ---------------- shapes (PanelDraw.cs:397-635) ---------------- */

export type ShapeType = (typeof SHAPE_TYPES)[number];

export interface ShapeGeometry {
  d: string;
  /** Rotation pivot: `x + width / 2` in ints. */
  cx: number;
  cy: number;
  /** The points Skia's path bounds come from, before rotation (curves: their control points). */
  points: Point[];
}

export function shapeGeometry(type: ShapeType, x: number, y: number, width: number, height: number, cornerRadius: number): ShapeGeometry {
  const cx = x + idiv(width, 2);
  const cy = y + idiv(height, 2);
  const corners: Point[] = [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
  const regular = (count: number, step: number, radii: (i: number) => number = () => 1) => {
    const sx = idiv(width, 2);
    const sy = idiv(height, 2);
    return Array.from({ length: count }, (_, i): Point => {
      const a = rad(i * step - 90);
      return [cx + radii(i) * sx * Math.cos(a), cy + radii(i) * sy * Math.sin(a)];
    });
  };
  const poly = (points: Point[]): ShapeGeometry => ({ d: polygon(points), cx, cy, points });
  switch (type) {
    case "Rectangle":
      return { d: rectPath(x, y, x + width, y + height), cx, cy, points: corners };
    case "Capsule":
      return { d: roundRectPath(x, y, x + width, y + height, cornerRadius), cx, cy, points: corners };
    case "Ellipse":
      return { d: ellipsePath(x, y, width, height), cx, cy, points: corners };
    case "Triangle":
      return poly([[cx, y], [x, y + height], [x + width, y + height]]);
    case "Star":
      return poly(regular(10, 36, (i) => (i % 2 === 0 ? 1 : 0.382)));
    case "Pentagon":
      return poly(regular(5, 72));
    case "Hexagon":
      return poly(regular(6, 60));
    case "Octagon":
      return poly(regular(8, 45));
    case "Plus": {
      const t = idiv(Math.min(width, height), 3);
      const hy = cy - idiv(t, 2);
      const vx = cx - idiv(t, 2);
      return poly([
        [vx, y], [vx + t, y], [vx + t, hy], [x + width, hy], [x + width, hy + t], [vx + t, hy + t],
        [vx + t, y + height], [vx, y + height], [vx, hy + t], [x, hy + t], [x, hy], [vx, hy],
      ]);
    }
    case "Arrow": {
      const head = Math.fround(height * 0.4);
      return poly([
        [cx, y], [x + width, y + head], [x + width * 0.75, y + head], [x + width * 0.75, y + height],
        [x + width * 0.25, y + height], [x + width * 0.25, y + head], [x, y + head],
      ]);
    }
    case "Trapezoid": {
      const inset = width * 0.2;
      return poly([[x + inset, y], [x + width - inset, y], [x + width, y + height], [x, y + height]]);
    }
    case "Parallelogram": {
      const skew = width * 0.25;
      return poly([[x + skew, y], [x + width, y], [x + width - skew, y + height], [x, y + height]]);
    }
  }
}

export function rotatePoints(points: readonly Point[], deg: number, cx: number, cy: number): Point[] {
  if (deg === 0) return [...points];
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return points.map(([x, y]): Point => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}

/** ShapeDisplayItem.GetGradientAnimationOffset: note the base GradientAngle is not added when animating. */
export function gradientAngle(angle: number, speed: number, elapsedSeconds: number): number {
  if (speed === 0) return angle;
  let offset = elapsedSeconds * speed;
  if (angle < 0) offset = -offset;
  let a = toInt(offset) % 360;
  if (a < 0) a += 360;
  return a;
}

/* ---------------- charts (GraphDraw.cs) ---------------- */

/**
 * ResolveAutoRange on its first frame: the samples' range, or the item's own when
 * the window is flat. (Later frames contract it gradually; not modelled.)
 */
export function autoRange(samples: readonly number[], min: number, max: number, auto: boolean): [number, number] {
  if (!auto || samples.length === 0) return [min, max];
  const lo = Math.min(...samples);
  const hi = Math.max(...samples);
  return hi - lo < 1e-6 ? [min, max] : [lo, hi];
}

/** One drawing step inside a chart's own W×H bitmap. */
export type ChartPart =
  | { op: "fill"; d: string; paint: Paint }
  | { op: "stroke"; d: string; paint: Paint; width: number };

const solid = (color: string): Paint => ({ kind: "solid", color });

export interface BarInput {
  width: number;
  height: number;
  value: number | null;
  min: number;
  max: number;
  cornerRadius: number;
  frame: boolean;
  frameColor: string;
  background: boolean;
  backgroundColor: string;
  color: string;
  gradient: boolean;
  gradientColor: string;
}

/** Bar fill length in px: round(clamp(norm) × the longer side). */
export function barLength(value: number, min: number, max: number, width: number, height: number): number {
  const scale = max - min;
  const v = scale <= 0 ? 0 : clamp((value - min) / scale, 0, 1);
  return roundAway(v * Math.max(width, height));
}

export function barParts(b: BarInput): ChartPart[] {
  const v = barLength(b.value ?? 0, b.min, b.max, b.width, b.height);
  let [l, t, r, bottom, radius] = [0, 0, b.width, b.height, b.cornerRadius];
  if (b.frame) {
    l = Math.min(l + 1, r);
    t = Math.min(t + 1, bottom);
    r = Math.max(r - 1, l);
    bottom = Math.max(bottom - 1, t);
    radius = Math.max(0, radius - 1);
  }
  const fill: Bounds =
    b.height > b.width
      ? { left: l, top: bottom - Math.min(v, bottom - t), right: r, bottom }
      : { left: l, top: t, right: l + Math.min(v, r - l), bottom };

  const parts: ChartPart[] = [];
  if (b.background) parts.push({ op: "fill", d: roundRectPath(l, t, r, bottom, radius), paint: solid(b.backgroundColor) });
  if (v > 0) {
    const paint = b.gradient ? gradientPaint(fill, b.color, b.color, b.gradientColor, 90, "Linear") : solid(b.color);
    parts.push({ op: "fill", d: roundRectPath(fill.left, fill.top, fill.right, fill.bottom, radius), paint });
  }
  if (b.frame) {
    const d = roundRectPath(0.5, 0.5, b.width - 0.5, b.height - 0.5, Math.max(0, b.cornerRadius - 0.5));
    parts.push({ op: "stroke", d, paint: solid(b.frameColor), width: 1 });
  }
  return parts;
}

export interface GraphInput {
  type: "LINE" | "HISTOGRAM";
  width: number;
  height: number;
  /** Samples, oldest first (InfoPanel's queue order). */
  samples: readonly number[];
  min: number;
  max: number;
  auto: boolean;
  thickness: number;
  step: number;
  fill: boolean;
  fillColor: string;
  color: string;
  frame: boolean;
  frameColor: string;
  background: boolean;
  backgroundColor: string;
}

/**
 * The graph's parts. Note the drawing order of the window: its oldest sample
 * lands on the right edge and the newest furthest left. No samples: nothing at all.
 */
export function graphParts(g: GraphInput): ChartPart[] {
  if (g.samples.length === 0) return [];
  const parts: ChartPart[] = [];
  const { width: W, height: H, thickness: T } = g;
  const step = Math.max(g.step, 1);
  if (g.background) parts.push({ op: "fill", d: rectPath(0, 0, W, H), paint: solid(g.backgroundColor) });

  if (g.type === "LINE") {
    let size = idiv(W, step);
    size += size * g.step !== W ? 2 : 1;
    size = Math.min(size, g.samples.length);
    if (size > 0) {
      const values = g.samples.slice(g.samples.length - size);
      const [min, max] = autoRange(values, g.min, g.max, g.auto);
      let d = `M${W + T} ${H + T}`;
      let lastX = 0;
      for (let i = 0; i < size; i++) {
        let v = Math.min(Math.max(values[i] - min, 0), max);
        v = max - min <= 0 ? 0 : v / (max - min);
        v = roundAway(v * (H - T));
        lastX = W - i * g.step;
        d += `L${lastX} ${toInt(H - (v + T / 2))}`;
      }
      d += `L${lastX - T} ${H + T}`;
      if (g.fill) parts.push({ op: "fill", d, paint: solid(g.fillColor) });
      parts.push({ op: "stroke", d, paint: solid(g.color), width: T });
    }
  } else {
    const pen = 1;
    const offset = T + step + pen * 2;
    let size = idiv(W, offset);
    if (size * g.step !== W) size += 1;
    size = Math.min(size, g.samples.length);
    if (size > 0) {
      const values = g.samples.slice(g.samples.length - size);
      const [min, max] = autoRange(values, g.min, g.max, g.auto);
      const maxHeight = Math.max(H - 3, 1);
      let left = W - T - pen * 2;
      for (let i = 0; i < size; i++) {
        const scale = max - min;
        const v = scale <= 0 ? 0 : (clamp(values[i] - min, 0, max) / scale) * maxHeight;
        const h = roundAway(v);
        const d = rectPath(left, H - h - pen, left + T, H - pen);
        if (g.fill) parts.push({ op: "fill", d, paint: solid(g.fillColor) });
        parts.push({ op: "stroke", d, paint: solid(g.color), width: pen });
        left -= offset;
      }
    }
  }
  if (g.frame) parts.push({ op: "stroke", d: rectPath(0.5, 0.5, W - 0.5, H - 0.5), paint: solid(g.frameColor), width: 1 });
  return parts;
}

export interface DonutInput {
  width: number;
  /** The newest sample; InfoPanel's donut ignores ValueType. */
  value: number;
  min: number;
  max: number;
  thickness: number;
  span: number;
  color: string;
  background: boolean;
  backgroundColor: string;
  frame: boolean;
  frameColor: string;
}

/** The filled percentage, truncated to an int as FillDonut receives it. */
export function donutPercent(value: number, min: number, max: number): number {
  const scale = max - min;
  const v = scale <= 0 ? 0 : clamp((value - min) / scale, 0, 1);
  return clamp(toInt(v * 100), 0, 100);
}

/** GraphDraw donut + SkiaGraphics.FillDonut: starts at 3 o'clock, clockwise; the item's Rotation turns the bitmap. */
export function donutParts(dn: DonutInput): ChartPart[] {
  const radius = idiv(dn.width, 2) - 1;
  const thickness = clamp(dn.thickness, 0, radius);
  const inner = radius - thickness;
  const c = 1 + radius;
  const pct = donutPercent(dn.value, dn.min, dn.max);
  const span = dn.span;
  const parts: ChartPart[] = [];
  const ring = (o: number, i: number) => ringPath(c, c, o, Math.max(0, i));

  if (dn.background) {
    parts.push({ op: "fill", d: span === 360 ? ring(radius, inner) : piePath(c, c, radius, inner, 0, span), paint: solid(dn.backgroundColor) });
  }
  if (pct > 0) {
    const d = span === 360 && pct === 100 ? ring(radius, inner) : piePath(c, c, radius, inner, 0, (pct * span) / 100);
    parts.push({ op: "fill", d, paint: solid(dn.color) });
  }
  if (dn.frame) {
    const stroke = 1;
    if (span === 360) {
      parts.push({ op: "fill", d: ring(radius, radius - stroke), paint: solid(dn.frameColor) });
      parts.push({ op: "fill", d: ring(inner + stroke, inner), paint: solid(dn.frameColor) });
    } else {
      const o = radius - stroke / 2;
      const i = inner + stroke / 2;
      const [a, b] = [polar(c, c, i, 0), polar(c, c, o, 0)];
      const [e, f] = [polar(c, c, i, span), polar(c, c, o, span)];
      const d =
        arc(c, c, o, 0, span, true) + arc(c, c, i, 0, span, true) +
        `M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}M${n(e[0])} ${n(e[1])}L${n(f[0])} ${n(f[1])}`;
      parts.push({ op: "stroke", d, paint: solid(dn.frameColor), width: stroke });
    }
  }
  return parts;
}

/**
 * GaugeDisplayItem.EvaluateImageFrame without animation: the frame for a value,
 * `(int)Math.Round(percent / step)` clamped. No reading: the first frame.
 */
export function gaugeFrame(count: number, value: number | null, min: number, max: number): number {
  if (count <= 1 || value === null) return 0;
  const step = 100 / (count - 1);
  const percent = ((value - min) / (max - min)) * 100;
  return clamp(toInt(roundHalfEven(percent / step)), 0, count - 1);
}

/**
 * GaugeDisplayItem.EvaluateImageFrame's smoothing: the shown index moves toward
 * the target at `speed` frames per second (0: at once). Between two frames
 * InfoPanel draws the lower one and the upper one over it at the fraction.
 */
export function smoothIndex(current: number, target: number, speed: number, seconds: number, count: number): number {
  if (!(speed > 0) || !(seconds > 0)) return target;
  const maxStep = speed * seconds;
  const diff = target - current;
  const next = Math.abs(diff) <= maxStep ? target : current + Math.sign(diff) * maxStep;
  return Math.min(Math.max(next, 0), count - 1);
}
