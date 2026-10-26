// SessionStats's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const MAX_SENSORS = 6;

export const meta: WidgetMeta = {
  id: "SessionStats",
  name: "Session Stats",
  category: "Generic",
  icon: "query_stats",
  prefixes: [],
  defaultSize: [4, 3],
  minSize: [2, 1],
  blurb: "Min, max, average and time above a level",
  tags: "session min max average peak history statistics time above",
  description: "Min, max, average and the time above a level for up to six sensors, counted since the page loaded. Nothing is stored: a reload starts again, and Reset in the studio starts over.",
};
