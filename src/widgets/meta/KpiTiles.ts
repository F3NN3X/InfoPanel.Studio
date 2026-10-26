// KpiTiles's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "KpiTiles",
  name: "KPI Tiles",
  category: "System",
  icon: "query_stats",
  prefixes: [],
  defaultSize: [6, 1],
  minSize: [1, 1],
  blurb: "Four key numbers with trends",
  tags: "kpi sparkline trend",
  description: "The four numbers you check first: value, change since ~10 readings ago, then a trend sparkline with a live end dot.",
};
