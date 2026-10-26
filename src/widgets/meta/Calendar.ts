// Calendar's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "Calendar",
  name: "Calendar",
  category: "Info",
  icon: "calendar_today",
  prefixes: [],
  defaultSize: [2, 2],
  minSize: [1, 1],
  blurb: "Today and a month grid",
  tags: "date month",
  description: "Today plus a month grid, driven by the clock plugin date. Week starts Monday by default.",
};
