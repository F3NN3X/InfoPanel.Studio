// The Thermals gauges' settings, under the keys and defaults the old Hardware widget stored
// (LibreHardwareMonitor / HWiNFO, `libre.*` / `hwinfo.*`). SensorGroup's auto-discovered list is in b.ts.
import type { ModuleSetting } from "@/modules/types";
import { meta } from "../meta/Thermals";
import { colorSetting, viewOnly, viewSetting } from "./settings-kit";

const gauges = viewOnly(meta, "gauges");

/** The Thermals template's own settings: gauges, every sensor, the fan row. */
export const THERMALS_SETTINGS: ModuleSetting[] = [
  viewSetting(meta, { group: "Readings" }),
  { key: "discover", label: "All temperature sensors", type: "boolean", default: false, group: "Readings" },
  gauges({ key: "showFans", label: "Fan readings", type: "boolean", default: true, group: "Readings" }),
  // The fan dot follows the theme's Series 3 ("" = the widget's own colour).
  gauges(colorSetting("fanColor", "Fan dot", { role: "s3", more: false })),
];
