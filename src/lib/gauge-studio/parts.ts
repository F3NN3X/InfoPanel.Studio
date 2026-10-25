/**
 * The editor's parts (spec §6): which parts a shape has, whether one is on, and adding or removing
 * it with sensible defaults. Every function returns a new spec; an absent part is an absent field,
 * so older specs read and draw as before.
 */
import { DEFAULT_FACE } from "@/lib/effects/face";
import { SAMPLE_TEMPLATE } from "@/lib/infopanel/gauges/presets";
import { BUBBLES, DEFAULT_GRID, DEFAULT_ICON, DEFAULT_ICONS, DEFAULT_LIQUID, DEFAULT_PATTERN, DEFAULT_RINGS } from "@/lib/infopanel/gauges/shapes";
import { DEFAULT_GAUGE, type Background, type Shadow, type Ticks, type Title, type ValueText, type VectorGauge } from "@/lib/infopanel/gauges/vector";

export type PartId =
  | "shape" | "fill" | "track"
  | "needle" | "marker"
  | "ticks" | "labels" | "scale"
  | "text" | "title"
  | "background" | "face" | "rings" | "pattern" | "icons" | "icon"
  | "glow" | "shadow"
  | "wave" | "shine" | "bubbles";

export type PartGroup = "Core" | "Indicator" | "Scale" | "Text" | "Decor" | "Effects" | "Liquid";

type Shape = VectorGauge["shape"];

export interface PartDef {
  id: PartId;
  label: string;
  group: PartGroup;
  /** The shapes that have it. */
  shapes: readonly Shape[];
}

const DRAWN: readonly Shape[] = ["arc", "bar", "liquid", "grid"];

/** In list order. */
export const PARTS: readonly PartDef[] = [
  { id: "shape", label: "Shape", group: "Core", shapes: ["arc", "bar", "liquid", "grid", "svg"] },
  { id: "fill", label: "Fill", group: "Core", shapes: DRAWN },
  { id: "track", label: "Track", group: "Core", shapes: DRAWN },
  { id: "needle", label: "Needle", group: "Indicator", shapes: ["arc"] },
  { id: "marker", label: "Marker", group: "Indicator", shapes: ["bar"] },
  { id: "ticks", label: "Ticks", group: "Scale", shapes: ["arc", "bar"] },
  { id: "labels", label: "Labels", group: "Scale", shapes: ["arc", "bar"] },
  { id: "scale", label: "Scale", group: "Scale", shapes: ["svg"] },
  { id: "text", label: "Value text", group: "Text", shapes: DRAWN },
  { id: "title", label: "Title", group: "Text", shapes: DRAWN },
  { id: "background", label: "Background", group: "Decor", shapes: DRAWN },
  { id: "face", label: "Face", group: "Decor", shapes: ["arc"] },
  { id: "rings", label: "Rings", group: "Decor", shapes: ["arc"] },
  { id: "pattern", label: "Pattern", group: "Decor", shapes: ["bar"] },
  { id: "icons", label: "Icon row", group: "Decor", shapes: ["bar"] },
  { id: "icon", label: "Centre icon", group: "Decor", shapes: ["arc", "liquid", "grid"] },
  { id: "glow", label: "Glow", group: "Effects", shapes: DRAWN },
  { id: "shadow", label: "Shadow", group: "Effects", shapes: DRAWN },
  { id: "wave", label: "Wave", group: "Liquid", shapes: ["liquid"] },
  { id: "shine", label: "Shine", group: "Liquid", shapes: ["liquid"] },
  { id: "bubbles", label: "Bubbles", group: "Liquid", shapes: ["liquid"] },
];

export const GROUPS: readonly PartGroup[] = ["Core", "Indicator", "Scale", "Text", "Decor", "Effects", "Liquid"];

/** Shape and Fill are always on (an SVG template has only its shape and its scale). */
export const ALWAYS_ON: readonly PartId[] = ["shape", "fill", "scale"];

/** The parts the shape has, in list order. */
export const partsFor = (shape: Shape): PartDef[] => PARTS.filter((p) => p.shapes.includes(shape));

/** The parts of `shape`, by group (empty groups left out). */
export function groupedParts(shape: Shape): { group: PartGroup; parts: PartDef[] }[] {
  const parts = partsFor(shape);
  return GROUPS.map((group) => ({ group, parts: parts.filter((p) => p.group === group) })).filter((g) => g.parts.length > 0);
}

export const partLabel = (id: PartId): string => PARTS.find((p) => p.id === id)!.label;

/** Whether the spec has the part (and so draws it). */
export function hasPart(g: VectorGauge, id: PartId): boolean {
  switch (id) {
    case "shape":
    case "fill":
    case "scale":
      return true;
    case "track": return g.track !== null;
    case "needle":
    case "marker": return g.needle !== null;
    case "ticks": return g.ticks !== null;
    case "labels": return !!g.ticks?.labels;
    case "text": return !!g.text;
    case "title": return !!g.title;
    case "background": return !!g.background;
    case "face": return !!g.face;
    case "rings": return !!g.rings;
    case "pattern": return !!g.pattern;
    case "icons": return !!g.icons;
    case "icon": return !!g.icon;
    case "glow": return (g.glow ?? 0) > 0;
    case "shadow": return !!g.shadow;
    case "wave": return (g.liquid ?? DEFAULT_LIQUID).amplitude > 0;
    case "shine": return g.liquid?.shine !== undefined;
    case "bubbles": return !!g.liquid?.bubbles;
  }
}

const without = <K extends keyof VectorGauge>(g: VectorGauge, key: K): VectorGauge => {
  const { [key]: _, ...rest } = g;
  return rest as VectorGauge;
};

const withLiquid = (g: VectorGauge, patch: Partial<NonNullable<VectorGauge["liquid"]>>): VectorGauge => ({ ...g, liquid: { ...(g.liquid ?? DEFAULT_LIQUID), ...patch } });
const withoutLiquidKey = (g: VectorGauge, key: "shine" | "bubbles"): VectorGauge => {
  const { [key]: _, ...liquid } = g.liquid ?? DEFAULT_LIQUID;
  return { ...g, liquid };
};

export const NEEDLE: NonNullable<VectorGauge["needle"]> = { color: "#F1F5F9", length: 0.85, width: 6 };
export const MARKER: NonNullable<VectorGauge["needle"]> = { color: "#F1F5F9", length: 1.2, width: 3 };
export const TICKS: Ticks = { count: 11, length: 8, width: 2, color: "#94A3B8" };
export const MINOR: NonNullable<Ticks["minor"]> = { count: 4, length: 4, width: 1, color: "muted" };
export const LABELS: NonNullable<Ticks["labels"]> = { size: 12, color: "muted", font: "" };
export const TEXT: ValueText = { size: 32, color: "fg", font: "", weight: 700, y: 0.5, format: "{value}{unit}" };
export const TITLE: Title = { text: "Title", size: 14, color: "muted", y: 0.12 };
export const BACKGROUND: Background = { color: "#0F172A", border: null, radius: 8 };
export const SHADOW: Shadow = { blur: 6, dx: 0, dy: 2, color: "#000000", opacity: 0.5 };
export const GLOW = 6;
export const SHINE = 0.5;

/** The spec with the part added, with defaults (it is left alone when it has the part). */
export function addPart(g: VectorGauge, id: PartId): VectorGauge {
  if (hasPart(g, id)) return g;
  switch (id) {
    case "track": return { ...g, track: DEFAULT_GAUGE.track };
    case "needle": return { ...g, needle: NEEDLE };
    case "marker": return { ...g, needle: MARKER };
    case "ticks": return { ...g, ticks: TICKS };
    case "labels": return { ...g, ticks: { ...(g.ticks ?? TICKS), labels: LABELS } };
    case "text": return { ...g, text: TEXT };
    case "title": return { ...g, title: TITLE };
    case "background": return { ...g, background: BACKGROUND };
    case "face": return { ...g, face: DEFAULT_FACE };
    case "rings": return { ...g, rings: DEFAULT_RINGS };
    case "pattern": return { ...g, pattern: DEFAULT_PATTERN };
    case "icons": return { ...g, icons: DEFAULT_ICONS };
    case "icon": return { ...g, icon: DEFAULT_ICON };
    case "glow": return { ...g, glow: GLOW };
    case "shadow": return { ...g, shadow: SHADOW };
    case "wave": return withLiquid(g, { amplitude: DEFAULT_LIQUID.amplitude });
    case "shine": return withLiquid(g, { shine: SHINE });
    case "bubbles": return withLiquid(g, { bubbles: BUBBLES });
    default: return g;
  }
}

/** The spec without the part (Shape and Fill stay). */
export function removePart(g: VectorGauge, id: PartId): VectorGauge {
  if (!hasPart(g, id) || ALWAYS_ON.includes(id)) return g;
  switch (id) {
    case "track": return { ...g, track: null };
    case "needle":
    case "marker": return { ...g, needle: null };
    case "ticks": return { ...g, ticks: null };
    case "labels": {
      const { labels: _, ...ticks } = g.ticks!;
      return { ...g, ticks };
    }
    case "text": return without(g, "text");
    case "title": return without(g, "title");
    case "background": return without(g, "background");
    case "face": return without(g, "face");
    case "rings": return without(g, "rings");
    case "pattern": return without(g, "pattern");
    case "icons": return without(g, "icons");
    case "icon": return without(g, "icon");
    case "glow": return without(g, "glow");
    case "shadow": return without(g, "shadow");
    case "wave": return withLiquid(g, { amplitude: 0 });
    case "shine": return withoutLiquidKey(g, "shine");
    case "bubbles": return withoutLiquidKey(g, "bubbles");
    default: return g;
  }
}

export const togglePart = (g: VectorGauge, id: PartId): VectorGauge => (hasPart(g, id) ? removePart(g, id) : addPart(g, id));

/**
 * The spec drawn as another shape. Leaving "svg" drops the template; choosing it starts from the sample;
 * liquid and grid start with their defaults. Parts the new shape lacks stay in the spec, unseen and undrawn.
 */
export function withShape(g: VectorGauge, shape: Shape): VectorGauge {
  const { template, ...rest } = g;
  const next: VectorGauge = { ...rest, shape };
  if (shape === "liquid") return { ...next, liquid: g.liquid ?? { ...DEFAULT_LIQUID } };
  if (shape === "grid") return { ...next, grid: g.grid ?? { ...DEFAULT_GRID } };
  if (shape === "svg") return template ? { ...next, template } : { ...next, template: SAMPLE_TEMPLATE, width: 200, height: 200 };
  return next;
}

/** The part to show when the selected one is gone (a shape change hid it). */
export const selectable = (g: VectorGauge, id: PartId): PartId => (partsFor(g.shape).some((p) => p.id === id) ? id : "shape");
