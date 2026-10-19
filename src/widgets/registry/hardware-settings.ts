// The Thermals gauges' settings, under the keys and defaults the old Hardware widget stored
// (LibreHardwareMonitor / HWiNFO, `libre.*` / `hwinfo.*`). SensorGroup's auto-discovered list is in b.ts.
import type { ModuleSetting } from "@/modules/types";

const SHOW_FANS: ModuleSetting = { key: "showFans", label: "Fan readings", type: "boolean", default: true, group: "Content" };
const FAN_COLOR: ModuleSetting = { key: "fanColor", label: "Fan dot color", type: "color", default: "", group: "Content" };

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
    group: "Content",
  },
  { key: "discover", label: "All temperature sensors", type: "boolean", default: false, group: "Content" },
  { ...SHOW_FANS, visibleIf: (v) => v.view === "gauges" },
  { ...FAN_COLOR, visibleIf: (v) => v.view === "gauges" },
];
