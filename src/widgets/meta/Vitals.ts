// Vitals's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "Vitals",
  name: "Vitals",
  category: "System",
  icon: "vital_signs",
  prefixes: [],
  defaultSize: [4, 1],
  minSize: [1, 1],
  blurb: "CPU, GPU, RAM and network side by side",
  tags: "cpu gpu ram network",
  description: "CPU, GPU, RAM and network side-by-side. Reflows into a row, 2×2 grid or stack to suit its size.",
};
