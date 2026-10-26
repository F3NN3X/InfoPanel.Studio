// Countdown's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "Countdown",
  name: "Countdown",
  category: "Info",
  icon: "event",
  prefixes: [],
  defaultSize: [4, 2],
  minSize: [1, 1],
  blurb: "Days until an event",
  tags: "event countdown since until date",
  description: "Counts down to an event, or up from it: years, months, days and live hours, minutes and seconds.",
  views: [
    { id: "inline", name: "Inline" },
    { id: "tiles", name: "Tiles", blurb: "Each unit in its own box" },
    { id: "big", name: "Big number", blurb: "One large number" },
  ],
};
