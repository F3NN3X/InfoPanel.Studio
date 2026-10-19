import type { PanelDef, Widget } from "@/lib/layout";
import { itemLevels, itemQuantity, itemTone, resolvedItem } from "@/lib/panel-item";
import { THRESHOLD_KINDS } from "@/lib/panel-model";
import { sensorAt } from "@/lib/sensors";
import type { SectionFlags } from "@/lib/theme-model";
import type { ModuleSettings, SensorMap } from "@/modules/types";
import { STATE, TONES } from "@/widgets/core/theme";

/** A panel's widgets mapped (the same panel when none changed). */
function mapWidgets(panel: PanelDef, fn: (w: Widget) => Widget): PanelDef {
  const widgets = panel.widgets.map(fn);
  return widgets.every((w, i) => w === panel.widgets[i]) ? panel : { ...panel, widgets };
}

/** A panel's widgets with their sections resolved against the panel's look (`resolvedItem`). */
export const resolvedPanel = (panel: PanelDef, look: ModuleSettings, locks?: SectionFlags): PanelDef =>
  mapWidgets(panel, (w) => resolvedItem(w, look, locks));

/**
 * A stat, value, bar or gauge past a level takes the warning / critical
 * colour on its value or fill: the theme palette's role when a level sets
 * it, else the state colour (a plain gauge needs a hex). The value is the
 * shown one (times `scale`); the bound sensor's unit picks the quantity.
 */
export function tonedItem(w: Widget, look: ModuleSettings, sensors: SensorMap, locks?: SectionFlags): Widget {
  if (!THRESHOLD_KINDS.has(w.kind) || !w.sensor) return w;
  const s = sensorAt(sensors, w.sensor);
  if (s?.value === undefined) return w;
  const tone = itemTone(s.value * (w.scale ?? 1), itemLevels(w, look, itemQuantity(s.unit || w.unit), locks));
  if (tone === "ok") return w;
  const role = look[tone];
  const color = typeof role === "string" && role.trim() !== "" ? role : w.kind === "gauge" ? STATE[tone] : TONES[tone];
  return { ...w, color };
}

/** Every widget of a panel toned by its thresholds (`tonedItem`). */
export const tonedPanel = (panel: PanelDef, look: ModuleSettings, sensors: SensorMap, locks?: SectionFlags): PanelDef =>
  mapWidgets(panel, (w) => tonedItem(w, look, sensors, locks));
