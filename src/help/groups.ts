import type { GroupDef } from "./types";

/** The nav groups and their article ids; the order here is the reading order (Previous / Next). */
export const HELP_GROUPS: GroupDef[] = [
  { label: "Start here", articles: ["welcome", "quickstart", "concepts"] },
  { label: "Build", articles: ["studio", "profiles", "zones", "widgets", "panels", "panel-widgets", "presets"] },
  { label: "Style", articles: ["themes", "widget-settings", "background", "custom-css"] },
  { label: "Data", articles: ["sensors", "agents"] },
  { label: "Import from InfoPanel", articles: ["import", "canvas", "remap", "assets", "gauges"] },
  { label: "Run", articles: ["kiosk", "startup", "updates"] },
  { label: "Troubleshoot", articles: ["problems", "diagnostics"] },
  { label: "Reference", articles: ["shortcuts", "glossary"] },
];
