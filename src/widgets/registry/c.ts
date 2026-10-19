// Template widgets, group C: media / audio (see docs/redesign/phase9/brief-9.3c-templates.md).
import { BALLISTICS } from "@/lib/audio/ballistics";
import { deviceOf, devicesOf, thresholdsOf } from "@/modules/setting-readers";
import type { DashboardModule, ModuleSettings } from "@/modules/types";
import { templateModule } from "../module";
import { audioSettings, ballisticsOf, WAVELINK_SETTINGS, wavelinkToProps } from "./audio-settings";
import { boolOf, boolSetting, colorSetting, deviceSetting, devicesSetting, enumSetting, numberOf, numberSetting, oneOf, pick, stringOf, thresholdSetting } from "./settings-kit";
import AudioMeter, { AUDIO_HOT_DB, AUDIO_WARN_DB, meta as audioMeter, type AudioMeterProps } from "../AudioMeter";
import MeterBridge, { meta as meterBridge, type MeterBridgeProps } from "../MeterBridge";
import NowPlaying, { meta as nowPlaying, type NowPlayingProps } from "../NowPlaying";
import { NOW_PLAYING_SETTINGS, sharedPropsOf, vizStyleOf } from "../NowPlaying/settings";
import { colorModeOf, VIZ_DYNAMICS_GROUP, vizColorRows, vizColorSettings, vizDynamicsSettings, vizLookOf, vizShapeSettings } from "./viz-settings";
import Visualizer, { meta as visualizer, type VisualizerProps } from "../Visualizer";
import VolumeMixer, { meta as volumeMixer, type VolumeMixerProps } from "../VolumeMixer";
import WaveLink, { meta as waveLink } from "../WaveLink";
import { nowPlayingIsland, waveLinkIsland } from "../island-sources";
import { volumeMixerIsland } from "../island/audio";

const DEVICE = "Device";
/** The bridge's warning and clip levels: the Audio level threshold (the old `warnDb` / `clipDb`). */
function dbLevels(s: ModuleSettings): Pick<MeterBridgeProps, "warnDb" | "clipDb"> {
  const { warn, crit } = thresholdsOf(s, "db", ["warnDb", "clipDb"]);
  return { warnDb: warn, clipDb: crit };
}
/** AudioMeter's Details rows (the shared audio rows under their v2 labels). */
const AUDIO_METER_LABELS: Record<string, string> = { showDetails: "Peak / RMS, L/R" };
/** AudioMeter's amber and hot levels: the Audio level threshold (dBFS). */
function hotLevels(s: ModuleSettings): Pick<AudioMeterProps, "warnDb" | "hotDb"> {
  const { warn, crit } = thresholdsOf(s, "db");
  return { warnDb: warn, hotDb: crit };
}
/** The single-device meter: the bridge draws its own LED ladders and reads no device or style. */
const single = (v: ModuleSettings) => v.mode !== "bridge";
const METER_STYLES = ["led", "bar", "solid", "vu", "ring", "mirror", "wave"] as const;
const VIZ_MODES = ["bars", "mirror", "radial", "wave", "blob", "dots", "line", "scroll"] as const;
const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));
/** A segment count where 0 = the widget sizes it to the zone. */
const autoCount = (v: unknown): number | undefined => {
  const n = numberOf(v);
  return n !== undefined && n > 0 ? n : undefined;
};

const SPECTRUM = "Spectrum";
/** The Visualizer's colour rows (its colour 1 is `ramp`); Sensitivity and Auto gain stay out of More. */
const VIZ_COLOR_ROWS = vizColorRows("ramp");
const DYNAMICS = vizDynamicsSettings();
const AUTO_GAIN = DYNAMICS.find((d) => d.key === "vizAutoGain")!;

/**
 * Where the template reads the keys it no longer offers: the saved values under the resolved ones, with
 * `vizGap` / `vizShape` only when saved (their defaults must not hide a saved legacy bar width or radius).
 */
function hiddenOf(s: ModuleSettings, saved: ModuleSettings | undefined): ModuleSettings {
  const out: ModuleSettings = { ...saved, ...s };
  for (const k of ["vizGap", "vizShape"]) {
    if (saved?.[k] === undefined) delete out[k];
    else out[k] = saved[k];
  }
  return out;
}

export const GROUP_C: DashboardModule[] = [
  templateModule({
    meta: nowPlaying,
    Component: NowPlaying,
    settings: NOW_PLAYING_SETTINGS,
    island: nowPlayingIsland,
    // the visualiser's levels: read, not owned
    prefixes: ["plugins.audio-level-meter."],
    // The keys no row offers (`vizMinPx`, `vizScrollAs`; before config v8 the old engines' keys) are read from the saved values.
    toProps: (s, saved) => {
      const hidden = hiddenOf(s, saved);
      const shared = sharedPropsOf(s, hidden);
      return {
      ...pick<NowPlayingProps>(["source", "showArt", "progress", "showTimeline"])(s),
      ...shared,
      vizLook: { ...shared.vizLook, colorMode: colorModeOf(s, saved), peaks: boolOf(s.vizPeaks) },
      vizMode: vizStyleOf(hidden),
      // unset / Auto = "" (the loudest live device); undefined would pin default-audio
      vizDevice: deviceOf(hidden, "liveSource") ?? "",
      vizRamp: stringOf(s.vizColor1) ?? stringOf(hidden.vizRamp),
      };
    },
  }),
  templateModule({
    meta: audioMeter,
    Component: AudioMeter,
    settings: [
      enumSetting("mode", "Mode", "single", [{ value: "single", label: "One device" }, { value: "bridge", label: "All devices" }], { group: "Meter" }),
      enumSetting("meterStyle", "Meter style", "led", opts(METER_STYLES), { group: "Meter", visibleIf: single }),
      numberSetting("segments", "Segments (0 = auto)", 0, { min: 0, max: 64, step: 1, group: "Meter", visibleIf: (v) => single(v) && v.meterStyle === "led" }),
      enumSetting("orientation", "Bridge layout", "vertical", [{ value: "vertical", label: "Columns" }, { value: "horizontal", label: "Rows" }], { group: "Meter", visibleIf: (v) => v.mode === "bridge" }),
      ...audioSettings("showDevice", "showDetails", "showVolume", "showMute").map((d) => ({ ...d, group: "Details", label: AUDIO_METER_LABELS[d.key] ?? d.label })),
      // The level and hot colours follow the theme's OK and Critical ("" = the accent and red).
      colorSetting("levelColor", "Level", { role: "ok", more: false }),
      colorSetting("hotColor", "Hot level", { role: "crit", more: false }),
      deviceSetting("Device", "audio", { group: DEVICE, visibleIf: single }),
      // The hot zone is the Audio level threshold (config v8): its own defaults are the meter's old 72 % / 90 % of full scale.
      thresholdSetting("db", { default: AUDIO_WARN_DB, defaultY: AUDIO_HOT_DB }),
      ...audioSettings("meterBallistics"),
    ],
    toProps: (s) => ({
      ...pick<AudioMeterProps>(["showDevice", "showDetails", "showVolume", "showMute", "levelColor", "hotColor"])(s),
      ...hotLevels(s),
      device: deviceOf(s),
      mode: oneOf(s.mode, ["single", "bridge"]),
      meterStyle: oneOf(s.meterStyle, METER_STYLES),
      segments: autoCount(s.segments),
      orientation: oneOf(s.orientation, ["vertical", "horizontal"]),
      ballistics: ballisticsOf(s),
    }),
  }),
  templateModule({
    meta: volumeMixer,
    Component: VolumeMixer,
    settings: [
      ...audioSettings("showDevice", "showMute").map((d) => (d.key === "showMute" ? { ...d, label: "Show mute state" } : d)),
      // The level follows the theme's OK ("" = the accent).
      colorSetting("levelColor", "Level", { role: "ok", more: false }),
      deviceSetting("Device (Auto = all)", "audio", { group: DEVICE }),
    ],
    // read-only: the volume plugin has no write path
    toProps: (s) => ({ ...pick<VolumeMixerProps>(["showDevice", "showMute", "levelColor"])(s), device: deviceOf(s) }),
    island: volumeMixerIsland,
  }),
  templateModule({
    meta: meterBridge,
    Component: MeterBridge,
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
      boolSetting("includeDefault", "Include the default device", false, { group: "Channels", tab: "data" }),
      numberSetting("floor", "Floor (dB)", -60, { min: -120, max: -20, step: 1, group: "Bar scale", tab: "data" }),
      numberSetting("holdMs", "Peak hold (ms)", BALLISTICS.peak.peakHoldMs, { min: 0, max: 5000, step: 100, group: "Dynamics", tab: "behaviour", visibleIf: (v) => ballisticsOf(v) === "peak" }),
      thresholdSetting("db"),
      ...audioSettings("meterBallistics"),
    ],
    toProps: (s, saved) => ({
      ...pick<MeterBridgeProps>(["includeDefault", "showScale", "showVolume", "showDetails", "showMute", "levelColor", "hotColor"])(s),
      channels: devicesOf(s, "channels"),
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
  }),
  templateModule({
    meta: visualizer,
    Component: Visualizer,
    settings: [
      enumSetting("mode", "Style", "bars", opts(VIZ_MODES), { group: SPECTRUM }),
      numberSetting("bands", "Bands (0 = auto)", 0, { min: 0, max: 64, step: 1, group: SPECTRUM }),
      boolSetting("peaks", "Peak caps", true, { group: SPECTRUM }),
      ...vizShapeSettings("mode").map((d) => ({ ...d, group: SPECTRUM, more: true })),
      ...vizColorSettings(colorSetting("ramp", "Color")).map((d) => ({ ...d, ...VIZ_COLOR_ROWS[d.key] })),
      deviceSetting("Audio device", "audio", { group: "Audio device" }),
      numberSetting("sensitivity", "Sensitivity", 1.4, { min: 0.2, max: 4, step: 0.1, group: VIZ_DYNAMICS_GROUP, tab: "behaviour" }),
      { ...AUTO_GAIN, more: false },
      ...DYNAMICS.filter((d) => d !== AUTO_GAIN),
    ],
    toProps: (s, saved) => ({
      ...pick<VisualizerProps>(["peaks"])(s),
      vizLook: vizLookOf(s, saved),
      mode: oneOf(s.mode, VIZ_MODES),
      device: deviceOf(s),
      bands: autoCount(s.bands),
      ramp: stringOf(s.ramp),
      sensitivity: numberOf(s.sensitivity),
    }),
  }),
  templateModule({
    meta: waveLink,
    Component: WaveLink,
    settings: WAVELINK_SETTINGS,
    island: waveLinkIsland,
    toProps: (s) => ({ ...wavelinkToProps(s), levelColor: stringOf(s.levelColor) }),
  }),
];
