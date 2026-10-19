// The Thermals gauges' settings, under the keys and defaults the old Hardware widget stored
// (LibreHardwareMonitor / HWiNFO, `libre.*` / `hwinfo.*`). SensorGroup's auto-discovered list is in b.ts.
import type { ModuleSetting } from "@/modules/types";
import { colorSetting } from "./settings-kit";

const gauges = (v: { view?: unknown }): boolean => v.view === "gauges";

/** The Thermals template's own settings: gauges, every sensor, the fan row. */
export const THERMALS_SETTINGS: ModuleSetting[] = [
  {
    key: "view",
    label: "View",
    type: "select",
    default: "bars",
    options: [
      { value: "bars", label: "Bars" },
      { value: "gauges", label: "Temp gauges" },
    ],
    group: "Readings",
  },
  { key: "discover", label: "All temperature sensors", type: "boolean", default: false, group: "Readings" },
  { key: "showFans", label: "Fan readings", type: "boolean", default: true, group: "Readings", visibleIf: gauges },
  // The fan dot follows the theme's Series 3 ("" = the widget's own colour).
  colorSetting("fanColor", "Fan dot", { role: "s3", more: false, visibleIf: gauges }),
];
