// SystemStatus's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "SystemStatus",
  name: "System Status",
  category: "System",
  icon: "monitor_heart",
  prefixes: ["system."],
  defaultSize: [2, 1],
  minSize: [1, 1],
  blurb: "CPU, RAM and Data API health",
  tags: "health api cpu ram",
  description: "CPU + RAM load and Data API health.",
};
