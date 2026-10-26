// StorageHealth's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "StorageHealth",
  name: "SSD Health",
  category: "Storage",
  icon: "health_metrics",
  prefixes: [],
  defaultSize: [3, 2],
  minSize: [1, 1],
  blurb: "SMART life, temperature and TBW",
  tags: "disk smart nvme",
  description: "SMART life, temperature, read/write rate, activity, TBW, spare and power-on hours.",
};
