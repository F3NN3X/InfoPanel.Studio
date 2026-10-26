// Visualizer's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "Visualizer",
  name: "Visualizer",
  category: "Audio",
  icon: "equalizer",
  prefixes: [],
  defaultSize: [3, 2],
  minSize: [1, 1],
  blurb: "Animated audio visualiser",
  tags: "spectrum bars sound",
  description: "Canvas audio visualiser driven by the level meter (L/R + level): bars, mirror, radial, wave, line, blob, LED-dot and scrolling modes at 60 fps.",
};
