// MemoryUsage's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "MemoryUsage",
  name: "Memory",
  category: "Hardware",
  icon: "memory_alt",
  prefixes: ["libre.total_memory", "libre.virtual_memory"],
  defaultSize: [2, 1],
  minSize: [1, 1],
  blurb: "Physical and virtual memory in use",
  tags: "ram",
  description: "Physical + virtual memory load, used and available.",
};
