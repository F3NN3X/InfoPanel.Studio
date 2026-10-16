/**
 * The vector gauge's optional parts (L10): ticks with minor ticks and labels,
 * needle styles, the background and the value text, plus the scale they read.
 * Number formatting follows the app's widgets (en-US grouping; automatic
 * decimals: one below 10, else none).
 */
import { circlePath, clamp, fmt, polar, polygon } from "./geom.ts";
import type { Prim, Scale, VectorGauge } from "./vector.ts";

export const DEFAULT_SCALE: Scale = { min: 0, max: 100, unit: "", decimals: null };
export const scaleOf = (g: VectorGauge): Scale => g.scale ?? DEFAULT_SCALE;

/** The scale value at `p` (0..1 of the range). */
export const scaleValue = (g: VectorGauge, p: number) => {
  const s = scaleOf(g);
  return s.min + clamp(p, 0, 1) * (s.max - s.min);
};

export function formatNumber(v: number, decimals: number | null): string {
  if (!Number.isFinite(v)) return "–";
  const d = decimals ?? (Math.abs(v) < 10 && !Number.isInteger(v) ? 1 : 0);
  return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** The value text at `p`: the format with `{value}` and `{unit}` filled in. */
export function formatValue(g: VectorGauge, p: number): string {
  const s = scaleOf(g);
  const format = g.text?.format ?? "{value}{unit}";
  return format.replace(/\{value\}/g, formatNumber(scaleValue(g, p), s.decimals)).replace(/\{unit\}/g, s.unit);
}

export function valueText(g: VectorGauge, p: number): Prim {
  const t = g.text!;
  return { kind: "text", x: g.width / 2, y: g.height * t.y, text: formatValue(g, p), size: t.size, color: t.color, font: t.font, weight: t.weight, anchor: "middle" };
}

/** Behind everything: a disc for an arc, a rounded rect for a bar. */
export function backgroundPrims(g: VectorGauge): Prim[] {
  const b = g.background;
  if (!b || (!b.color && !b.border)) return [];
  const inset = b.border ? b.border.width / 2 : 0;
  if (g.shape === "arc") {
    const d = circlePath(g.width / 2, g.height / 2, Math.max(1, Math.min(g.width, g.height) / 2 - inset));
    return [
      ...(b.color ? [{ kind: "path", d, fill: b.color } as const] : []),
      ...(b.border ? [{ kind: "path", d, stroke: b.border.color, width: b.border.width } as const] : []),
    ];
  }
  return [
    {
      kind: "rect", x: inset, y: inset, w: g.width - 2 * inset, h: g.height - 2 * inset, r: Math.min(b.radius, (g.height - 2 * inset) / 2, (g.width - 2 * inset) / 2),
      fill: b.color, ...(b.border ? { stroke: b.border.color, width: b.border.width } : {}),
    },
  ];
}

/** Label values at the major ticks: integers stay integers, else the scale's decimals (one by default). */
const labelText = (g: VectorGauge, f: number) => {
  const s = scaleOf(g);
  const v = scaleValue(g, g.reverse ? 1 - f : f);
  return formatNumber(v, s.decimals ?? (Number.isInteger(Math.round(v * 1e6) / 1e6) ? 0 : 1));
};

/** Major ticks outside the arc, minor ticks between them, labels inside. */
export function arcTicks(g: VectorGauge, a: { cx: number; cy: number; r: number; sweep: number }): Prim[] {
  const t = g.ticks!;
  const full = a.sweep >= 360;
  const count = Math.round(t.count);
  const steps = full ? count : count - 1;
  const inner = a.r + g.thickness / 2 + 1;
  const angle = (f: number) => g.start + a.sweep * f;
  const line = (deg: number, length: number) => {
    const [x0, y0] = polar(a.cx, a.cy, inner, deg);
    const [x1, y1] = polar(a.cx, a.cy, inner + length, deg);
    return `M${fmt(x0)} ${fmt(y0)}L${fmt(x1)} ${fmt(y1)}`;
  };
  const out: Prim[] = [{ kind: "path", d: Array.from({ length: count }, (_, i) => line(angle(i / steps), t.length)).join(""), stroke: t.color, width: t.width, cap: "butt" }];
  if (t.minor) {
    const m = t.minor;
    const d: string[] = [];
    for (let i = 0; i < steps; i++) for (let k = 1; k <= m.count; k++) d.push(line(angle((i + k / (m.count + 1)) / steps), m.length));
    out.push({ kind: "path", d: d.join(""), stroke: m.color, width: m.width, cap: "butt" });
  }
  if (t.labels) {
    const l = t.labels;
    const radius = Math.max(1, a.r - g.thickness / 2 - 4 - l.size * 0.8);
    for (let i = 0; i < count; i++) {
      const [x, y] = polar(a.cx, a.cy, radius, angle(i / steps));
      out.push({ kind: "text", x, y, text: labelText(g, i / steps), size: l.size, color: l.color, font: l.font, weight: 400, anchor: "middle" });
    }
  }
  return out;
}

/** Ticks beside the bar (below it, or right of a vertical one), labels past them. */
export function barTicks(g: VectorGauge, b: { length: number; base: number; vertical: boolean }): Prim[] {
  const t = g.ticks!;
  const count = Math.round(t.count);
  const along = (f: number) => 1 + b.length * f;
  const tick = (f: number, length: number) =>
    b.vertical ? `M${fmt(b.base)} ${fmt(g.height - along(f))}h${fmt(length)}` : `M${fmt(along(f))} ${fmt(b.base)}v${fmt(length)}`;
  const out: Prim[] = [{ kind: "path", d: Array.from({ length: count }, (_, i) => tick(i / (count - 1), t.length)).join(""), stroke: t.color, width: t.width, cap: "butt" }];
  if (t.minor) {
    const m = t.minor;
    const d: string[] = [];
    for (let i = 0; i < count - 1; i++) for (let k = 1; k <= m.count; k++) d.push(tick((i + k / (m.count + 1)) / (count - 1), m.length));
    out.push({ kind: "path", d: d.join(""), stroke: m.color, width: m.width, cap: "butt" });
  }
  if (t.labels) {
    const l = t.labels;
    for (let i = 0; i < count; i++) {
      const f = i / (count - 1);
      const text = labelText(g, f);
      // The end labels align inward, so they stay inside the frame.
      const anchor = b.vertical ? "start" : i === 0 ? "start" : i === count - 1 ? "end" : "middle";
      const [x, y] = b.vertical ? [b.base + t.length + 3, g.height - along(f)] : [along(f), b.base + t.length + 2 + l.size * 0.6];
      out.push({ kind: "text", x, y, text, size: l.size, color: l.color, font: l.font, weight: 400, anchor });
    }
  }
  return out;
}

/** The needle at `deg`, in its style, with a cap over the pivot. */
export function arcNeedle(g: VectorGauge, a: { cx: number; cy: number; r: number }, deg: number): Prim[] {
  const n = g.needle!;
  const at = (d: number, radius: number) => polar(a.cx, a.cy, radius, d);
  const length = a.r * clamp(n.length, 0.1, 1.2);
  const tip = at(deg, length);
  const cap: Prim = { kind: "path", d: circlePath(a.cx, a.cy, n.style === "blade" ? n.width * 0.6 : n.width), fill: n.color };
  switch (n.style) {
    case "line":
      return [{ kind: "path", d: `M${fmt(a.cx)} ${fmt(a.cy)}L${fmt(tip[0])} ${fmt(tip[1])}`, stroke: n.color, width: n.width / 2, cap: "round" }, cap];
    case "arrow": {
      const head = Math.min(length * 0.3, n.width * 3);
      const base = at(deg, length - head);
      return [
        { kind: "path", d: `M${fmt(a.cx)} ${fmt(a.cy)}L${fmt(base[0])} ${fmt(base[1])}`, stroke: n.color, width: n.width / 2, cap: "butt" },
        { kind: "path", d: polygon([tip, polar(base[0], base[1], n.width, deg - 90), polar(base[0], base[1], n.width, deg + 90)]), fill: n.color },
        cap,
      ];
    }
    case "blade":
      return [{ kind: "path", d: polygon([at(deg + 180, length * 0.18), at(deg - 90, n.width / 2), tip, at(deg + 90, n.width / 2)]), fill: n.color }, cap];
    default: {
      // "taper", the L7 needle: a triangle from the pivot.
      const [lx, ly] = at(deg - 90, n.width / 2);
      const [rx, ry] = at(deg + 90, n.width / 2);
      return [{ kind: "path", d: `M${fmt(lx)} ${fmt(ly)}L${fmt(tip[0])} ${fmt(tip[1])}L${fmt(rx)} ${fmt(ry)}Z`, fill: n.color }, cap];
    }
  }
}
