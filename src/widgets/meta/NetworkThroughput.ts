// NetworkThroughput's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "NetworkThroughput",
  name: "Network Traffic",
  category: "Network",
  icon: "swap_vert",
  prefixes: [],
  defaultSize: [3, 1],
  minSize: [1, 1],
  blurb: "Live download and upload",
  tags: "internet bandwidth speed",
  description: "Live download / upload rate with history, totals and utilisation per adapter.",
};
