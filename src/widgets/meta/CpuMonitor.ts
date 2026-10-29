// CpuMonitor's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "CpuMonitor",
  name: "CPU Monitor",
  category: "Hardware",
  icon: "memory",
  prefixes: [],
  defaultSize: [3, 2],
  minSize: [1, 1],
  blurb: "Load, clocks, temperature and power",
  tags: "processor cores temp watts",
  description: "Total + per-core load, clocks, temperature, package power, VID, VRM and fan.",
};
