// CoreHeatmap's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "CoreHeatmap",
  name: "Core Heatmap",
  category: "Hardware",
  icon: "grid_on",
  prefixes: [],
  defaultSize: [2, 2],
  minSize: [1, 1],
  blurb: "Per-core load as a heatmap",
  tags: "cpu cores honeycomb waterfall",
  description: "Per-core CPU heatmap in four shapes: grid, honeycomb, radial and a scrolling waterfall, with selectable color ramps.",
};
