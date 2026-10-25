/**
 * Studio elements (InfoPanel editor, phases 3 and 8): rings, LED bars, cards, glows, dividers, icons,
 * per-core bars and sparklines, and the composites (rows, graph stacks, double rings, drives). Each is an ordinary InfoPanel item carrying one of these specs in
 * the studio-only `element` field (`$.element` in the stored form); `apply.ts` derives the item's
 * InfoPanel fields from it, so the export only ever sees InfoPanel items.
 *
 * Sizes come from the item's own box; the spec holds the look. Colours are inks: a colour and the
 * palette slot it follows, if any.
 */
import { clamp } from "../gauges/geom.ts";
import type { DisplayItem } from "../schema.ts";
import { normalizeInk, type Ink } from "./palette.ts";

/** A colour that takes over from `at` (0-100 % of the gauge's range) up. */
export interface Threshold {
  at: number;
  ink: Ink;
}

export interface RingSpec {
  type: "ring";
  /** Degrees clockwise from 12 o'clock. */
  start: number;
  /** 360 is a full ring. */
  sweep: number;
  thickness: number;
  track: Ink;
  /** One colour, or 2–3 stops of a gradient along the arc. */
  fill: Ink[];
  /** Round caps, else flat. */
  rounded: boolean;
  /** A dot at the value's end. */
  dot: boolean;
  /** Major ticks around the arc; 0 draws none. */
  ticks: number;
  /** LED mode: that many segments with `gap` degrees between; 0 is a continuous arc. */
  segments: number;
  gap: number;
  /** Soft glow around the fill, blur px; 0 is off. */
  glow: number;
  /** Frames the export bakes (a 0–59 clock ring uses 60, one per second); the default 101 when absent. */
  frames?: number;
  /** Colours by value: each frame takes the colour of its value (a segmented ring, of each segment's place). Replaces `fill`. */
  thresholds?: Threshold[];
}

export interface LedBarSpec {
  type: "ledbar";
  orientation: "horizontal" | "vertical";
  segments: number;
  /** px between segments. */
  gap: number;
  radius: number;
  track: Ink;
  fill: Ink[];
  glow: number;
  /** As on a ring. */
  thresholds?: Threshold[];
}

export interface Shadow {
  blur: number;
  dx: number;
  dy: number;
  color: Ink;
}

export interface CardSpec {
  type: "card";
  radius: number;
  /** One colour, or the two stops of a linear gradient at `angle`. */
  fill: Ink[];
  /** Degrees; 0 runs top to bottom. */
  angle: number;
  /** A 1 px stroke. */
  stroke: Ink | null;
  shadow: Shadow | null;
  glow: { blur: number; color: Ink } | null;
  /**
   * The margin a baked card's image has around the card for its shadow and glow, px, as last
   * applied: the item's box is the card's grown by it.
   */
  pad: number;
}

export interface GlowSpec {
  type: "glow";
  color: Ink;
  /** At the centre, 0–1. */
  alpha: number;
  /** Where the light fades out, px from the box's centre. */
  radius: number;
}

export interface DividerSpec {
  type: "divider";
  orientation: "horizontal" | "vertical";
  thickness: 1 | 2;
  /** One colour, or two stops along the line. */
  fill: Ink[];
}

export interface IconSpec {
  type: "icon";
  /** A lucide icon name (icons.generated.ts). */
  name: string;
  color: Ink;
}

export interface CoresSpec {
  type: "cores";
  /** "horizontal": bars side by side, each filling upwards; "vertical": stacked, each filling to the right. */
  orientation: "horizontal" | "vertical";
  gap: number;
  /** The whole element's size, from the group's X and Y. */
  width: number;
  height: number;
  radius: number;
  track: Ink;
  fill: Ink;
}

export interface SparklineSpec {
  type: "sparkline";
  /** "bars" is InfoPanel's histogram. */
  style: "line" | "area" | "bars";
  color: Ink;
  /** A dot on the newest value (studio only: InfoPanel's graph has none). */
  dot: boolean;
  /** An area fill fading downwards (studio only: InfoPanel fills one colour). */
  gradient: boolean;
  /** The fill's opacity under the line or between the bars, 0-1. */
  fillAlpha: number;
}

/** What a row, and each row of a list, looks like. */
export interface RowLook {
  /** Font size, InfoPanel's FontSize. */
  size: number;
  /** The label takes the sub-text slot, the value the text slot. */
  label: Ink;
  value: Ink;
  /** A lucide icon before the label; null for none. */
  icon: string | null;
  iconInk: Ink;
  /** A thin bar under the row, on the value's sensor. */
  bar: boolean;
  barFill: Ink;
  barTrack: Ink;
}

/** A label on the left, its value right-aligned, an optional icon and a thin bar: a Group of Text, Value, (Bar), (Image). */
export interface RowSpec extends RowLook {
  type: "row";
  /** The whole row's size, from the group's X and Y. */
  width: number;
  height: number;
}

/** N rows, evenly spaced: a Group of Row groups. */
export interface RowsSpec extends RowLook {
  type: "rows";
  count: number;
  /** px between rows. */
  gap: number;
  /** One row's size. */
  width: number;
  height: number;
}

/** 2-4 labelled graphs in rows: a Group of Text and Graph pairs. */
export interface StackSpec {
  type: "stack";
  count: number;
  gap: number;
  /** One graph row's size, label included. */
  width: number;
  height: number;
  size: number;
  label: Ink;
  color: Ink;
  area: boolean;
}

/** Two series overlaid: two transparent Graphs in one box. */
export interface DualSpec {
  type: "dual";
  width: number;
  height: number;
  a: Ink;
  b: Ink;
  area: boolean;
}

/** An outer and an inner ring, each on its own sensor, and a centre value: a Group of two Gauges and a Value. */
export interface DoubleRingSpec {
  type: "doublering";
  /** The outer ring's diameter. */
  size: number;
  thickness: number;
  /** px between the rings. */
  gap: number;
  start: number;
  sweep: number;
  track: Ink;
  outer: Ink[];
  inner: Ink[];
  /** The inner ring's colours by value (a heat ring); empty keeps `inner`. */
  innerThresholds: Threshold[];
  valueSize: number;
  value: Ink;
}

/** One tile per drive: a Group of tile Groups, each an icon, name, used bar and %, temperature and free space. */
export interface DrivesSpec {
  type: "drives";
  orientation: "horizontal" | "vertical";
  gap: number;
  /** The whole element's size, from the group's X and Y. */
  width: number;
  height: number;
  radius: number;
  card: Ink;
  text: Ink;
  sub: Ink;
  fill: Ink;
  track: Ink;
  icon: Ink;
}

/** A Text or Value with a dark offset shadow: a Group of a copy behind and the text itself. */
export interface ShadowTextSpec {
  type: "shadowtext";
  dx: number;
  dy: number;
  color: Ink;
}

export type ElementSpec =
  | RingSpec | LedBarSpec | CardSpec | GlowSpec | DividerSpec | IconSpec | CoresSpec | SparklineSpec
  | RowSpec | RowsSpec | StackSpec | DualSpec | DoubleRingSpec | DrivesSpec | ShadowTextSpec;
export type ElementType = ElementSpec["type"];

/** The elements drawn as one image. */
export type StaticSpec = CardSpec | GlowSpec | DividerSpec | IconSpec;
export const isStaticSpec = (s: ElementSpec | null | undefined): s is StaticSpec => s?.type === "card" || s?.type === "glow" || s?.type === "divider" || s?.type === "icon";

export const ELEMENT_TYPES: readonly ElementType[] = [
  "ring", "ledbar", "card", "glow", "divider", "icon", "cores", "sparkline", "row", "rows", "stack", "dual", "doublering", "drives", "shadowtext",
];

/** The elements that are a Group whose children the element lays out and styles (editing the element relays them out). */
export const MANAGED_GROUPS: readonly ElementType[] = ["cores", "row", "rows", "stack", "dual", "doublering", "drives", "shadowtext"];
export const isManagedGroup = (s: ElementSpec | null | undefined): boolean => s !== null && s !== undefined && MANAGED_GROUPS.includes(s.type);

/** The InfoPanel kinds an element can be: a card or a divider switches between Shape and Image as its settings need. */
export const ELEMENT_KINDS: Record<ElementType, readonly string[]> = {
  ring: ["Gauge"],
  ledbar: ["Gauge"],
  card: ["Shape", "Image"],
  glow: ["Image"],
  divider: ["Shape", "Image"],
  icon: ["Image"],
  cores: ["Group"],
  sparkline: ["Graph"],
  row: ["Group"],
  rows: ["Group"],
  stack: ["Group"],
  dual: ["Group"],
  doublering: ["Group"],
  drives: ["Group"],
  shadowtext: ["Group"],
};

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const num = (v: unknown, def: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : def);
const int = (v: unknown, def: number, lo: number, hi: number) => Math.round(num(v, def, lo, hi));
const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
const BLACK: Ink = { color: "#FF000000" };
const ink = (v: unknown, def: Ink = BLACK): Ink => normalizeInk(v) ?? def;
const inks = (v: unknown, lo: number, hi: number): Ink[] | null => {
  const list = Array.isArray(v) ? v.flatMap((x) => normalizeInk(x) ?? []).slice(0, hi) : [];
  return list.length >= lo ? list : null;
};
const thresholds = (v: unknown): Threshold[] =>
  (Array.isArray(v) ? v.flatMap((t): Threshold[] => {
    const o = obj(t);
    const i = o && normalizeInk(o.ink);
    return o && i ? [{ at: num(o.at, 50, 0, 100), ink: i }] : [];
  }) : [])
    .slice(0, 4)
    .sort((a, b) => a.at - b.at);
const optThresholds = (v: unknown) => {
  const list = thresholds(v);
  return list.length ? { thresholds: list } : {};
};
const orientation = (v: unknown) => (v === "vertical" ? "vertical" : "horizontal") as "horizontal" | "vertical";
const shadowOf = (v: unknown): Shadow | null => {
  const o = obj(v);
  return o ? { blur: num(o.blur, 12, 0, 64), dx: num(o.dx, 0, -64, 64), dy: num(o.dy, 4, -64, 64), color: ink(o.color, { color: "#80000000" }) } : null;
};

const rowLook = (o: Record<string, unknown>): RowLook => ({
  size: int(o.size, 14, 6, 200), label: ink(o.label), value: ink(o.value),
  icon: typeof o.icon === "string" && /^[a-z0-9-]{1,48}$/.test(o.icon) ? o.icon : null, iconInk: ink(o.iconInk),
  bar: bool(o.bar, false), barFill: ink(o.barFill), barTrack: ink(o.barTrack),
});

/**
 * A spec from untrusted JSON (a stored form): known fields only, numbers in range, inks with a
 * readable colour; null when it is not an element at all, or its colours are unusable.
 */
export function normalizeElement(raw: unknown): ElementSpec | null {
  const o = obj(raw);
  if (!o) return null;
  switch (o.type) {
    case "ring": {
      const fill = inks(o.fill, 1, 3);
      return fill
        ? {
            type: "ring", start: num(o.start, -135, -360, 360), sweep: num(o.sweep, 270, 1, 360), thickness: num(o.thickness, 12, 1, 512),
            track: ink(o.track), fill, rounded: bool(o.rounded, true), dot: bool(o.dot, false), ticks: int(o.ticks, 0, 0, 120),
            segments: int(o.segments, 0, 0, 200), gap: num(o.gap, 3, 0, 60), glow: num(o.glow, 0, 0, 32),
            ...(o.frames === undefined ? {} : { frames: int(o.frames, 101, 2, 360) }),
            ...optThresholds(o.thresholds),
          }
        : null;
    }
    case "ledbar": {
      const fill = inks(o.fill, 1, 3);
      return fill
        ? {
            type: "ledbar", orientation: orientation(o.orientation), segments: int(o.segments, 12, 1, 200), gap: num(o.gap, 3, 0, 60),
            radius: num(o.radius, 2, 0, 256), track: ink(o.track), fill, glow: num(o.glow, 0, 0, 32), ...optThresholds(o.thresholds),
          }
        : null;
    }
    case "card": {
      const fill = inks(o.fill, 1, 2);
      const glow = obj(o.glow);
      return fill
        ? {
            type: "card", radius: num(o.radius, 12, 0, 512), fill, angle: num(o.angle, 0, -360, 360),
            stroke: o.stroke === null || o.stroke === undefined ? null : ink(o.stroke),
            shadow: shadowOf(o.shadow), glow: glow ? { blur: num(glow.blur, 16, 1, 64), color: ink(glow.color) } : null,
            pad: int(o.pad, 0, 0, 512),
          }
        : null;
    }
    case "glow":
      return { type: "glow", color: ink(o.color), alpha: num(o.alpha, 0.35, 0, 1), radius: num(o.radius, 120, 1, 2048) };
    case "divider": {
      const fill = inks(o.fill, 1, 2);
      return fill ? { type: "divider", orientation: orientation(o.orientation), thickness: o.thickness === 2 ? 2 : 1, fill } : null;
    }
    case "icon":
      return typeof o.name === "string" && /^[a-z0-9-]{1,48}$/.test(o.name) ? { type: "icon", name: o.name, color: ink(o.color) } : null;
    case "cores":
      return {
        type: "cores", orientation: orientation(o.orientation), gap: num(o.gap, 4, 0, 64), width: int(o.width, 240, 1, 4096), height: int(o.height, 60, 1, 4096),
        radius: num(o.radius, 2, 0, 256), track: ink(o.track), fill: ink(o.fill),
      };
    case "sparkline":
      return {
        type: "sparkline", style: o.style === "area" || o.style === "bars" ? o.style : "line", color: ink(o.color), dot: bool(o.dot, false),
        gradient: bool(o.gradient, false), fillAlpha: num(o.fillAlpha, 0.25, 0, 1),
      };
    case "row":
      return { type: "row", width: int(o.width, 240, 8, 4096), height: int(o.height, 28, 6, 1024), ...rowLook(o) };
    case "rows":
      return { type: "rows", count: int(o.count, 4, 1, 24), gap: num(o.gap, 4, 0, 256), width: int(o.width, 240, 8, 4096), height: int(o.height, 28, 6, 1024), ...rowLook(o) };
    case "stack":
      return {
        type: "stack", count: int(o.count, 3, 2, 4), gap: num(o.gap, 8, 0, 256), width: int(o.width, 300, 16, 4096), height: int(o.height, 56, 8, 1024),
        size: int(o.size, 14, 6, 200), label: ink(o.label), color: ink(o.color), area: bool(o.area, true),
      };
    case "dual":
      return { type: "dual", width: int(o.width, 300, 8, 4096), height: int(o.height, 80, 8, 2048), a: ink(o.a), b: ink(o.b), area: bool(o.area, true) };
    case "doublering": {
      const outer = inks(o.outer, 1, 3);
      const inner = inks(o.inner, 1, 3);
      return outer && inner
        ? {
            type: "doublering", size: int(o.size, 160, 24, 1024), thickness: num(o.thickness, 12, 1, 128), gap: num(o.gap, 6, 0, 64),
            start: num(o.start, -135, -360, 360), sweep: num(o.sweep, 270, 1, 360), track: ink(o.track), outer, inner,
            innerThresholds: thresholds(o.innerThresholds), valueSize: int(o.valueSize, 28, 6, 400), value: ink(o.value),
          }
        : null;
    }
    case "drives":
      return {
        type: "drives", orientation: orientation(o.orientation), gap: num(o.gap, 12, 0, 256), width: int(o.width, 600, 16, 8192), height: int(o.height, 120, 16, 4096),
        radius: num(o.radius, 10, 0, 256), card: ink(o.card), text: ink(o.text), sub: ink(o.sub), fill: ink(o.fill), track: ink(o.track), icon: ink(o.icon),
      };
    case "shadowtext":
      return { type: "shadowtext", dx: num(o.dx, 1, -32, 32), dy: num(o.dy, 2, -32, 32), color: ink(o.color, { color: "#99000000" }) };
    default:
      return null;
  }
}

/** Every ink a spec draws with, for recolouring: `map` returns each one's replacement. */
export function mapInks(spec: ElementSpec, map: (ink: Ink) => Ink): ElementSpec {
  const m = (list: Ink[]) => list.map(map);
  const th = (list: Threshold[]) => list.map((t) => ({ ...t, ink: map(t.ink) }));
  switch (spec.type) {
    case "ring":
    case "ledbar":
      return { ...spec, track: map(spec.track), fill: m(spec.fill), ...(spec.thresholds ? { thresholds: th(spec.thresholds) } : {}) };
    case "row":
    case "rows":
      return { ...spec, label: map(spec.label), value: map(spec.value), iconInk: map(spec.iconInk), barFill: map(spec.barFill), barTrack: map(spec.barTrack) };
    case "stack":
      return { ...spec, label: map(spec.label), color: map(spec.color) };
    case "dual":
      return { ...spec, a: map(spec.a), b: map(spec.b) };
    case "doublering":
      return { ...spec, track: map(spec.track), outer: m(spec.outer), inner: m(spec.inner), innerThresholds: th(spec.innerThresholds), value: map(spec.value) };
    case "drives":
      return { ...spec, card: map(spec.card), text: map(spec.text), sub: map(spec.sub), fill: map(spec.fill), track: map(spec.track), icon: map(spec.icon) };
    case "shadowtext":
      return { ...spec, color: map(spec.color) };
    case "card":
      return {
        ...spec, fill: m(spec.fill), stroke: spec.stroke && map(spec.stroke),
        shadow: spec.shadow && { ...spec.shadow, color: map(spec.shadow.color) }, glow: spec.glow && { ...spec.glow, color: map(spec.glow.color) },
      };
    case "glow":
    case "icon":
    case "sparkline":
      return { ...spec, color: map(spec.color) };
    case "divider":
      return { ...spec, fill: m(spec.fill) };
    case "cores":
      return { ...spec, track: map(spec.track), fill: map(spec.fill) };
  }
}

/** The element spec an item carries (the studio-only `element` field), if any. */
export const elementOf = (item: DisplayItem | undefined): ElementSpec | null => (item as (DisplayItem & { element?: ElementSpec }) | undefined)?.element ?? null;
