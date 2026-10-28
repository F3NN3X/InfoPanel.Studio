// MeterBridge's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "MeterBridge",
  name: "Meter Bridge",
  category: "Audio",
  icon: "graphic_eq",
  prefixes: [],
  defaultSize: [4, 3],
  minSize: [1, 1],
  blurb: "Multi-channel dB meters",
  tags: "level studio sound",
  description: "Studio-style multi-channel level meters: dB scale, stereo LED ladders with dimmed zone colors, peak-hold markers, per-channel volume and live L/R dB readouts.",
};
