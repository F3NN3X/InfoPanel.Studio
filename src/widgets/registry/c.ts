// Template widgets, group C: media / audio (see docs/redesign/phase9/brief-9.3c-templates.md).
import { BALLISTICS } from "@/lib/audio/ballistics";
import { deviceOf, devicesOf, thresholdsOf } from "@/modules/setting-readers";
import type { DashboardModule, ModuleSetting, ModuleSettings } from "@/modules/types";
import { templateModule } from "../module";
import { audioSettings, ballisticsOf, WAVELINK_SETTINGS, wavelinkToProps } from "./audio-settings";
import { boolOf, boolSetting, colorSetting, deviceSetting, devicesSetting, enumSetting, numberOf, numberSetting, oneOf, pick, stringOf, thresholdSetting } from "./settings-kit";
import AudioMeter, { meta as audioMeter, type AudioMeterProps } from "../AudioMeter";
import MeterBridge, { meta as meterBridge, type MeterBridgeProps } from "../MeterBridge";
import NowPlaying, { meta as nowPlaying, type NowPlayingProps } from "../NowPlaying";
import { MEDIA_SETTINGS, NOW_PLAYING_OWN, PLAYER_LAYOUT, sharedPropsOf, vizStyleOf } from "../NowPlaying/settings";
import { VIZ_COLORS_GROUP, VIZ_DYNAMICS_GROUP, VIZ_SHAPE_GROUP, colorModeOf, vizColorSettings, vizDynamicsSettings, vizLookOf, vizShapeSettings } from "./viz-settings";
import Visualizer, { meta as visualizer, type VisualizerProps } from "../Visualizer";
import VolumeMixer, { meta as volumeMixer, type VolumeMixerProps } from "../VolumeMixer";
import WaveLink, { meta as waveLink } from "../WaveLink";
import { nowPlayingIsland, waveLinkIsland } from "../island-sources";
import { volumeMixerIsland } from "../island/audio";

/**
 * The legacy media keys a new NowPlaying zone does not offer: the engine-picking and mapped keys, the
 * old engines' shape keys (still read from saved values, `tuningLookOf`) and the synthesised idle
 * animations (no longer drawn).
 */
const LEGACY_ONLY = [
  "waveform",
  "visualizer",
  "waveformVariant",
  "visualizerMirrored",
  "liveSource",
  "waveformMode",
  "waveformBarWidth",
  "waveformBarGap",
  "waveformBarRadius",
  "waveformMinBarHeight",
  "waveformActive",
  "visualizerIdle",
  "visualizerLoading",
];
/** The old engines' keys the template keeps, filed with the visualiser. */
const TEMPLATE_GROUPS: Record<string, Partial<ModuleSetting>> = {
  waveformSensitivity: { group: "Visualizer", label: "Sensitivity (gain)" },
  waveformLineWidth: { group: VIZ_SHAPE_GROUP, label: "Line width (px)" },
  waveformFadeEdges: { group: VIZ_SHAPE_GROUP, label: "Edge fade" },
  waveformFadeWidth: { group: VIZ_SHAPE_GROUP, label: "Fade width (px)" },
  // the template draws untinted unless asked
  tint: { default: false },
  liveCapture: { hint: "Needs the profile set to Interactive once, then Allow in the prompt; captures an input device (a loopback such as a Wave Link output)." },
};
const DEVICE = "Device";
/** The bridge's warning and clip levels: the Audio level threshold (the old `warnDb` / `clipDb`). */
function dbLevels(s: ModuleSettings): Pick<MeterBridgeProps, "warnDb" | "clipDb"> {
  const { warn, crit } = thresholdsOf(s, "db", ["warnDb", "clipDb"]);
  return { warnDb: warn, clipDb: crit };
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

/** The groups whose settings only a visualiser Progress row reads. */
const VIZ_ONLY_GROUPS = ["Visualizer", "Audio source", VIZ_SHAPE_GROUP, VIZ_COLORS_GROUP, VIZ_DYNAMICS_GROUP];
/** Cover art is drawn by the card and wave layouts only. */
const ART_LAYOUTS = ["card", "wave"];

/** Gates the visualiser settings on the Progress row, and the capture devices on Live capture (both rules also keep a setting's own `visibleIf`). */
const gateNowPlaying = (d: ModuleSetting): ModuleSetting => {
  const own = d.visibleIf;
  if (d.key === "showArt") return { ...d, visibleIf: (v) => ART_LAYOUTS.includes(String(v.playerLayout)) };
  if (!VIZ_ONLY_GROUPS.includes(d.group ?? "")) return d;
  const live = d.key === "devices" ? (v: ModuleSettings) => Boolean(v.liveCapture) : () => true;
  return { ...d, visibleIf: (v) => v.progress === "visualizer" && live(v) && (own?.(v) ?? true) };
};

const NOW_PLAYING_SETTINGS: ModuleSetting[] = [
  PLAYER_LAYOUT,
  ...NOW_PLAYING_OWN,
  ...MEDIA_SETTINGS.filter((d) => !LEGACY_ONLY.includes(d.key)).map((d) => ({ ...d, ...TEMPLATE_GROUPS[d.key] })),
  ...vizShapeSettings("waveformVariant"),
  boolSetting("vizPeaks", "Peak caps", false, { group: VIZ_SHAPE_GROUP }),
  ...vizColorSettings(colorSetting("vizRamp", "Visualizer color")),
  ...vizDynamicsSettings(),
].map(gateNowPlaying);

export const GROUP_C: DashboardModule[] = [
  templateModule({
    meta: nowPlaying,
    Component: NowPlaying,
    settings: NOW_PLAYING_SETTINGS,
    island: nowPlayingIsland,
    // the visualiser's levels: read, not owned
    prefixes: ["plugins.audio-level-meter."],
    // vizMode / vizDevice are stored under the legacy keys waveformVariant / liveSource (PHASE9_PLAN §3.2);
    // the keys the template no longer offers (vizEngine, the old shape keys) are read from the saved values
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
      vizRamp: stringOf(s.vizRamp),
      };
    },
  }),
  templateModule({
    meta: audioMeter,
    Component: AudioMeter,
    settings: [
      deviceSetting("Device", "audio", { group: DEVICE, visibleIf: single }),
      enumSetting("mode", "Mode", "single", [{ value: "single", label: "Single device" }, { value: "bridge", label: "Bridge (all devices)" }], { group: "Audio meter" }),
      enumSetting("meterStyle", "Meter style", "led", opts(METER_STYLES), { group: "Audio meter", visibleIf: single }),
      numberSetting("segments", "Segments (0 = auto)", 0, { min: 0, max: 64, step: 1, group: "Audio meter", visibleIf: (v) => single(v) && v.meterStyle === "led" }),
      enumSetting("orientation", "Bridge layout", "vertical", [{ value: "vertical", label: "Columns" }, { value: "horizontal", label: "Rows" }], { group: "Audio meter", visibleIf: (v) => v.mode === "bridge" }),
      ...audioSettings("showDevice", "showDetails", "showVolume", "showMute", "meterBallistics", "levelColor", "hotColor"),
    ],
    toProps: (s) => ({
      ...pick<AudioMeterProps>(["showDevice", "showDetails", "showVolume", "showMute", "levelColor", "hotColor"])(s),
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
    // a lone colour would be a one-setting category: it sits in Content with the toggles
    settings: [
      deviceSetting("Device (Auto = all)", "audio", { group: DEVICE }),
      ...audioSettings("showDevice", "showMute", "levelColor").map((d) => (d.key === "levelColor" ? { ...d, group: "Content" } : d.key === "showMute" ? { ...d, label: "Show mute state" } : d)),
    ],
    // read-only: the volume plugin has no write path
    toProps: (s) => ({ ...pick<VolumeMixerProps>(["showDevice", "showMute", "levelColor"])(s), device: deviceOf(s) }),
    island: volumeMixerIsland,
  }),
  templateModule({
    meta: meterBridge,
    Component: MeterBridge,
    settings: [
      devicesSetting("Channels (none = all devices)", "audio", { group: DEVICE }),
      boolSetting("includeDefault", "Include the default device", false, { group: "Meter bridge" }),
      enumSetting("orientation", "Orientation", "vertical", [{ value: "vertical", label: "Columns" }, { value: "horizontal", label: "Rows" }], { group: "Meter bridge" }),
      enumSetting("ladder", "Ladder", "led", [{ value: "led", label: "LED" }, { value: "smooth", label: "Smooth" }], { group: "Meter bridge" }),
      numberSetting("segments", "Segments (0 = auto)", 0, { min: 0, max: 64, step: 1, group: "Meter bridge" }),
      boolSetting("showScale", "dB scale", true, { group: "Meter bridge" }),
      boolSetting("showVolume", "Volume", true, { group: "Meter bridge" }),
      numberSetting("holdMs", "Peak hold (ms)", BALLISTICS.peak.peakHoldMs, { min: 0, max: 5000, step: 100, group: "Meter", visibleIf: (v) => ballisticsOf(v) === "peak" }),
      numberSetting("floor", "Floor (dB)", -60, { min: -120, max: -20, step: 1, group: "Thresholds" }),
      thresholdSetting("db"),
      ...audioSettings("showDevice", "showDetails", "showMute", "meterBallistics", "levelColor", "hotColor"),
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
      enumSetting("mode", "Mode", "bars", opts(VIZ_MODES), { group: "Visualizer" }),
      deviceSetting("Audio device", "audio", { group: DEVICE }),
      numberSetting("bands", "Bands (0 = auto)", 0, { min: 0, max: 64, step: 1, group: "Visualizer" }),
      numberSetting("sensitivity", "Sensitivity", 1.4, { min: 0.2, max: 4, step: 0.1, group: "Visualizer" }),
      boolSetting("peaks", "Peak caps", true, { group: "Visualizer" }),
      ...vizShapeSettings("mode"),
      ...vizColorSettings(colorSetting("ramp", "Color")),
      ...vizDynamicsSettings(),
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
    // the level colour also carries the old Wave Link widget's teal (config v4, `legacy-zones.ts`)
    settings: [...WAVELINK_SETTINGS, colorSetting("levelColor", "Level color", { group: "Meter" })],
    island: waveLinkIsland,
    toProps: (s) => ({ ...wavelinkToProps(s), levelColor: stringOf(s.levelColor) }),
  }),
];
