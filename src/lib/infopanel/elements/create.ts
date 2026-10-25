/**
 * The Add palette's Elements group: each studio element as a new InfoPanel item carrying its spec,
 * in the profile's palette (every colour follows a slot until the user picks a fixed one).
 */
import { bindItem } from "../canvas-edit.ts";
import type { ChosenSensor } from "../editor/bind.ts";
import { newItem } from "../editor/create.ts";
import { defaultItem, type DisplayItem, type GroupItem, type Profile } from "../schema.ts";
import { applyElement } from "./apply.ts";
import type { CoreSensor } from "./cores.ts";
import { shortDriveName, type DriveSensors } from "./drives.ts";
import { slotInk, type Palette } from "./palette.ts";
import type { CoresSpec, ElementSpec, ElementType, RowLook } from "./spec.ts";

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
  { type: "sparkline", label: "Sparkline", sensor: true, hint: "A line, area or histogram graph; exported as InfoPanel’s Graph" },
  { type: "row", label: "Row", sensor: false, hint: "A label, its value right-aligned, an optional icon and thin bar; a Group of Text and Value" },
  { type: "rows", label: "Rows", sensor: false, hint: "A list of rows, evenly spaced; a Group of row Groups" },
  { type: "stack", label: "Graph stack", sensor: false, hint: "2 to 4 labelled graphs in rows; Text and Graph items" },
  { type: "dual", label: "Dual graph", sensor: false, hint: "Two series overlaid on transparent Graphs" },
  { type: "doublering", label: "Double ring", sensor: false, hint: "An outer and an inner ring, each on its own sensor, and a centre value; baked to gauge frames" },
  { type: "drives", label: "Drives", sensor: false, hint: "One tile per drive: name, used bar, temperature and free space" },
  { type: "shadowtext", label: "Shadow text", sensor: false, hint: "A Text or Value with a dark offset shadow; two Texts, approximated" },
];

/** The elements that are a Group the element lays out, apart from Cores (which `newCores` makes). */
export type CompositeType = "row" | "rows" | "stack" | "dual" | "doublering" | "drives" | "shadowtext";
export const isComposite = (t: ElementType): t is CompositeType => ["row", "rows", "stack", "dual", "doublering", "drives", "shadowtext"].includes(t);

/** How many tiles Drives shows when the machine's drives can't be found (unbound, for the preview). */
export const PLACEHOLDER_DRIVES = 3;

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
export function newElement(type: Exclude<ElementType, "cores" | CompositeType>, profile: Look, palette: Palette): DisplayItem {
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
      return applyElement({ ...graph, element: { type: "sparkline", style: "area", color: ink("accent1"), dot: true, gradient: true, fillAlpha: 0.25 } } as unknown as DisplayItem);
    }
  }
}

/** A row's look in the palette: the label in the sub-text slot, the value in the text slot. */
export const rowLook = (palette: Palette, over: Partial<RowLook> = {}): RowLook => ({
  size: 14, label: slotInk(palette, "subtext"), value: slotInk(palette, "text"), valueGlow: null, icon: null, iconInk: slotInk(palette, "accent1"),
  bar: false, barFill: slotInk(palette, "accent1"), barTrack: slotInk(palette, "track"), ...over,
});

const rowGroup = (profile: Look, palette: Palette, label: string): DisplayItem[] => [
  { ...newItem("Text", profile, palette), Name: label },
  { ...newItem("Sensor", profile, palette), Name: "Value" },
];

/** One drive's tile: a card, an icon, the name, the used bar and %, the temperature and the free space, bound natively where the sensors are known. */
export function driveTile(profile: Look, palette: Palette, drive: DriveSensors | null, n: number): DisplayItem {
  const bind = (item: DisplayItem, sensor: ChosenSensor | undefined) => (sensor ? bindItem(item, sensor) : item);
  const name = drive?.name ?? `Drive ${n}`;
  return {
    ...defaultItem("Group"), Name: name, ...(drive ? { driveId: drive.id } : {}),
    DisplayItems: [
      newItem("Shape", profile, palette),
      defaultItem("Image"),
      { ...newItem("Text", profile, palette), Name: shortDriveName(name) },
      { ...newItem("Bar", profile, palette), MinValue: 0, MaxValue: 100 },
      bind(newItem("Sensor", profile, palette), drive?.used),
      bind(newItem("Sensor", profile, palette), drive?.temp),
      bind(newItem("Sensor", profile, palette), drive?.free),
    ],
  } as DisplayItem;
}

/** The size a composite element covers, from its spec. */
export function elementSize(spec: ElementSpec): { width: number; height: number } {
  switch (spec.type) {
    case "rows":
    case "stack":
      return { width: spec.width, height: spec.count * spec.height + (spec.count - 1) * spec.gap };
    case "doublering":
      return { width: spec.size, height: spec.size };
    case "cores":
    case "row":
    case "dual":
    case "drives":
      return { width: spec.width, height: spec.height };
    case "shadowtext":
      return { width: 160, height: 40 };
    default:
      return { width: 0, height: 0 };
  }
}

/** A composite element's Group at `x`, `y` with its children laid out (a shadowed text is placed by its text). */
export function newComposite(type: CompositeType, profile: Look, palette: Palette, drives: readonly DriveSensors[], x: number, y: number): GroupItem {
  const ink = (slot: Parameters<typeof slotInk>[1]) => slotInk(palette, slot);
  const base = { ...defaultItem("Group"), X: x, Y: y };
  const make = (name: string, element: ElementSpec, DisplayItems: DisplayItem[] = []) => applyElement({ ...base, Name: name, DisplayItems, element } as unknown as DisplayItem) as GroupItem;
  switch (type) {
    case "row":
      return make("Row", { type: "row", width: 240, height: 28, ...rowLook(palette, { bar: true }) }, rowGroup(profile, palette, "Label"));
    case "rows":
      return make("Rows", { type: "rows", count: 4, gap: 4, width: 240, height: 28, ...rowLook(palette) }, [1, 2, 3, 4].map((i) => ({ ...defaultItem("Group"), Name: `Row ${i}`, DisplayItems: rowGroup(profile, palette, `Row ${i}`) }) as DisplayItem));
    case "stack": {
      const kids = [1, 2, 3].flatMap((i) => [{ ...newItem("Text", profile, palette), Name: `Graph ${i}` }, newItem("Graph", profile, palette)]);
      return make("Graph stack", { type: "stack", count: 3, gap: 8, width: 300, height: 56, size: 14, label: ink("subtext"), color: ink("accent1"), area: true }, kids);
    }
    case "dual":
      return make("Dual graph", { type: "dual", width: 300, height: 80, a: ink("accent1"), b: ink("accent2"), area: true }, [newItem("Graph", profile, palette), newItem("Graph", profile, palette)]);
    case "doublering":
      return make("Double ring", {
        type: "doublering", size: 160, thickness: 12, gap: 6, start: -135, sweep: 270, track: ink("track"), outer: [ink("accent1")], inner: [ink("accent2")],
        innerThresholds: [], valueSize: 28, value: ink("text"), valueGlow: null,
      }, [newItem("Gauge", profile, palette), newItem("Gauge", profile, palette), newItem("Sensor", profile, palette)]);
    case "drives": {
      const tiles = drives.length ? drives : Array.from({ length: PLACEHOLDER_DRIVES }, () => null);
      return make("Drives", {
        type: "drives", orientation: "horizontal", gap: 12, width: Math.max(300, tiles.length * 200), height: 120, radius: 10,
        card: ink("card"), text: ink("text"), sub: ink("subtext"), fill: ink("accent1"), track: ink("track"), icon: ink("accent1"),
      }, tiles.map((d, i) => driveTile(profile, palette, d, i + 1)));
    }
    case "shadowtext": {
      const text = { ...newItem("Sensor", profile, palette), Name: "Value", X: x, Y: y, FontSize: 28, Width: 160, Height: 40 } as DisplayItem;
      return make("Shadow text", { type: "shadowtext", dx: 1, dy: 2, color: { color: "#99000000" } }, [text, text]);
    }
  }
}

/**
 * The rounded gradient progress bar as a preset of InfoPanel's own Bar: corners at half the height,
 * a gradient from accent 1 to accent 2, no frame. It sets existing fields only; the bar stays a Bar.
 */
export function gradientBar(item: DisplayItem, palette: Palette): DisplayItem {
  if (item.kind !== "Bar") return item;
  return {
    ...item, CornerRadius: Math.floor(item.Height / 2), Gradient: true, GradientColor: palette.accent2, Color: palette.accent1, Frame: false,
    slots: { ...(item as DisplayItem & { slots?: object }).slots, Color: { slot: "accent1" }, GradientColor: { slot: "accent2" } },
  } as unknown as DisplayItem;
}
