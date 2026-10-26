// GpuRings's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "GpuRings",
  name: "GPU Rings",
  category: "Hardware",
  icon: "donut_large",
  prefixes: [],
  defaultSize: [3, 2],
  minSize: [1, 1],
  blurb: "GPU load, VRAM and temperature as rings",
  tags: "graphics vram",
  description: "Stacked radial rings for bounded percentages only — VRAM outer, core load inner, temperature in the centre — with a legend of clocks, power and fans.",
};
