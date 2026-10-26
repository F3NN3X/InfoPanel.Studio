// BottleneckLens's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "BottleneckLens",
  name: "Bottleneck Lens",
  category: "Gaming",
  icon: "speed",
  prefixes: [],
  defaultSize: [4, 2],
  minSize: [2, 1],
  blurb: "What holds your frame rate back",
  tags: "bottleneck cpu gpu vram throttle limit game verdict",
  description: "One verdict line for what holds a game back (CPU-bound, GPU-bound, VRAM full, thermal or power throttled, or balanced) with the reason in small type. A verdict has to hold for a few seconds before it changes. Quiet when no game runs.",
};
