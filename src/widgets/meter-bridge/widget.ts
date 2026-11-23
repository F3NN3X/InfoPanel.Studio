// Meter Bridge: multi-channel dB meters. What the registry needs; the component is its own chunk.
import { BALLISTICS } from "@/lib/audio/ballistics";
import { devicesOf, thresholdsOf } from "@/modules/setting-readers";
import type { ModuleSettings } from "@/modules/types";
import { DENSE, defineWidget } from "../define";
import { audioFlowSetting, audioSettings, autoCount, ballisticsOf, flowOfSettings, levelOwnOf } from "../shared/audio-settings";
import { boolSetting, colorSetting, devicesSetting, enumSetting, numberOf, numberSetting, oneOf, pick, thresholdSetting } from "../shared/settings-kit";
import type { MeterBridgeProps } from "./MeterBridge";
import { meta } from "./meta";

/** The warning and clip levels: the Audio level threshold (the old `warnDb` / `clipDb`). */
function dbLevels(s: ModuleSettings): Pick<MeterBridgeProps, "warnDb" | "clipDb"> {
  const { warn, crit } = thresholdsOf(s, "db", ["warnDb", "clipDb"]);
  return { warnDb: warn, clipDb: crit };
}

export default defineWidget({
  meta,
  // A dense view only.
  inspector: { header: "yes", compact: DENSE, thr: ["db"] },
  settings: [
    enumSetting("orientation", "Orientation", "vertical", [{ value: "vertical", label: "Columns" }, { value: "horizontal", label: "Rows" }], { group: "Meter" }),
    enumSetting("ladder", "Ladder", "led", [{ value: "led", label: "LED" }, { value: "smooth", label: "Smooth" }], { group: "Meter" }),
    numberSetting("segments", "Segments (0 = auto)", 0, { min: 0, max: 64, step: 1, group: "Meter" }),
    boolSetting("showScale", "dB scale", true, { group: "Meter" }),
    boolSetting("showVolume", "Volume", true, { group: "Details" }),
    ...audioSettings("showDevice", "showDetails", "showMute"),
    // The level and clip colours follow the theme's OK and Critical ("" = the accent and red).
    colorSetting("levelColor", "Level", { role: "ok", more: false }),
    colorSetting("hotColor", "Clip level", { role: "crit", more: false }),
    devicesSetting("Channels (none = all devices)", "audio", { group: "Channels" }),
    audioFlowSetting("Channels"),
    boolSetting("includeDefault", "Include the default device", false, { group: "Channels", tab: "data" }),
    numberSetting("floor", "Floor (dB)", -60, { min: -120, max: -20, step: 1, group: "Bar scale", tab: "data" }),
    numberSetting("holdMs", "Peak hold (ms)", BALLISTICS.peak.peakHoldMs, { min: 0, max: 5000, step: 100, group: "Dynamics", tab: "behaviour", visibleIf: (v) => ballisticsOf(v) === "peak" }),
    thresholdSetting("db"),
    ...audioSettings("meterBallistics"),
  ],
  render: {
    load: () => import("./MeterBridge"),
    // the level meters and the volume plugin's volume and mute, read from `data` (not owned)
    reads: ["plugins.audio-level-meter.", "plugins.volume-plugin."],
    toProps: (s: ModuleSettings, saved?: ModuleSettings): Partial<MeterBridgeProps> => ({
      ...pick<MeterBridgeProps>(["includeDefault", "showScale", "showVolume", "showDetails", "showMute", "levelColor", "hotColor"])(s),
      levelOwn: levelOwnOf(s, saved),
      channels: devicesOf(s, "channels"),
      flow: flowOfSettings(s),
      orientation: oneOf(s.orientation, ["vertical", "horizontal"]),
      ladder: oneOf(s.ladder, ["led", "smooth"]),
      segments: autoCount(s.segments),
      // only a stored hold overrides the preset's own, and only the Peak response keeps one
      holdMs: ballisticsOf(s) === "peak" ? numberOf(saved?.holdMs) : undefined,
      floor: numberOf(s.floor),
      ...dbLevels(s),
      showName: s.showDevice as boolean,
      ballistics: ballisticsOf(s),
    }),
  },
  // Migrations and sample stay central (the default): the sample is src/widgets/__fixtures__/snapshot.json, with no
  // widget-qa demo settings.
});
