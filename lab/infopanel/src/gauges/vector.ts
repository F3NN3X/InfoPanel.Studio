/**
 * Vector gauges (L7): a gauge described by a small spec and drawn as SVG at
 * any value, instead of a fixed image per step. Ideas from the user's gauge
 * creator (arc and bar shapes, segments, colour zones and gradients, needle,
 * ticks), rewritten as pure geometry so the same shapes draw live on the lab
 * canvas and bake into InfoPanel's image frames.
 *
 * Angles are degrees clockwise from 12 o'clock. A fill's colour position is
 * over the whole range (0–100 %), never over the filled part, so a colour sits
 * at the same place whatever the value.
 */

export interface ColorStop {
  /** 0–100 % of the range. */
  at: number;
  /** #RRGGBB */
  color: string;
}

export type FillMode = "solid" | "gradient" | "zones";

export interface VectorGauge {
  /** "svg": the user's own SVG (`template`), driven by the value; the arc and bar fields do not apply. */
  shape: "arc" | "bar" | "svg";
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
  /** 0: a continuous fill; else that many segments with `gap` between (degrees on an arc, px on a bar). */
  segments: number;
  gap: number;
  /** The unfilled range; null draws none. */
  track: string | null;
  fill: { mode: FillMode; color: string; stops: ColorStop[] };
  /** Arc: a needle from the centre; bar: a marker across the bar. */
  needle: { color: string; length: number; width: number } | null;
  ticks: { count: number; length: number; width: number; color: string } | null;
  /** Fills from the end of the range instead. */
  reverse: boolean;
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

/** One SVG element: a path filled or stroked, or a rect with a linear gradient. */
export type Prim =
  | { kind: "path"; d: string; fill?: string; stroke?: string; width?: number; cap?: "round" | "butt" }
  | { kind: "rect"; x: number; y: number; w: number; h: number; r: number; fill: string | LinearGradient };

export interface LinearGradient {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: ColorStop[];
}

const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const fmt = (n: number) => String(Math.round(n * 100) / 100);

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

/** The fill's colour at a position of the range. */
function colorOf(g: VectorGauge, at: number, value: number): string {
  if (g.fill.mode === "gradient") return colorAt(g.fill.stops, at);
  if (g.fill.mode === "zones") return zoneAt(g.fill.stops, g.segments > 0 ? at : value);
  return g.fill.color;
}

/** Value → 0..1 of the range, as InfoPanel's gauge maps it. */
export const fraction = (value: number | null, min: number, max: number) =>
  value === null || max === min ? 0 : clamp((value - min) / (max - min), 0, 1);

/* ---- arc ---- */

const rad = (deg: number) => (deg * Math.PI) / 180;

function arcGeometry(g: VectorGauge) {
  const cx = g.width / 2;
  const cy = g.height / 2;
  const outside = g.ticks ? g.ticks.length + 2 : 0;
  const r = Math.max(1, Math.min(g.width, g.height) / 2 - g.thickness / 2 - outside - 1);
  const at = (deg: number, radius = r) => [cx + radius * Math.sin(rad(deg)), cy - radius * Math.cos(rad(deg))] as const;
  return { cx, cy, r, at };
}

/** An SVG arc path from `a0` to `a1` degrees (clockwise); a full turn is two halves. */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const span = a1 - a0;
  if (span <= 0) return "";
  const pt = (deg: number) => `${fmt(cx + r * Math.sin(rad(deg)))} ${fmt(cy - r * Math.cos(rad(deg)))}`;
  if (span >= 360) {
    const mid = a0 + 180;
    return `M${pt(a0)}A${fmt(r)} ${fmt(r)} 0 1 1 ${pt(mid)}A${fmt(r)} ${fmt(r)} 0 1 1 ${pt(a0 + 359.99)}`;
  }
  return `M${pt(a0)}A${fmt(r)} ${fmt(r)} 0 ${span > 180 ? 1 : 0} 1 ${pt(a1)}`;
}

function arcPrims(g: VectorGauge, p: number): Prim[] {
  const { cx, cy, r, at } = arcGeometry(g);
  const sweep = clamp(g.sweep, 1, 360);
  const out: Prim[] = [];
  const cap = g.rounded ? "round" : "butt";
  const stroke = (a0: number, a1: number, color: string, c: "round" | "butt" = cap): Prim => ({
    kind: "path", d: arcPath(cx, cy, r, a0, a1), stroke: color, width: g.thickness, cap: c,
  });
  const valueAt = (fracOfRange: number) => (g.reverse ? g.start + sweep * (1 - fracOfRange) : g.start + sweep * fracOfRange);

  if (g.segments > 0) {
    const n = Math.round(g.segments);
    const gap = clamp(g.gap, 0, sweep / n - 0.5);
    const each = (sweep - gap * (n - (sweep >= 360 ? 0 : 1))) / n;
    const lit = Math.round(p * n);
    for (let i = 0; i < n; i++) {
      // Segment i in fill order; reversed gauges fill from the end.
      const k = g.reverse ? n - 1 - i : i;
      const a0 = g.start + k * (each + gap);
      const color = i < lit ? colorOf(g, ((i + 0.5) / n) * 100, p * 100) : g.track;
      if (color) out.push(stroke(a0, a0 + each, color));
    }
  } else {
    if (g.track) out.push(stroke(g.start, g.start + sweep, g.track));
    const [a0, a1] = g.reverse ? [valueAt(p), g.start + sweep] : [g.start, valueAt(p)];
    if (a1 - a0 > 0.01) {
      if (g.fill.mode === "gradient") {
        // Short butt-capped pieces, each in the colour of its place in the range.
        const pieces = clamp(Math.ceil((a1 - a0) / 3), 1, 120);
        const step = (a1 - a0) / pieces;
        for (let i = 0; i < pieces; i++) {
          const s = a0 + i * step;
          const mid = ((s + step / 2 - g.start) / sweep) * 100;
          // A hair of overlap hides the seams between pieces.
          out.push(stroke(s, Math.min(a1, s + step + 0.3), colorAt(g.fill.stops, mid), "butt"));
        }
        if (g.rounded) {
          for (const [deg, pos] of [[a0, ((a0 - g.start) / sweep) * 100], [a1, ((a1 - g.start) / sweep) * 100]] as const) {
            const [x, y] = at(deg);
            out.push({ kind: "path", d: circlePath(x, y, g.thickness / 2), fill: colorAt(g.fill.stops, pos) });
          }
        }
      } else out.push(stroke(a0, a1, colorOf(g, 0, p * 100)));
    }
  }

  if (g.ticks && g.ticks.count >= 2) {
    const t = g.ticks;
    const inner = r + g.thickness / 2 + 1;
    const d = Array.from({ length: Math.round(t.count) }, (_, i) => {
      const deg = g.start + (sweep * i) / (sweep >= 360 ? t.count : t.count - 1);
      const [x0, y0] = at(deg, inner);
      const [x1, y1] = at(deg, inner + t.length);
      return `M${fmt(x0)} ${fmt(y0)}L${fmt(x1)} ${fmt(y1)}`;
    }).join("");
    out.push({ kind: "path", d, stroke: t.color, width: t.width, cap: "butt" });
  }

  if (g.needle) {
    const n = g.needle;
    const deg = valueAt(p);
    const [tx, ty] = at(deg, r * clamp(n.length, 0.1, 1.2));
    const [lx, ly] = at(deg - 90, n.width / 2);
    const [rx, ry] = at(deg + 90, n.width / 2);
    out.push({ kind: "path", d: `M${fmt(lx)} ${fmt(ly)}L${fmt(tx)} ${fmt(ty)}L${fmt(rx)} ${fmt(ry)}Z`, fill: n.color });
    out.push({ kind: "path", d: circlePath(cx, cy, n.width), fill: n.color });
  }
  return out;
}

const circlePath = (x: number, y: number, r: number) =>
  `M${fmt(x - r)} ${fmt(y)}a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(2 * r)} 0a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-2 * r)} 0Z`;

/* ---- bar ---- */

function barPrims(g: VectorGauge, p: number): Prim[] {
  const vertical = g.orientation === "vertical";
  const pad = g.ticks ? g.ticks.length + 2 : 0;
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
  const radius = g.rounded ? across / 2 : 0;
  const out: Prim[] = [];
  const rect = (from: number, to: number, fill: string | LinearGradient, r = radius): Prim => ({ kind: "rect", ...box(from, to), r: Math.min(r, (to - from) / 2), fill });

  if (g.segments > 0) {
    const n = Math.round(g.segments);
    const gap = clamp(g.gap, 0, length / n - 1);
    const each = (length - gap * (n - 1)) / n;
    const lit = Math.round(p * n);
    for (let i = 0; i < n; i++) {
      const color = i < lit ? colorOf(g, ((i + 0.5) / n) * 100, p * 100) : g.track;
      if (color) out.push(rect(i * (each + gap), i * (each + gap) + each, color, Math.min(radius, each / 2)));
    }
  } else {
    if (g.track) out.push(rect(0, length, g.track));
    const filled = length * p;
    if (filled > 0.01) {
      if (g.fill.mode === "gradient") {
        // The gradient spans the whole bar, so each colour keeps its place.
        const whole = box(0, length);
        const [x1, y1, x2, y2] = vertical
          ? g.reverse ? [0, whole.y, 0, whole.y + whole.h] : [0, whole.y + whole.h, 0, whole.y]
          : g.reverse ? [whole.x + whole.w, 0, whole.x, 0] : [whole.x, 0, whole.x + whole.w, 0];
        out.push(rect(0, filled, { x1, y1, x2, y2, stops: g.fill.stops }));
      } else out.push(rect(0, filled, colorOf(g, 0, p * 100)));
    }
  }

  if (g.ticks && g.ticks.count >= 2) {
    const t = g.ticks;
    const base = offset + across + 1;
    const d = Array.from({ length: Math.round(t.count) }, (_, i) => {
      const along = 1 + (length * i) / (t.count - 1);
      return vertical
        ? `M${fmt(base)} ${fmt(g.height - along)}h${fmt(t.length)}`
        : `M${fmt(along)} ${fmt(base)}v${fmt(t.length)}`;
    }).join("");
    out.push({ kind: "path", d, stroke: t.color, width: t.width, cap: "butt" });
  }

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

/** The gauge's shapes at `p` (0..1 of the range). */
export function gaugePrims(g: VectorGauge, p: number): Prim[] {
  const v = clamp(Number.isFinite(p) ? p : 0, 0, 1);
  if (g.shape === "svg") return [];
  return g.shape === "arc" ? arcPrims(g, v) : barPrims(g, v);
}

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** The gauge at `p` as a standalone SVG document (for baking frames). */
export function gaugeSvg(g: VectorGauge, p: number): string {
  if (g.shape === "svg") return withValue(g.template ?? "", templateVars(g, p));
  const defs: string[] = [];
  const body = gaugePrims(g, p)
    .map((prim, i) => {
      if (prim.kind === "path") {
        const paint = prim.fill ? `fill="${esc(prim.fill)}"` : `fill="none" stroke="${esc(prim.stroke ?? "none")}" stroke-width="${fmt(prim.width ?? 1)}" stroke-linecap="${prim.cap ?? "butt"}"`;
        return `<path d="${prim.d}" ${paint}/>`;
      }
      let fill: string;
      if (typeof prim.fill === "string") fill = esc(prim.fill);
      else {
        const lg = prim.fill;
        defs.push(
          `<linearGradient id="g${i}" gradientUnits="userSpaceOnUse" x1="${fmt(lg.x1)}" y1="${fmt(lg.y1)}" x2="${fmt(lg.x2)}" y2="${fmt(lg.y2)}">` +
            [...lg.stops].sort((a, b) => a.at - b.at).map((s) => `<stop offset="${clamp(s.at, 0, 100)}%" stop-color="${esc(s.color)}"/>`).join("") +
            `</linearGradient>`,
        );
        fill = `url(#g${i})`;
      }
      return `<rect x="${fmt(prim.x)}" y="${fmt(prim.y)}" width="${fmt(Math.max(0, prim.w))}" height="${fmt(Math.max(0, prim.h))}" rx="${fmt(prim.r)}" fill="${fill}"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${g.width}" height="${g.height}" viewBox="0 0 ${g.width} ${g.height}">${defs.length ? `<defs>${defs.join("")}</defs>` : ""}${body}</svg>`;
}

/**
 * A spec from untrusted JSON (the library, an import): known fields only,
 * numbers in range, colours as #RRGGBB; anything else takes the default.
 */
export function normalizeGauge(raw: unknown): VectorGauge {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_GAUGE;
  const num = (v: unknown, def: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : def);
  const color = (v: unknown, def: string) => (typeof v === "string" && HEX.test(v) ? v.toUpperCase() : def);
  const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);
  const fill = obj(o.fill) ?? {};
  const stops = Array.isArray(fill.stops)
    ? fill.stops.flatMap((s) => {
        const so = obj(s);
        return so && typeof so.at === "number" && typeof so.color === "string" && HEX.test(so.color) ? [{ at: clamp(so.at, 0, 100), color: so.color.toUpperCase() }] : [];
      }).slice(0, 16)
    : d.fill.stops;
  const needle = obj(o.needle);
  const ticks = obj(o.ticks);
  // Only checked for shape here (this also runs on the dev server); the browser sanitizes it before use.
  const template = typeof o.template === "string" && o.template.length <= MAX_TEMPLATE && /^<svg\b/.test(o.template) ? o.template : null;
  return {
    shape: o.shape === "bar" ? "bar" : o.shape === "svg" && template ? "svg" : "arc",
    width: Math.round(num(o.width, d.width, 4, 2048)),
    height: Math.round(num(o.height, d.height, 4, 2048)),
    start: num(o.start, d.start, -360, 360),
    sweep: num(o.sweep, d.sweep, 1, 360),
    orientation: o.orientation === "vertical" ? "vertical" : "horizontal",
    thickness: num(o.thickness, d.thickness, 1, 1024),
    rounded: typeof o.rounded === "boolean" ? o.rounded : d.rounded,
    segments: Math.round(num(o.segments, d.segments, 0, 200)),
    gap: num(o.gap, d.gap, 0, 100),
    track: o.track === null ? null : color(o.track, d.track!),
    fill: {
      mode: fill.mode === "gradient" || fill.mode === "zones" ? fill.mode : "solid",
      color: color(fill.color, d.fill.color),
      stops: stops.length ? stops : d.fill.stops,
    },
    needle: needle ? { color: color(needle.color, "#F1F5F9"), length: num(needle.length, 0.85, 0.1, 1.2), width: num(needle.width, 6, 1, 64) } : null,
    ticks: ticks ? { count: Math.round(num(ticks.count, 11, 2, 200)), length: num(ticks.length, 8, 1, 200), width: num(ticks.width, 2, 0.5, 32), color: color(ticks.color, "#94A3B8") } : null,
    reverse: o.reverse === true,
    ...(o.shape === "svg" && template ? { template } : {}),
  };
}

/**
 * The starter template: a dial whose arc and needle follow `--value`, with a glow that pulses on its own
 * (CSS animation), to show what a template can do.
 */
export const SAMPLE_TEMPLATE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
  "<style>" +
  "svg{--value:0.5}" +
  ".arc{fill:none;stroke:#3B82F6;stroke-width:14;stroke-linecap:round;stroke-dasharray:377px 1000px;stroke-dashoffset:calc((1 - var(--value)) * 377px);transition:stroke-dashoffset .4s}" +
  ".needle{transform-origin:100px 100px;transform:rotate(calc(var(--value) * 270deg - 135deg));transition:transform .4s}" +
  ".glow{animation:pulse 2s ease-in-out infinite}" +
  "@keyframes pulse{50%{opacity:.25}}" +
  "</style>" +
  '<circle class="glow" cx="100" cy="100" r="92" fill="none" stroke="#38BDF8" stroke-width="2" opacity=".8"/>' +
  '<path d="M43.4 156.6A80 80 0 1 1 156.6 156.6" fill="none" stroke="#1E293B" stroke-width="14" stroke-linecap="round"/>' +
  '<path class="arc" d="M43.4 156.6A80 80 0 1 1 156.6 156.6"/>' +
  '<g class="needle"><path d="M97 100L100 34L103 100Z" fill="#F1F5F9"/></g>' +
  '<circle cx="100" cy="100" r="8" fill="#F1F5F9"/>' +
  "</svg>";

/** Starting points for a new vector gauge. */
export const STARTERS: { name: string; gauge: VectorGauge }[] = [
  { name: "Ring", gauge: { ...DEFAULT_GAUGE, start: 0, sweep: 360 } },
  { name: "Dial with needle", gauge: { ...DEFAULT_GAUGE, rounded: false, needle: { color: "#F1F5F9", length: 0.85, width: 6 }, ticks: { count: 11, length: 8, width: 2, color: "#94A3B8" }, fill: { ...DEFAULT_GAUGE.fill, mode: "gradient" } } },
  { name: "Segmented tachometer", gauge: { ...DEFAULT_GAUGE, rounded: false, segments: 24, gap: 2, fill: { ...DEFAULT_GAUGE.fill, mode: "zones" } } },
  { name: "Bar", gauge: { ...DEFAULT_GAUGE, shape: "bar", width: 300, height: 24, thickness: 16 } },
  { name: "SVG template (animated)", gauge: { ...DEFAULT_GAUGE, shape: "svg", template: SAMPLE_TEMPLATE } },
  { name: "Vertical segments", gauge:{ ...DEFAULT_GAUGE, shape: "bar", orientation: "vertical", width: 24, height: 120, thickness: 20, rounded: false, segments: 12, gap: 3, fill: { ...DEFAULT_GAUGE.fill, mode: "zones" } } },
];
