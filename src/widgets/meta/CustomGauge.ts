// CustomGauge's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "CustomGauge",
  name: "Custom gauge",
  category: "Generic",
  icon: "gauge",
  prefixes: [],
  defaultSize: [1, 1],
  minSize: [1, 1],
  blurb: "A gauge you design, on any value",
  tags: "gauge dial custom",
  description: "A gauge you design in Gauges, driven by any one data point.",
};
