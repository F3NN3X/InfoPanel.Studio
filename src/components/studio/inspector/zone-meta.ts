import { BLANK_MODULE, type Placement } from "@/lib/layout";
import { placementTitle } from "../studio-modules";

/**
 * The inspector header's name and meta line for a zone (README §4.6):
 * widget `3×2 · min 2×1 · N data points`, panel `Panel · Stack · 3 widgets`,
 * blank `Blank zone · 2×1`.
 */

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** The panel layout as the header names it (legacy "wrap" / none is a stack). */
export function panelLayoutName(layout: string | undefined): string {
  if (layout === "grid") return "Grid";
  if (layout === "overlay") return "Overlay";
  return "Stack";
}

export function zoneMeta(zone: Placement, info: { dataPoints: number; min: { cols: number; rows: number } }): string {
  const size = `${zone.colSpan}×${zone.rowSpan}`;
  if (zone.module === BLANK_MODULE) return `Blank zone · ${size}`;
  if (zone.panel) {
    return `Panel · ${panelLayoutName(zone.panel.layout)} · ${plural(zone.panel.widgets.length, "widget")}`;
  }
  return `${size} · min ${info.min.cols}×${info.min.rows} · ${plural(info.dataPoints, "data point")}`;
}

/** The name the header shows: a widget's custom title, else its kind's name. */
export function zoneName(zone: Placement): string {
  if (zone.module === BLANK_MODULE) return "Blank zone";
  if (zone.name) return zone.name;
  if (zone.panel) return placementTitle(zone);
  const label = String(zone.settings?.label ?? "").trim();
  return label !== "" ? label : placementTitle(zone);
}
