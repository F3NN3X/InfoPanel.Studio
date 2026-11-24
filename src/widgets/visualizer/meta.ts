// Visualizer's catalog entry: pure data, so the registry and the generator read it without the component.
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
  layouts: [
    { id: "standard", name: "Standard" },
    { id: "spectrum", name: "Spectrum receiver" },
  ],
};
