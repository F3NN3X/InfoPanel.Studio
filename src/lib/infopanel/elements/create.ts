/**
 * The Add palette's Elements group: each studio element as a new InfoPanel item carrying its spec,
 * in the profile's palette (every colour follows a slot until the user picks a fixed one).
 */
import { bindItem } from "../canvas-edit.ts";
import { newItem } from "../editor/create.ts";
import { defaultItem, type DisplayItem, type GroupItem, type Profile } from "../schema.ts";
import { applyElement } from "./apply.ts";
import type { CoreSensor } from "./cores.ts";
import { slotInk, type Palette } from "./palette.ts";
import type { CoresSpec, ElementSpec, ElementType } from "./spec.ts";

export interface ElementEntry {
  type: ElementType;
  label: string;
  /** Adding it asks for a sensor next. */
  sensor: boolean;
  /** One line for the button's tooltip. */
  hint: string;
}

export const ELEMENTS: readonly ElementEntry[] = [
  { type: "ring", label: "Ring", sensor: true, hint: "A value arc with a gradient, end dot, ticks or LED segments; baked to gauge frames" },
  { type: "ledbar", label: "LED bar", sensor: true, hint: "A segmented bar; baked to gauge frames" },
  { type: "card", label: "Card", sensor: false, hint: "A rounded card; a Shape, or one image with a gradient, shadow or glow" },
  { type: "glow", label: "Glow", sensor: false, hint: "A soft radial light behind content; one image" },
  { type: "divider", label: "Divider", sensor: false, hint: "A thin line, solid or gradient" },
  { type: "icon", label: "Icon", sensor: false, hint: "A lucide icon; one image" },
  { type: "cores", label: "Cores", sensor: false, hint: "One Bar per CPU core or thread, bound to its load" },
  { type: "sparkline", label: "Sparkline", sensor: true, hint: "A line or area graph; exported as InfoPanel’s Graph" },
];

/** How many bars Cores shows when the machine's cores can't be found (unbound, for the preview). */
export const PLACEHOLDER_CORES = 8;

type Look = Pick<Profile, "Font" | "FontSize" | "Color" | "BackgroundColor">;

const named = (kind: Parameters<typeof defaultItem>[0], name: string, fields: Record<string, unknown>, element: ElementSpec): DisplayItem =>
  applyElement({ ...defaultItem(kind), Name: name, ...fields, element } as unknown as DisplayItem);

/** The cores' bars: one per sensor, bound natively from its ref; placeholders, unbound, when there are none. */
export function coreBars(profile: Look, palette: Palette, cores: readonly CoreSensor[]): DisplayItem[] {
  const bar = (name: string) => ({ ...newItem("Bar", profile, palette), Name: name, MinValue: 0, MaxValue: 100 }) as DisplayItem;
  if (cores.length === 0) return Array.from({ length: PLACEHOLDER_CORES }, (_, i) => bar(`Core ${i + 1}`));
  return cores.map((c) => bindItem(bar(c.thread ? `Core ${c.core} thread ${c.thread}` : `Core ${c.core}`), c));
}

/** A Cores group at `x`, `y` with its bars laid out. */
export function newCores(profile: Look, palette: Palette, cores: readonly CoreSensor[], x: number, y: number): GroupItem {
  const spec: CoresSpec = {
    type: "cores", orientation: "horizontal", gap: 3, width: Math.max(80, Math.min(400, cores.length * 12 || 160)), height: 60,
    radius: 2, track: slotInk(palette, "track"), fill: slotInk(palette, "accent1"),
  };
  const group = { ...defaultItem("Group"), Name: "Cores", X: x, Y: y, DisplayItems: coreBars(profile, palette, cores), element: spec };
  return applyElement(group as unknown as DisplayItem) as GroupItem;
}

/** A new element of `type`, not placed yet (Cores is placed by `newCores`). */
export function newElement(type: Exclude<ElementType, "cores">, profile: Look, palette: Palette): DisplayItem {
  const ink = (slot: Parameters<typeof slotInk>[1]) => slotInk(palette, slot);
  switch (type) {
    case "ring":
      return named("Gauge", "Ring", { Width: 120, Height: 120 }, {
        type: "ring", start: -135, sweep: 270, thickness: 12, track: ink("track"), fill: [ink("accent1"), ink("accent2")],
        rounded: true, dot: true, ticks: 0, segments: 0, gap: 3, glow: 0,
      });
    case "ledbar":
      return named("Gauge", "LED bar", { Width: 240, Height: 16 }, {
        type: "ledbar", orientation: "horizontal", segments: 16, gap: 3, radius: 2, track: ink("track"), fill: [ink("accent1"), ink("accent2")], glow: 0,
      });
    case "card":
      return named("Shape", "Card", { Width: 220, Height: 140 }, { type: "card", radius: 14, fill: [ink("card")], angle: 0, stroke: null, shadow: null, glow: null, pad: 0 });
    case "glow":
      return named("Image", "Glow", { Width: 240, Height: 240 }, { type: "glow", color: ink("accent1"), alpha: 0.35, radius: 120 });
    case "divider":
      return named("Shape", "Divider", { Width: 200, Height: 1 }, { type: "divider", orientation: "horizontal", thickness: 1, fill: [ink("track")] });
    case "icon":
      return named("Image", "Icon", { Width: 48, Height: 48 }, { type: "icon", name: "cpu", color: ink("accent1") });
    case "sparkline": {
      const graph = { ...newItem("Graph", profile, palette), Name: "Sparkline", Height: 60, Background: false };
      return applyElement({ ...graph, element: { type: "sparkline", style: "area", color: ink("accent1"), dot: true, gradient: true } } as unknown as DisplayItem);
    }
  }
}
