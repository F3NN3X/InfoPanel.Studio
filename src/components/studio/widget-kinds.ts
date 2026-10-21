import {
  Activity,
  Baseline,
  CircleDot,
  Clock,
  Gauge,
  Hash,
  Image,
  RectangleHorizontal,
  Shapes,
  Table2,
  Type,
  type LucideIcon,
} from "lucide-react";
import { getCatalog, type SensorCatalog } from "@/lib/catalog";
import { WIDGET_KINDS, type Widget, type WidgetKind } from "@/lib/panel-model";

/** Fallback for color inputs when no override is set (indigo-ish). */
export const COLOR_FALLBACK = "#818cf8";

/** How the studio names, draws and describes each panel widget kind. */
export const KIND_INFO: Record<WidgetKind, { label: string; icon: LucideIcon; hint: string }> = {
  stat: { label: "Stat", icon: Hash, hint: "Label over a big number" },
  value: { label: "Value", icon: Baseline, hint: "Compact inline readout" },
  bar: { label: "Bar", icon: RectangleHorizontal, hint: "Label, value and a fill bar" },
  gauge: { label: "Gauge", icon: Gauge, hint: "Circular ring with the value" },
  customGauge: { label: "Custom gauge", icon: CircleDot, hint: "A gauge designed in Gauges" },
  sparkline: { label: "Sparkline", icon: Activity, hint: "Rolling mini line graph" },
  table: { label: "Table", icon: Table2, hint: "Rows from a multi-line sensor" },
  text: { label: "Text", icon: Type, hint: "Static or sensor-bound text" },
  image: { label: "Image", icon: Image, hint: "Picture from a URL or sensor" },
  clock: { label: "Clock", icon: Clock, hint: "Live time and / or date" },
  shape: { label: "Shape", icon: Shapes, hint: "Decorative bar, rectangle or circle" },
};

export const KIND_LABELS: Record<WidgetKind, string> = Object.fromEntries(
  WIDGET_KINDS.map((k) => [k, KIND_INFO[k].label])
) as Record<WidgetKind, string>;

export const ALL_KINDS: readonly WidgetKind[] = WIDGET_KINDS;

type Names = Pick<SensorCatalog, "sources" | "sensors">;

/**
 * A sensor key's readable name: the Data API's entry name, else the
 * streamed display name, else the key's last segment ("…rtss.avg-fps" →
 * "avg fps").
 */
export function sensorName(key: string, names: Names = getCatalog()): string {
  for (const plugin of names.sources?.plugins ?? [])
    for (const container of plugin.containers)
      for (const entry of container.entries) if (entry.key === key && entry.name) return entry.name;
  const streamed = names.sensors[key]?.name;
  if (streamed) return streamed.split(" · ").pop()!;
  const last = key.split(".").pop() ?? key;
  return last.replace(/[_-]+/g, " ").trim() || key;
}

/**
 * A widget's name in the studio (layers, breadcrumbs, palette): its label,
 * else its sensor's name, else its text, else its kind.
 */
export const widgetName = (w: Widget, names?: Names): string =>
  w.label || (w.sensor && sensorName(w.sensor, names)) || w.text || KIND_INFO[w.kind].label;
