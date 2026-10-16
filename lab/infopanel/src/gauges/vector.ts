/**
 * Vector gauges (L7, L10): a gauge described by a small spec and drawn as SVG
 * at any value, instead of a fixed image per step. Ideas from the user's gauge
 * creator (arc and bar shapes, segments, colour zones and gradients, needles,
 * ticks and labels, value text, glow), rewritten as pure geometry so the same
 * shapes draw live in the studio and bake into InfoPanel's image frames.
 *
 * Angles are degrees clockwise from 12 o'clock. A fill's colour position is
 * over the whole range (0–100 %), never over the filled part, so a colour sits
 * at the same place whatever the value.
 *
 * Shaped for the app's widgets: colours can be theme colours (the widget
 * tokens `--accent`, `--w-warn`, …), a threshold fill matches the widgets'
 * ok / warn / crit tone, and the scale uses their min, max, unit and decimals.
 * Every part added after L7 is optional, so older specs read and bake as before.
 */
import { arcPath, circlePath, clamp, fmt, polar, type ContainerShape } from "./geom.ts";
export type { ContainerShape } from "./geom.ts";
import { arcNeedle, arcTicks, backgroundPrims, barTicks, scaleOf, valueText } from "./parts.ts";
import { centreIcon, gridPrims, iconRowPrims, liquidPrims, normalizeShapeParts, ringPrims } from "./shapes.ts";

export { arcPath } from "./geom.ts";

export interface ColorStop {
  /** 0–100 % of the range. */
  at: number;
  /** #RRGGBB (stops are interpolated, so no theme colours). */
  color: string;
}

export type FillMode = "solid" | "gradient" | "zones" | "thresholds";

/** The app's widget colours (src/widgets/core/theme.ts), with the dark-surface value used when baking. */
export const THEME = {
  accent: { label: "Accent", css: "var(--accent, #34D399)", hex: "#34D399" },
  warn: { label: "Warning", css: "var(--w-warn, #EDB232)", hex: "#EDB232" },
  crit: { label: "Critical", css: "var(--w-crit, #F2665E)", hex: "#F2665E" },
  fg: { label: "Text", css: "var(--w-fg, #F4F4F5)", hex: "#F4F4F5" },
  muted: { label: "Muted text", css: "var(--w-muted, #A1A1AA)", hex: "#A1A1AA" },
  track: { label: "Track", css: "var(--w-track, rgba(255,255,255,.07))", hex: "rgba(255,255,255,.07)" },
} as const;
export type ThemeColor = keyof typeof THEME;

/** A colour: #RRGGBB, or a theme colour name that follows the dashboard theme. */
export type Paint = string;
export type PaintMode = "live" | "bake";

const HEX = /^#[0-9a-f]{6}$/i;
export const isThemeColor = (v: unknown): v is ThemeColor => typeof v === "string" && Object.hasOwn(THEME, v);
export const isPaint = (v: unknown): v is Paint => isThemeColor(v) || (typeof v === "string" && HEX.test(v));
/** Live: the theme variable (with its default); bake: a fixed colour. Anything that is not a colour draws black. */
export const resolvePaint = (p: Paint, mode: PaintMode) => (isThemeColor(p) ? THEME[p][mode === "live" ? "css" : "hex"] : HEX.test(p) ? p : "#000000");

/** The value range the labels and value text show (the widgets' min, max, unit and decimals). */
export interface Scale {
  min: number;
  max: number;
  unit: string;
  /** null: automatic (one decimal below 10, as the widgets do). */
  decimals: number | null;
}

export type NeedleStyle = "taper" | "line" | "arrow" | "blade";

export interface Ticks {
  /** Major ticks, ends included. */
  count: number;
  length: number;
  width: number;
  color: Paint;
  /** Minor ticks between two majors. */
  minor?: { count: number; length: number; width: number; color: Paint };
  /** The scale value at each major tick. */
  labels?: { size: number; color: Paint; font: string };
}

export interface ValueText {
  size: number;
  color: Paint;
  /** A font family installed where it is drawn; "" uses the default. */
  font: string;
  weight: number;
  /** Where its middle sits, 0–1 of the height. */
  y: number;
  /** `{value}` and `{unit}` are replaced. */
  format: string;
}

export interface Background {
  color: Paint | null;
  border: { color: Paint; width: number } | null;
  /** Bar corner radius, px (an arc's background is a disc). */
  radius: number;
}

export interface Shadow {
  blur: number;
  dx: number;
  dy: number;
  color: Paint;
  opacity: number;
}

/**
 * The icons a gauge can draw: the app's widget icon set (src/lib/widget-icons.ts, lucide), by name.
 * Kept here as names only so the spec stays plain data; vector-svg draws them.
 */
export const GAUGE_ICONS = [
  "activity", "bluetooth", "brain", "cpu", "gauge", "gamepad", "headphones", "heart", "leaf",
  "monitor", "moon", "music", "radio", "snowflake", "sun", "thermometer", "wifi", "zap",
] as const;
export type GaugeIcon = (typeof GAUGE_ICONS)[number];
export const isGaugeIcon = (v: unknown): v is GaugeIcon => typeof v === "string" && (GAUGE_ICONS as readonly string[]).includes(v);

/** Shape "liquid": a container filled to the value, with a wave on its surface. */
export interface Liquid {
  container: ContainerShape;
  /** Rect corner radius, px. */
  radius: number;
  /** Space between the container's edge and the liquid, px. */
  inset: number;
  /** Wave height, px; 0 is a flat surface. */
  amplitude: number;
  /** Waves across the container. */
  waves: number;
  /** Seconds for the wave to travel one wave, live only; 0 keeps it still. Baked frames are still. */
  speed: number;
  /** Bubbles rising to the surface (live; still, spread through the liquid, when baked). `speed`: seconds per rise. */
  bubbles?: { count: number; size: number; speed: number };
  /** A highlight along the surface, its opacity. */
  shine?: number;
}

/** Shape "grid": rows × columns of cells, lit from the bottom left. */
export interface Grid {
  rows: number;
  cols: number;
  /** "rows": along the bottom row first, then up (a level); "columns": up the first column, then right (a bar chart). */
  order: "rows" | "columns";
  cell: "square" | "rounded" | "circle";
  /** Light the cells in a stable shuffle, or from the middle out, instead of in order. */
  lights?: "random" | "radial";
  /** An outline on every cell. */
  border?: { color: Paint; width: number };
}

/** Arc: decorative rings outside it, fading outwards (the creator's multi-ring); the value does not drive them. */
export interface Rings {
  count: number;
  /** Distance between rings, px. */
  spacing: number;
  width: number;
  color: Paint;
  /** The innermost ring's opacity; each next one fades by an equal step. */
  opacity: number;
}

/** Bar: a pattern over the continuous fill. */
export interface Pattern {
  style: "stripes" | "dots" | "chevrons";
  color: Paint;
  opacity: number;
  /** Tile size, px. */
  size: number;
  /** Seconds per tile of travel along the fill, live only; 0 keeps it still. */
  speed: number;
}

/** Bar: a row of icons instead of the bar; each fills in turn. */
export interface IconRow {
  name: GaugeIcon;
  count: number;
  /** The icon at the value fills partly (clipped); else each icon is lit or not. */
  progressive: boolean;
}

/** An icon in the middle of the gauge. */
export interface CentreIcon {
  name: GaugeIcon;
  size: number;
  color: Paint;
  /** Where its middle sits, 0–1 of the height. */
  y: number;
}

export interface VectorGauge {
  /**
   * "svg": the user's own SVG (`template`), driven by the value; the arc and bar fields do not apply.
   * "liquid" and "grid" use `liquid` / `grid` with the track, fill, scale, text, icon, background and effects.
   */
  shape: "arc" | "bar" | "svg" | "liquid" | "grid";
  /** Frame size in px. */
  width: number;
  height: number;
  /** Arc: where the range starts, and how far it runs. */
  start: number;
  sweep: number;
  /** Bar: fills left to right, or bottom to top. */
  orientation: "horizontal" | "vertical";
  /** Arc stroke or bar thickness, px. */
  thickness: number;
  rounded: boolean;
  /** Bar: corner radius in px, instead of `rounded` (InfoPanel's CornerRadius). */
  radius?: number;
  /** 0: a continuous fill; else that many segments with `gap` between (degrees on an arc, px on a bar). */
  segments: number;
  gap: number;
  /** The unfilled range; null draws none. */
  track: Paint | null;
  trackOpacity?: number;
  /** `color` is the solid colour, and the ok colour of a threshold fill; `warn` and `crit` are scale values. */
  /** `over: "fill"`: a gradient spans the filled part (as InfoPanel's bar does), not the whole range. */
  fill: { mode: FillMode; color: Paint; stops: ColorStop[]; warn?: number; crit?: number; over?: "fill" };
  /** Arc: a needle from the centre; bar: a marker across the bar. */
  needle: { color: Paint; length: number; width: number; style?: NeedleStyle } | null;
  ticks: Ticks | null;
  /** Fills from the end of the range instead. */
  reverse: boolean;
  scale?: Scale;
  text?: ValueText;
  background?: Background;
  /** Glow around the fill, blur radius px. */
  glow?: number;
  shadow?: Shadow;
  liquid?: Liquid;
  grid?: Grid;
  rings?: Rings;
  pattern?: Pattern;
  icons?: IconRow;
  icon?: CentreIcon;
  /**
   * Shape "svg" only: the template, sanitized (svg-template.ts). It reads the value as the CSS custom
   * properties `--value` (0–1) and `--percent` (0–100, whole), set on its root element.
   */
  template?: string;
}

/** A template's size limit, so a library entry (1 MB of JSON) always holds one. */
export const MAX_TEMPLATE = 256 * 1024;

/** The value a template sees: reversed like the other shapes, rounded so equal values give equal markup. */
export function templateVars(g: VectorGauge, p: number): { value: number; percent: number } {
  const v = clamp(Number.isFinite(p) ? p : 0, 0, 1);
  const value = Math.round((g.reverse ? 1 - v : v) * 10000) / 10000;
  return { value, percent: Math.round(value * 100) };
}

/**
 * The template with the value set inline on its root element (inline style beats the template's own
 * defaults), for drawing it as an image. The root tag is the markup's first tag, as XMLSerializer writes it,
 * with attribute values in double quotes and `>` escaped.
 */
export function withValue(template: string, vars: { value: number; percent: number }): string {
  const decl = `--value:${vars.value};--percent:${vars.percent};`;
  return template.replace(/^<svg\b[^>]*?(?=\/?>)/, (tag) =>
    /\sstyle="/.test(tag) ? tag.replace(/(\sstyle=")/, `$1${decl}`) : `${tag} style="${decl}"`,
  );
}

export const DEFAULT_GAUGE: VectorGauge = {
  shape: "arc",
  width: 200,
  height: 200,
  start: -135,
  sweep: 270,
  orientation: "horizontal",
  thickness: 16,
  rounded: true,
  segments: 0,
  gap: 3,
  track: "#1E293B",
  fill: { mode: "solid", color: "#3B82F6", stops: [{ at: 0, color: "#22C55E" }, { at: 60, color: "#EAB308" }, { at: 85, color: "#EF4444" }] },
  needle: null,
  ticks: null,
  reverse: false,
};

interface PrimCommon {
  opacity?: number;
  /** Drawn with the gauge's glow. */
  glow?: boolean;
}

/**
 * One SVG element: a path filled or stroked, a rect (optionally with a linear gradient or a pattern), a
 * line of text, an icon (centred on x, y), or a group clipped to a path that can drift (live only).
 */
export type Prim =
  | ({ kind: "path"; d: string; fill?: Paint; stroke?: Paint; width?: number; cap?: "round" | "butt"; rise?: Rise } & PrimCommon)
  | ({ kind: "rect"; x: number; y: number; w: number; h: number; r: number; fill: Paint | LinearGradient | PatternPaint | null; stroke?: Paint; width?: number } & PrimCommon)
  | ({ kind: "text"; x: number; y: number; text: string; size: number; color: Paint; font: string; weight: number; anchor: "start" | "middle" | "end" } & PrimCommon)
  | ({ kind: "icon"; name: GaugeIcon; x: number; y: number; size: number; color: Paint } & PrimCommon)
  | ({ kind: "group"; clip: string; children: Prim[]; drift?: { dx: number; dy: number; seconds: number } } & PrimCommon);

/** Live only: moves up from `from` to `to` px (offsets from where it is drawn), fading in and out, on a loop. */
export interface Rise {
  from: number;
  to: number;
  seconds: number;
  /** How far into its loop it starts, s. */
  delay: number;
}

/** A pattern tile; `along` is the fill's direction, for chevrons and drift. */
export interface PatternPaint {
  pattern: Pattern["style"];
  color: Paint;
  size: number;
  seconds: number;
  along: "right" | "left" | "up" | "down";
}

export interface LinearGradient {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: ColorStop[];
}

/** The stop colours interpolated at `at` (0–100). */
export function colorAt(stops: readonly ColorStop[], at: number): string {
  const sorted = [...stops].filter((s) => HEX.test(s.color)).sort((a, b) => a.at - b.at);
  if (sorted.length === 0) return "#000000";
  if (at <= sorted[0].at) return sorted[0].color.toUpperCase();
  for (let i = 1; i < sorted.length; i++) {
    const [a, b] = [sorted[i - 1], sorted[i]];
    if (at > b.at) continue;
    const t = b.at === a.at ? 1 : (at - a.at) / (b.at - a.at);
    const mix = (k: number) => Math.round(parseInt(a.color.slice(k, k + 2), 16) * (1 - t) + parseInt(b.color.slice(k, k + 2), 16) * t);
    return `#${[1, 3, 5].map((k) => mix(k).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  }
  return sorted.at(-1)!.color.toUpperCase();
}

/** Zones: the colour of the last stop at or below `at` (a stop starts a zone). */
export function zoneAt(stops: readonly ColorStop[], at: number): string {
  const sorted = [...stops].sort((a, b) => a.at - b.at);
  let color = sorted[0]?.color ?? "#000000";
  for (const s of sorted) if (s.at <= at) color = s.color;
  return color.toUpperCase();
}

/** The widgets' tone: crit at or above `crit`, warn at or above `warn`, else the ok colour. */
export function thresholdPaint(g: VectorGauge, at: number): Paint {
  const s = scaleOf(g);
  const v = s.min + (at / 100) * (s.max - s.min);
  if (g.fill.crit !== undefined && v >= g.fill.crit) return "crit";
  if (g.fill.warn !== undefined && v >= g.fill.warn) return "warn";
  return g.fill.color;
}

/** The fill's colour at a position of the range (segments), or for the whole fill at `value` (continuous). */
export function colorOf(g: VectorGauge, at: number, value: number): Paint {
  return g.fill.mode === "gradient" ? colorAt(g.fill.stops, at) : placeColor(g, g.segments > 0 ? at : value);
}

/** The fill's colour for a piece at its own place in the range (a segment, a grid cell, an icon). */
export function placeColor(g: VectorGauge, at: number): Paint {
  if (g.fill.mode === "gradient") return colorAt(g.fill.stops, at);
  if (g.fill.mode === "zones") return zoneAt(g.fill.stops, at);
  if (g.fill.mode === "thresholds") return thresholdPaint(g, at);
  return g.fill.color;
}

/** Value → 0..1 of the range, as InfoPanel's gauge maps it. */
export const fraction = (value: number | null, min: number, max: number) =>
  value === null || max === min ? 0 : clamp((value - min) / (max - min), 0, 1);

/* ---- arc ---- */

export function arcGeometry(g: VectorGauge) {
  const cx = g.width / 2;
  const cy = g.height / 2;
  const outside = (g.ticks ? g.ticks.length + 2 : 0) + (g.rings ? g.rings.count * g.rings.spacing + g.rings.width / 2 : 0);
  const r =Math.max(1, Math.min(g.width, g.height) / 2 - g.thickness / 2 - outside - 1);
  const at = (deg: number, radius = r) => polar(cx, cy, radius, deg);
  return { cx, cy, r, at };
}

function arcPrims(g: VectorGauge, p: number): Prim[] {
  const { cx, cy, r, at } = arcGeometry(g);
  const sweep = clamp(g.sweep, 1, 360);
  const out: Prim[] = [];
  const cap = g.rounded ? "round" : "butt";
  const glow = (g.glow ?? 0) > 0;
  const stroke = (a0: number, a1: number, color: Paint, c: "round" | "butt" = cap): Prim => ({
    kind: "path", d: arcPath(cx, cy, r, a0, a1), stroke: color, width: g.thickness, cap: c,
  });
  const lit = (prim: Prim): Prim => (glow ? { ...prim, glow } : prim);
  const track = (prim: Prim): Prim => (g.trackOpacity !== undefined ? { ...prim, opacity: g.trackOpacity } : prim);
  const valueAt = (fracOfRange: number) => (g.reverse ? g.start + sweep * (1 - fracOfRange) : g.start + sweep * fracOfRange);

  if (g.rings) out.push(...ringPrims(g, { cx, cy, r, sweep }));
  if (g.segments > 0) {
    const n = Math.round(g.segments);
    const gap = clamp(g.gap, 0, sweep / n - 0.5);
    const each = (sweep - gap * (n - (sweep >= 360 ? 0 : 1))) / n;
    const count = Math.round(p * n);
    for (let i = 0; i < n; i++) {
      // Segment i in fill order; reversed gauges fill from the end.
      const k = g.reverse ? n - 1 - i : i;
      const a0 = g.start + k * (each + gap);
      if (i < count) out.push(lit(stroke(a0, a0 + each, colorOf(g, ((i + 0.5) / n) * 100, p * 100))));
      else if (g.track) out.push(track(stroke(a0, a0 + each, g.track)));
    }
  } else {
    if (g.track) out.push(track(stroke(g.start, g.start + sweep, g.track)));
    const [a0, a1] = g.reverse ? [valueAt(p), g.start + sweep] : [g.start, valueAt(p)];
    if (a1 - a0 > 0.01) {
      if (g.fill.mode === "gradient") {
        const overFill = g.fill.over === "fill";
        // Short butt-capped pieces, each in the colour of its place in the range.
        const pieces = clamp(Math.ceil((a1 - a0) / 3), 1, 120);
        const step = (a1 - a0) / pieces;
        for (let i = 0; i < pieces; i++) {
          const s = a0 + i * step;
          const mid = ((s + step / 2 - (overFill ? a0 : g.start)) / (overFill ? a1 - a0 : sweep)) * 100;
          // A hair of overlap hides the seams between pieces.
          out.push(lit(stroke(s, Math.min(a1, s + step + 0.3), colorAt(g.fill.stops, mid), "butt")));
        }
        if (g.rounded) {
          const ends = overFill ? [[a0, 0], [a1, 100]] : [[a0, ((a0 - g.start) / sweep) * 100], [a1, ((a1 - g.start) / sweep) * 100]];
          for (const [deg, pos] of ends as [number, number][]) {
            const [x, y] = at(deg);
            out.push(lit({ kind: "path", d: circlePath(x, y, g.thickness / 2), fill: colorAt(g.fill.stops, pos) }));
          }
        }
      } else out.push(lit(stroke(a0, a1, colorOf(g, 0, p * 100))));
    }
  }

  if (g.ticks && g.ticks.count >= 2) out.push(...arcTicks(g, { cx, cy, r, sweep }));
  if (g.needle) out.push(...arcNeedle(g, { cx, cy, r }, valueAt(p)));
  return out;
}

/* ---- bar ---- */

function barPrims(g: VectorGauge, p: number): Prim[] {
  const vertical = g.orientation === "vertical";
  const labels = g.ticks?.labels ? g.ticks.labels.size * (vertical ? 2.4 : 1.4) + 2 : 0;
  const pad = g.ticks ? g.ticks.length + 2 + labels : 0;
  // The bar runs along the long axis, `thickness` across, centred.
  const length = (vertical ? g.height : g.width) - 2;
  const across = Math.min(g.thickness, (vertical ? g.width : g.height) - pad);
  const offset = ((vertical ? g.width : g.height) - pad - across) / 2;
  // Box of a span along the bar (0..length, measured from where the fill starts).
  const box = (from: number, to: number) => {
    const [a, b] = g.reverse ? [length - to, length - from] : [from, to];
    return vertical
      ? { x: offset, y: 1 + (length - b), w: across, h: b - a }
      : { x: 1 + a, y: offset, w: b - a, h: across };
  };
  const radius = g.radius !== undefined ? Math.min(g.radius, across / 2) : g.rounded ? across / 2 : 0;
  const glow = (g.glow ?? 0) > 0;
  const out: Prim[] = [];
  const rect = (from: number, to: number, fill: Paint | LinearGradient | PatternPaint, r = radius): Prim => ({ kind: "rect", ...box(from, to), r: Math.min(r, (to - from) / 2), fill });
  const lit = (prim: Prim): Prim => (glow ? { ...prim, glow } : prim);
  const track = (prim: Prim): Prim => (g.trackOpacity !== undefined ? { ...prim, opacity: g.trackOpacity } : prim);

  if (g.icons) {
    out.push(...iconRowPrims(g, p, { length, across, offset, vertical }));
  } else if (g.segments > 0) {
    const n = Math.round(g.segments);
    const gap = clamp(g.gap, 0, length / n - 1);
    const each = (length - gap * (n - 1)) / n;
    const count = Math.round(p * n);
    for (let i = 0; i < n; i++) {
      const r = Math.min(radius, each / 2);
      if (i < count) out.push(lit(rect(i * (each + gap), i * (each + gap) + each, colorOf(g, ((i + 0.5) / n) * 100, p * 100), r)));
      else if (g.track) out.push(track(rect(i * (each + gap), i * (each + gap) + each, g.track, r)));
    }
  } else {
    if (g.track) out.push(track(rect(0, length, g.track)));
    const filled = length * p;
    if (filled > 0.01) {
      if (g.fill.mode === "gradient") {
        // Over the whole bar, so each colour keeps its place; or over the filled part.
        const whole = box(0, g.fill.over === "fill" ? filled : length);
        const [x1, y1, x2, y2] = vertical
          ? g.reverse ? [0, whole.y, 0, whole.y + whole.h] : [0, whole.y + whole.h, 0, whole.y]
          : g.reverse ? [whole.x + whole.w, 0, whole.x, 0] : [whole.x, 0, whole.x + whole.w, 0];
        out.push(lit(rect(0, filled, { x1, y1, x2, y2, stops: g.fill.stops })));
      } else out.push(lit(rect(0, filled, colorOf(g, 0, p * 100))));
      if (g.pattern) {
        const pt = g.pattern;
        const along = vertical ? (g.reverse ? "down" : "up") : g.reverse ? "left" : "right";
        out.push({ ...rect(0, filled, { pattern: pt.style, color: pt.color, size: pt.size, seconds: pt.speed, along }), opacity: pt.opacity });
      }
    }
  }

  if (g.ticks && g.ticks.count >= 2) out.push(...barTicks(g, { length, base: offset + across + 1, vertical }));

  if (g.needle) {
    const n = g.needle;
    const at = box(0, length * p);
    const over = across * clamp(n.length, 0.1, 2);
    const d = vertical
      ? `M${fmt(offset + across / 2 - over / 2)} ${fmt(g.reverse ? at.y + at.h : at.y)}h${fmt(over)}`
      : `M${fmt(g.reverse ? at.x : at.x + at.w)} ${fmt(offset + across / 2 - over / 2)}v${fmt(over)}`;
    out.push({ kind: "path", d, stroke: n.color, width: n.width, cap: "round" });
  }
  return out;
}

/** The gauge's shapes at `p` (0..1 of the range): background, the shape, ticks and needle, then the value text. */
export function gaugePrims(g: VectorGauge, p: number): Prim[] {
  const v = clamp(Number.isFinite(p) ? p : 0, 0, 1);
  if (g.shape === "svg") return [];
  const body = g.shape === "arc" ? arcPrims(g, v) : g.shape === "liquid" ? liquidPrims(g, v) : g.shape === "grid" ? gridPrims(g, v) : barPrims(g, v);
  return [...backgroundPrims(g), ...body, ...(g.icon && g.shape !== "bar" ? [centreIcon(g)] : []), ...(g.text ? [valueText(g, v)] : [])];
}

/**
 * A spec from untrusted JSON (the library, an import): known fields only,
 * numbers in range, colours as #RRGGBB or theme colours; anything else takes
 * the default. Optional parts stay absent unless given.
 */
export function normalizeGauge(raw: unknown): VectorGauge {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_GAUGE;
  const num = (v: unknown, def: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : def);
  const color = (v: unknown, def: Paint): Paint => (isThemeColor(v) ? v : typeof v === "string" && HEX.test(v) ? v.toUpperCase() : def);
  const hex = (v: unknown) => (typeof v === "string" && HEX.test(v) ? v.toUpperCase() : null);
  const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);
  // Font names and text: printable, no markup or CSS punctuation that could end a declaration.
  const font = (v: unknown) => (typeof v === "string" && /^[\w\s,'.-]{0,80}$/.test(v) ? v : "");
  const text = (v: unknown, def: string, max: number) => (typeof v === "string" ? v.replace(/[\p{Cc}]/gu, "").slice(0, max) : def);
  const finite = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const fill = obj(o.fill) ?? {};
  const stops = Array.isArray(fill.stops)
    ? fill.stops.flatMap((s) => {
        const so = obj(s);
        const c = so && hex(so.color);
        return so && typeof so.at === "number" && c ? [{ at: clamp(so.at, 0, 100), color: c }] : [];
      }).slice(0, 16)
    : d.fill.stops;
  const needle = obj(o.needle);
  const ticks = obj(o.ticks);
  const minor = obj(ticks?.minor);
  const labels = obj(ticks?.labels);
  const scale = obj(o.scale);
  const vt = obj(o.text);
  const bg = obj(o.background);
  const border = obj(bg?.border);
  const shadow = obj(o.shadow);
  const [warn, crit] = [finite(fill.warn), finite(fill.crit)];
  // Only checked for shape here (this also runs on the dev server); the browser sanitizes it before use.
  const template = typeof o.template === "string" && o.template.length <= MAX_TEMPLATE && /^<svg\b/.test(o.template) ? o.template : null;
  const scaleMin = num(scale?.min, 0, -1e9, 1e9);
  return {
    shape: o.shape === "bar" || o.shape === "liquid" || o.shape === "grid" ? o.shape : o.shape === "svg" && template ? "svg" : "arc",
    width: Math.round(num(o.width, d.width, 4, 2048)),
    height: Math.round(num(o.height, d.height, 4, 2048)),
    start: num(o.start, d.start, -360, 360),
    sweep: num(o.sweep, d.sweep, 1, 360),
    orientation: o.orientation === "vertical" ? "vertical" : "horizontal",
    thickness: num(o.thickness, d.thickness, 1, 1024),
    rounded: typeof o.rounded === "boolean" ? o.rounded : d.rounded,
    ...(o.radius !== undefined ? { radius: num(o.radius, 0, 0, 1024) } : {}),
    segments: Math.round(num(o.segments, d.segments, 0, 200)),
    gap: num(o.gap, d.gap, 0, 100),
    track: o.track === null ? null : color(o.track, d.track!),
    ...(o.trackOpacity !== undefined ? { trackOpacity: num(o.trackOpacity, 1, 0, 1) } : {}),
    fill: {
      mode: fill.mode === "gradient" || fill.mode === "zones" || fill.mode === "thresholds" ? fill.mode : "solid",
      color: color(fill.color, d.fill.color),
      stops: stops.length ? stops : d.fill.stops,
      ...(fill.over === "fill" ? { over: "fill" as const } : {}),
      ...(warn !== undefined ? { warn } : {}),
      ...(crit !== undefined ? { crit } : {}),
    },
    needle: needle
      ? {
          color: color(needle.color, "#F1F5F9"), length: num(needle.length, 0.85, 0.1, 1.2), width: num(needle.width, 6, 1, 64),
          ...(needle.style === "line" || needle.style === "arrow" || needle.style === "blade" ? { style: needle.style } : {}),
        }
      : null,
    ticks: ticks
      ? {
          count: Math.round(num(ticks.count, 11, 2, 200)), length: num(ticks.length, 8, 1, 200), width: num(ticks.width, 2, 0.5, 32), color: color(ticks.color, "#94A3B8"),
          ...(minor ? { minor: { count: Math.round(num(minor.count, 4, 1, 20)), length: num(minor.length, 4, 1, 200), width: num(minor.width, 1, 0.5, 32), color: color(minor.color, "muted") } } : {}),
          ...(labels ? { labels: { size: num(labels.size, 12, 4, 200), color: color(labels.color, "muted"), font: font(labels.font) } } : {}),
        }
      : null,
    reverse: o.reverse === true,
    ...(scale ? { scale: { min: scaleMin, max: num(scale.max, 100, -1e9, 1e9), unit: text(scale.unit, "", 16), decimals: scale.decimals === null ? null : Math.round(num(scale.decimals, 0, 0, 4)) } } : {}),
    ...(vt
      ? {
          text: {
            size: num(vt.size, 32, 4, 400), color: color(vt.color, "fg"), font: font(vt.font), weight: Math.round(num(vt.weight, 700, 100, 900) / 100) * 100,
            y: num(vt.y, 0.5, 0, 1), format: text(vt.format, "{value}{unit}", 40),
          },
        }
      : {}),
    ...(bg
      ? {
          background: {
            color: bg.color === null ? null : color(bg.color, "#0F172A"),
            border: border ? { color: color(border.color, "muted"), width: num(border.width, 2, 0.5, 64) } : null,
            radius: num(bg.radius, 8, 0, 1024),
          },
        }
      : {}),
    ...(o.glow !== undefined ? { glow: num(o.glow, 0, 0, 64) } : {}),
    ...(shadow
      ? { shadow: { blur: num(shadow.blur, 6, 0, 64), dx: num(shadow.dx, 0, -64, 64), dy: num(shadow.dy, 2, -64, 64), color: color(shadow.color, "#000000"), opacity: num(shadow.opacity, 0.5, 0, 1) } }
      : {}),
    ...normalizeShapeParts(o, { num, color, obj }),
    ...(o.shape === "svg" && template ? { template } : {}),
  };
}

/** The checks normalizeGauge lends to the shape parts' normalizer. */
export interface Checks {
  num(v: unknown, def: number, lo: number, hi: number): number;
  color(v: unknown, def: Paint): Paint;
  obj(v: unknown): Record<string, unknown> | null;
}
