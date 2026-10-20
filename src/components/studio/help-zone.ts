import type { StudioHelpState } from "@/help/context";
import { BLANK_MODULE, CANVAS_ID, PANEL_ID, type Placement } from "@/lib/layout";

/** What F1 calls the selected zone: a widget, a panel, an imported canvas or a blank zone. */
export function helpZoneKind(zone: Placement | null): StudioHelpState["zone"] {
  if (!zone) return null;
  if (zone.module === PANEL_ID || zone.panel) return "panel";
  if (zone.module === CANVAS_ID) return "canvas";
  return zone.module === BLANK_MODULE ? "blank" : "widget";
}
