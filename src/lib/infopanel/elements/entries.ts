/**
 * The Add palette's studio elements, in palette order, with their tooltips. Light on purpose: the studio's Add panel
 * lists them as tiles without loading the element model (`create.ts` re-exports them).
 */
import type { ElementType } from "./spec.ts";

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
