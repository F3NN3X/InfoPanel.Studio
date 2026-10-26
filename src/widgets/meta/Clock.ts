// Clock's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "Clock",
  name: "Clock",
  category: "Info",
  icon: "schedule",
  prefixes: ["plugins.clock-plugin."],
  defaultSize: [2, 1],
  minSize: [1, 1],
  blurb: "Digital or analog clock with date",
  tags: "time",
  description: "Digital or analog clock with date, 12/24h and seconds.",
};
