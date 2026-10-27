/**
 * The Add palette's InfoPanel item kinds, in palette order with their groups (Text, Data, Media, Layout). Light on
 * purpose: the studio's Add panel lists them as tiles without loading the item model (`create.ts` re-exports them).
 */
import type { ItemKind } from "../schema.ts";

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
