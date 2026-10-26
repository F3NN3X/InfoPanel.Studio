// ThresholdTimeline's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const MAX_LANES = 6;

export const meta: WidgetMeta = {
  id: "ThresholdTimeline",
  name: "Threshold Timeline",
  category: "Generic",
  icon: "health_metrics",
  prefixes: [],
  defaultSize: [4, 2],
  minSize: [2, 1],
  blurb: "Green, amber and red lanes over minutes",
  tags: "timeline history lanes threshold heat strip status minutes",
  description: "One lane per sensor (up to six), coloured green, amber or red by its thresholds over the last few minutes. Shows when a sensor was hot, not just that it is. Nothing is stored: a reload starts again.",
};
