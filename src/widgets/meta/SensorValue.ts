// SensorValue's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "SensorValue",
  name: "Sensor",
  category: "Generic",
  icon: "sensors",
  prefixes: [],
  defaultSize: [1, 1],
  minSize: [1, 1],
  blurb: "Any single value as number, gauge or bar",
  tags: "bind value custom",
  description: "Bind any single data point. Shows it as a value, gauge, bar or sparkline with thresholds.",
};
