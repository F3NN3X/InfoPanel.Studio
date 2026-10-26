// RadialClockStack's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "RadialClockStack",
  name: "Radial Clock Stack",
  category: "Info",
  icon: "donut_large",
  prefixes: [],
  defaultSize: [2, 2],
  minSize: [1, 1],
  blurb: "Day, year, sensor and next event as rings",
  tags: "rings clock progress year week day calendar time",
  description: "Concentric rings for how far the day and the year (or week) have gone, one sensor and the time to the next calendar event, with the time in the middle.",
};
