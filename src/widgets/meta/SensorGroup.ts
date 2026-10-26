// SensorGroup's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "SensorGroup",
  name: "Sensor Group",
  category: "Generic",
  icon: "view_list",
  prefixes: [],
  defaultSize: [2, 2],
  minSize: [1, 1],
  blurb: "Any list of values as rows or tiles",
  tags: "bind list custom",
  description: "Bind any list of data points. Rows or a tile grid, each with optional bar and thresholds.",
  viewKey: "groupLayout",
  views: [
    { id: "auto", name: "Auto" },
    { id: "rows", name: "Rows", blurb: "Any list of values, one per row", tags: "list table" },
    { id: "grid", name: "Grid", blurb: "Any list of values as a tile grid", tags: "tiles cards" },
  ],
};
