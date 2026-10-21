/** Help nav order: groups in reading order, each listing article ids (the file names in `articles/`). */
export const HELP_GROUPS: { label: string; articles: string[] }[] = [
  { label: "Start here", articles: ["welcome", "quickstart", "concepts"] },
  {
    label: "Build",
    articles: ["studio", "profiles", "zones", "widgets", "panels", "panel-widgets", "presets", "library"],
  },
  { label: "Style", articles: ["themes", "widget-settings", "background", "custom-css", "island-alerts"] },
  { label: "Data", articles: ["sensors", "agents"] },
  { label: "Import from InfoPanel", articles: ["import", "canvas", "remap", "assets", "gauges"] },
  { label: "Run", articles: ["kiosk", "performance", "startup", "updates"] },
  { label: "Troubleshoot", articles: ["problems", "diagnostics"] },
  { label: "Reference", articles: ["shortcuts", "glossary"] },
];
