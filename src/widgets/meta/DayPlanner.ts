// DayPlanner's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "DayPlanner",
  name: "Day Planner",
  category: "Info",
  icon: "timeline",
  prefixes: ["plugins.yr-weather-plugin."],
  defaultSize: [3, 4],
  minSize: [2, 2],
  blurb: "Calendar events on a time rail with weather",
  tags: "calendar agenda schedule events timeline weather rain today tomorrow",
  description: "Today's events on a time rail with a now line, over a band for the temperature and rain. It reads the calendar links set under Settings › Connections and the Yr weather plugin.",
};
