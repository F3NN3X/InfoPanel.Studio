// SystemOverview's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "SystemOverview",
  name: "System Overview",
  category: "System",
  icon: "dashboard",
  prefixes: [],
  defaultSize: [5, 2],
  minSize: [1, 1],
  blurb: "CPU, GPU and RAM in one panel",
  tags: "overview vram rings heatmap",
  description: "Unified CPU · GPU · RAM (+ VRAM, drives, network) panel. Each section has its own colour, ring, stats, smooth graph; CPU adds a load-intensity core heatmap.",
  views: [
    { id: "panel", name: "Panel" },
    { id: "graphs", name: "Graphs", blurb: "One sparkline row per metric", defaultSize: [4, 3] },
    { id: "gauges", name: "Gauges", blurb: "Open-arc dials per metric", defaultSize: [4, 3] },
  ],
};
