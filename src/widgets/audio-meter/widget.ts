// Audio Meter: left and right level with peak hold. What the registry needs; the component is its own chunk.
import { deviceOf, thresholdsOf } from "@/modules/setting-readers";
import type { ModuleSettings } from "@/modules/types";
import { BOTH, defineWidget } from "../define";
import { audioFlowSetting, audioSettings, autoCount, ballisticsOf, flowOfSettings, levelOwnOf, opts, pickedDevicesOf } from "../shared/audio-settings";
import { colorSetting, deviceSetting, devicesSetting, enumSetting, numberSetting, oneOf, pick, thresholdSetting, viewOnly, viewSetting } from "../shared/settings-kit";
import type { AudioMeterProps } from "./AudioMeter";
import { AUDIO_HOT_DB, AUDIO_WARN_DB, meta } from "./meta";

const DEVICE = "Device";
/** The Details rows (the shared audio rows under their v2 labels). */
const AUDIO_METER_LABELS: Record<string, string> = { showDetails: "Peak / RMS, L/R" };
/** The single-device meter: the bridge draws its own LED ladders and reads no device or style. */
const single = viewOnly(meta, "single");
const bridge = viewOnly(meta, "bridge");
const METER_STYLES = ["led", "bar", "solid", "vu", "ring", "mirror", "wave"] as const;

/** The amber and hot levels: the Audio level threshold (dBFS). */
function hotLevels(s: ModuleSettings): Pick<AudioMeterProps, "warnDb" | "hotDb"> {
  const { warn, crit } = thresholdsOf(s, "db");
  return { warnDb: warn, hotDb: crit };
}

export default defineWidget({
  meta,
  // Its amber and hot zones are the Audio level threshold (config v8). A summary card and a dense view of their own.
  inspector: { header: "yes", compact: BOTH, thr: ["db"] },
  settings: [
    viewSetting(meta, { label: "Mode", group: "Meter" }),
    single(enumSetting("meterStyle", "Meter type", "led", opts(METER_STYLES), { group: "Meter" })),
    single(numberSetting("segments", "Segments (0 = auto)", 0, { min: 0, max: 64, step: 1, group: "Meter", visibleIf: (v) => v.meterStyle === "led" })),
    bridge(enumSetting("orientation", "Bridge layout", "vertical", [{ value: "vertical", label: "Columns" }, { value: "horizontal", label: "Rows" }], { group: "Meter" })),
    ...audioSettings("showDevice", "showDetails", "showVolume", "showMute").map((d) => ({ ...d, group: "Details", label: AUDIO_METER_LABELS[d.key] ?? d.label })),
    // The level and hot colours follow the theme's OK and Critical ("" = the accent and red).
    colorSetting("levelColor", "Level", { role: "ok", more: false }),
    colorSetting("hotColor", "Hot level", { role: "crit", more: false }),
    single(deviceSetting("Device", "audio", { group: DEVICE })),
    bridge(devicesSetting("Devices (none = all)", "audio", { group: DEVICE })),
    audioFlowSetting(DEVICE),
    // The hot zone is the Audio level threshold (config v8): its own defaults are the meter's old 72 % / 90 % of full scale.
    thresholdSetting("db", { default: AUDIO_WARN_DB, defaultY: AUDIO_HOT_DB }),
    ...audioSettings("meterBallistics"),
  ],
  render: {
    load: () => import("./AudioMeter"),
    toProps: (s: ModuleSettings, saved?: ModuleSettings): Partial<AudioMeterProps> => ({
      ...pick<AudioMeterProps>(["showDevice", "showDetails", "showVolume", "showMute", "levelColor", "hotColor"])(s),
      levelOwn: levelOwnOf(s, saved),
      ...hotLevels(s),
      device: deviceOf(s),
      devices: pickedDevicesOf(s, "devices"),
      flow: flowOfSettings(s),
      mode: oneOf(s.mode, ["single", "bridge"]),
      meterStyle: oneOf(s.meterStyle, METER_STYLES),
      segments: autoCount(s.segments),
      orientation: oneOf(s.orientation, ["vertical", "horizontal"]),
      ballistics: ballisticsOf(s),
    }),
  },
  // Migrations and sample stay central (the default): the sample is src/widgets/__fixtures__/snapshot.json, with no
  // widget-qa demo settings.
});
