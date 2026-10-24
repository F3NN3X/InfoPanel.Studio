/**
 * New items as InfoPanel's own editor makes them (`CommonActions`, `SensorActions`,
 * `PluginSensors`), and where they go in the tree (`SharedModel.AddDisplayItem`).
 */
import { defaultItem, type DisplayItem, type ItemKind, type Profile } from "../schema.ts";
import { isBound } from "../sensors.ts";
import { itemAt, updateAt, type Path } from "./ops.ts";

export type PaletteGroup = "Text" | "Data" | "Media" | "Layout";

export interface PaletteEntry {
  kind: ItemKind;
  label: string;
  group: PaletteGroup;
  /** Adding it asks for a sensor next. */
  sensor: boolean;
  /** Its sensor must be a plugin's (InfoPanel lists these under plugins only). */
  pluginOnly?: boolean;
  /** Adding it asks for an image file first. */
  file?: boolean;
}

/** Every native kind, in palette order. */
export const PALETTE: readonly PaletteEntry[] = [
  { kind: "Text", label: "Text", group: "Text", sensor: false },
  { kind: "Sensor", label: "Value", group: "Text", sensor: true },
  { kind: "Clock", label: "Clock", group: "Text", sensor: false },
  { kind: "Calendar", label: "Calendar", group: "Text", sensor: false },
  { kind: "TableSensor", label: "Table", group: "Data", sensor: true, pluginOnly: true },
  { kind: "Bar", label: "Bar", group: "Data", sensor: true },
  { kind: "Graph", label: "Graph", group: "Data", sensor: true },
  { kind: "Donut", label: "Donut", group: "Data", sensor: true },
  { kind: "Gauge", label: "Gauge", group: "Data", sensor: true },
  { kind: "Image", label: "Image", group: "Media", sensor: false, file: true },
  { kind: "HttpImage", label: "Web image", group: "Media", sensor: true, pluginOnly: true },
  { kind: "SensorImage", label: "Sensor image", group: "Media", sensor: true, file: true },
  { kind: "Shape", label: "Shape", group: "Layout", sensor: false },
  { kind: "Group", label: "Group", group: "Layout", sensor: false },
];

export const PALETTE_GROUPS: readonly PaletteGroup[] = ["Text", "Data", "Media", "Layout"];

/** InfoPanel's name for a new item of each kind (sensor kinds take the sensor's name once one is chosen). */
const NAMES: Record<ItemKind, string> = {
  Text: "Custom Text",
  Sensor: "Sensor",
  Clock: "Clock",
  Calendar: "Calendar",
  TableSensor: "Table",
  Bar: "Bar",
  Graph: "Graph",
  Donut: "Donut",
  Gauge: "Gauge",
  Image: "Image",
  HttpImage: "Web image",
  SensorImage: "Sensor image",
  Shape: "Shape",
  Group: "New Group",
};

/**
 * A new item of `kind` with InfoPanel's creation defaults: text kinds and Value take the profile's
 * Font, FontSize and Color (Clock and Calendar uppercase, as CommonActions makes them); Donut is
 * 100×100 without a frame on #FFDCDCDC; the images a sensor drives are 100×100. Every other field
 * is the constructor's default (`defaultItem`).
 */
export function newItem(kind: ItemKind, profile: Pick<Profile, "Font" | "FontSize" | "Color">): DisplayItem {
  const base = { ...defaultItem(kind), Name: NAMES[kind] } as DisplayItem;
  const look = { Font: profile.Font, FontSize: profile.FontSize, Color: profile.Color };
  switch (kind) {
    case "Text":
    case "Sensor":
      return { ...base, ...look } as DisplayItem;
    case "Clock":
    case "Calendar":
      return { ...base, ...look, Uppercase: true } as DisplayItem;
    case "Donut":
      return { ...base, Frame: false, BackgroundColor: "#FFDCDCDC", Width: 100, Height: 100, Rotation: 90 } as DisplayItem;
    case "HttpImage":
    case "SensorImage":
      return { ...base, Width: 100, Height: 100 } as DisplayItem;
    default:
      return base;
  }
}

/** A sensor item named for its sensor, as InfoPanel's sensor tree names it; Value also takes the unit. */
export function namedFor(item: DisplayItem, sensor: { name: string; unit?: string }): DisplayItem {
  if (!isBound(item)) return item;
  return { ...item, Name: sensor.name, ...(item.kind === "Sensor" && sensor.unit ? { Unit: sensor.unit } : {}) } as DisplayItem;
}

const parentOf = (p: Path) => p.split(".").slice(0, -1).join(".");
const child = (parent: Path, i: number) => (parent === "" ? String(i) : `${parent}.${i}`);

/**
 * Inserts a new item where InfoPanel's AddDisplayItem puts it: into the selected group unless it
 * is locked, else into the group holding the selected item unless that is locked, else at the
 * end of the top level (drawn in front). A group never goes into a group: with a top-level item
 * selected it goes right after it (`PushDisplayItemTo`). Returns the new item's path.
 */
export function insertItem(items: readonly DisplayItem[], item: DisplayItem, selected: Path | null): { items: DisplayItem[]; path: Path } {
  const sel = selected ? itemAt(items, selected) : undefined;
  if (sel && selected && item.kind !== "Group") {
    const target = sel.kind === "Group" ? selected : parentOf(selected);
    const group = target === "" ? undefined : itemAt(items, target);
    if (group?.kind === "Group" && !group.IsLocked) {
      const next = updateAt(items, target, (g) => (g.kind === "Group" ? { ...g, DisplayItems: [...g.DisplayItems, item] } : g));
      return { items: next, path: child(target, group.DisplayItems.length) };
    }
  }
  if (sel && selected && item.kind === "Group" && !selected.includes(".")) {
    const i = Number(selected) + 1;
    return { items: [...items.slice(0, i), item, ...items.slice(i)], path: String(i) };
  }
  return { items: [...items, item], path: String(items.length) };
}

/** The size an item is drawn at before it has been measured: its box, else about one line of its text. */
function roughSize(item: DisplayItem, fontScale: number): { width: number; height: number } {
  const w = "Width" in item ? item.Width : 0;
  const h = "Height" in item ? item.Height : 0;
  if (w > 0 && h > 0) return { width: w, height: h };
  const size = "FontSize" in item ? item.FontSize * fontScale : 20;
  const chars = item.kind === "Clock" ? 11 : item.kind === "Calendar" ? 10 : item.Name.length || 8;
  return { width: w > 0 ? w : Math.round(chars * size * 0.55), height: h > 0 ? h : Math.round(size * 1.25) };
}

/** The item moved so it is centred on the canvas (a group's children move with it; it has no box of its own). */
export function centred(item: DisplayItem, profile: Pick<Profile, "Width" | "Height" | "FontScale">): DisplayItem {
  if (item.kind === "Group") return item;
  const { width, height } = roughSize(item, profile.FontScale);
  return { ...item, X: Math.round((profile.Width - width) / 2), Y: Math.round((profile.Height - height) / 2) } as DisplayItem;
}
