// Forecast's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "Forecast",
  name: "Forecast",
  category: "Info",
  icon: "calendar_month",
  prefixes: [],
  defaultSize: [4, 1],
  minSize: [1, 1],
  blurb: "Multi-day forecast with highs and lows",
  tags: "weather",
  description: "Multi-day MET/Yr forecast — horizontal in wide zones, vertical list in tall ones, with hi/lo range bars.",
};
