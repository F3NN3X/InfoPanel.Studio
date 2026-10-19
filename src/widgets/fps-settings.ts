// FpsMonitor's look settings and their mapping to props (same keys, defaults and groups as the old FPS
// widget).
import type { ModuleSetting, ModuleSettings } from "@/modules/types";
import { colorSetting } from "./registry/settings-kit";
import type { FpsMonitorProps } from "./FpsMonitor";

/** showMetrics, sparkline and the two colours (the ring follows the theme's Series 1, the sparkline Series 2). */
export const FPS_LOOK_SETTINGS: ModuleSetting[] = [
  { key: "showMetrics", label: "Extra metrics", type: "boolean", default: true, group: "Display" },
  { key: "sparkline", label: "Trend sparkline", type: "boolean", default: false, group: "Display" },
  colorSetting("ringColor", "Ring", { role: "s1", more: false }),
  colorSetting("sparkColor", "Trend sparkline", { role: "s2", more: false }),
];

type FpsLookProps = Pick<FpsMonitorProps, "view" | "showMetrics" | "sparkline" | "ringColor" | "sparkColor">;

/** The stored keys as props; `view` is the stored choice when it names a gauge view. */
export function fpsLookProps(s: ModuleSettings): FpsLookProps {
  return {
    view: s.view === "gauge" || s.view === "trend" ? s.view : undefined,
    showMetrics: Boolean(s.showMetrics),
    sparkline: Boolean(s.sparkline),
    ringColor: String(s.ringColor ?? ""),
    sparkColor: String(s.sparkColor ?? ""),
  };
}

