// NowPlaying's settings (config v8 renamed the old Spotify / Media widgets' keys, SPEC §6.3) and the
// mapping from the stored keys to NowPlaying props; the old keys stay readable for unmigrated settings.
import type { ModuleSetting, ModuleSettings } from "@/modules/types";
import { VIZ_STYLES, type VizLook, type VizStyle } from "../core/viz/types";
import type { NowPlayingProps } from "../NowPlaying";
import { devicesOf } from "@/modules/setting-readers";
import { boolSetting, colorSetting, deviceSetting, enumSetting, numberOf, numberSetting, oneOf } from "../registry/settings-kit";
import { VIZ_COLORS_GROUP, VIZ_DYNAMICS_GROUP, vizColorSettings, vizDynamicsSettings, vizLookOf, vizShapeSettings } from "../registry/viz-settings";

/** The audio-level-meter plugin, which drives the visualizers' live level. */
export const AUDIO_LEVEL = "plugins.audio-level-meter.";

/** The player layout, stored as `playerLayout` (the standard `layout` keeps its meaning). */
export const PLAYER_LAYOUT: ModuleSetting = enumSetting(
  "playerLayout",
  "Layout",
  "card",
  [
    { value: "card", label: "Card" },
    { value: "vinyl", label: "Vinyl" },
    { value: "backdrop", label: "Backdrop" },
    { value: "wave", label: "Wave" },
  ],
  { group: "Player" }
);

/** Cover art is drawn by the card and wave layouts only. */
const ART_LAYOUTS = ["card", "wave"];
const PLAYER = "Player";
const VISUALIZER = "Visualizer";
const AUDIO_SOURCE = "Visualizer audio";

/** The visualiser's colour rows (Style › Widget colors): theme roles Series 1–3 and Critical for the peak caps. */
const COLOR_ROWS: Readonly<Record<string, Partial<ModuleSetting>>> = {
  vizColorMode: { label: "Visualizer colors", more: false, perWidget: true },
  vizGradient: { perWidget: true },
  vizColor1: { label: "Color 1", role: "s1", more: false },
  vizColor2: { label: "Color 2", role: "s2", more: false },
  vizColor3: { label: "Color 3", role: "s3", more: false },
  vizPeakColor: { label: "Peak cap", role: "crit", more: true },
  vizOpacity: { label: "Visualizer opacity (%)", perWidget: true },
  vizGlow: { perWidget: true },
};

/** The dynamics rows (Behaviour › Visualizer dynamics): Sensitivity and Auto gain up front, the rest behind More. */
const DYNAMICS = vizDynamicsSettings();
const AUTO_GAIN = DYNAMICS.find((d) => d.key === "vizAutoGain")!;

/**
 * The template's settings (config v8 names, SPEC §6.3): the player and its visualiser in Show, the
 * visualiser's colours in Style › Widget colors, the player source and the visualiser's audio in Data,
 * the dynamics in Behaviour. Every visualiser row shows only for the Visualizer progress style.
 */
const OWN_SETTINGS: ModuleSetting[] = [
  PLAYER_LAYOUT,
  boolSetting("showArt", "Cover art", true, { group: PLAYER, visibleIf: (v) => ART_LAYOUTS.includes(String(v.playerLayout)) }),
  boolSetting("showProgress", "Progress", true, { group: PLAYER }),
  enumSetting("progress", "Progress style", "bar", [{ value: "bar", label: "Bar" }, { value: "wave", label: "Wavy" }, { value: "visualizer", label: "Visualizer" }], { group: PLAYER, visibleIf: (v) => v.showProgress !== false }),
  boolSetting("showTimes", "Times", true, { group: PLAYER }),
  enumSetting("vizStyle", "Style", "bars", VIZ_STYLES.map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) })), { group: VISUALIZER }),
  numberSetting("vizBars", "Bar count", 24, { min: 4, max: 64, step: 2, group: VISUALIZER }),
  enumSetting("vizAlign", "Alignment", "center", [{ value: "center", label: "Center" }, { value: "start", label: "Start" }, { value: "end", label: "End" }], { group: VISUALIZER }),
  boolSetting("showTimeline", "Timeline under it", true, { group: VISUALIZER }),
  boolSetting("vizPeaks", "Peak caps", false, { group: VISUALIZER }),
  ...vizShapeSettings("vizStyle").map((d) => ({ ...d, group: VISUALIZER, more: true })),
  enumSetting("vizOrientation", "Orientation", "horizontal", [{ value: "horizontal", label: "Horizontal" }, { value: "vertical", label: "Vertical" }], { group: VISUALIZER, more: true }),
  numberSetting("vizMinLevel", "Resting bar size", 0.08, { min: 0, max: 0.5, step: 0.02, group: VISUALIZER, more: true }),
  numberSetting("vizLine", "Line width (px)", 1.5, { min: 0.5, max: 6, step: 0.5, group: VISUALIZER, more: true }),
  boolSetting("vizFade", "Edge fade", true, { group: VISUALIZER, more: true }),
  numberSetting("vizFadeWidth", "Fade width (px)", 24, { min: 0, max: 200, step: 4, group: VISUALIZER, more: true, visibleIf: (v) => v.vizFade !== false }),
  // the template draws untinted unless asked
  boolSetting("tint", "Tint from cover art", false, { tab: "style", perWidget: true }),
  boolSetting("artBackground", "Blurred cover behind", false, { tab: "style", perWidget: true }),
  ...vizColorSettings(colorSetting("vizColor1", "Color 1")).map((d) => ({ ...d, ...COLOR_ROWS[d.key] })),
  enumSetting("source", "Source", "auto", [{ value: "auto", label: "Auto" }, { value: "media", label: "Windows" }, { value: "spotify", label: "Spotify" }, { value: "pushed", label: "Pushed" }], { group: "Player source", tab: "data", hint: "Auto: Spotify when connected, else Windows Media." }),
  deviceSetting("Device", "audio", { group: AUDIO_SOURCE }),
  boolSetting("liveCapture", "Live capture (Web Audio)", false, { group: AUDIO_SOURCE, tab: "data", more: true, hint: "Needs the profile set to Interactive once, then Allow in the prompt; captures an input device (a loopback such as a Wave Link output)." }),
  // `liveSources` until config v7 (`devices`, the shared multi-device key).
  { key: "devices", label: "Capture devices (one visualizer row each)", type: "select", default: "", optionsFrom: "media", multiple: true, group: AUDIO_SOURCE, tab: "data", more: true },
  numberSetting("vizGain", "Sensitivity (×)", 1, { min: 0.1, max: 4, step: 0.1, group: VIZ_DYNAMICS_GROUP, tab: "behaviour" }),
  { ...AUTO_GAIN, more: false },
  ...DYNAMICS.filter((d) => d !== AUTO_GAIN),
];

/** The groups whose settings only a visualiser Progress style reads. */
const VIZ_ONLY_GROUPS = [VISUALIZER, AUDIO_SOURCE, VIZ_COLORS_GROUP, VIZ_DYNAMICS_GROUP];

/** Gates the visualiser settings on the Progress style, and the capture devices on Live capture (both keep a setting's own `visibleIf`). */
const gateViz = (d: ModuleSetting): ModuleSetting => {
  if (!VIZ_ONLY_GROUPS.includes(d.group ?? "")) return d;
  const own = d.visibleIf;
  const live = d.key === "devices" ? (v: ModuleSettings) => Boolean(v.liveCapture) : () => true;
  return { ...d, visibleIf: (v) => v.progress === "visualizer" && live(v) && (own?.(v) ?? true) };
};

export const NOW_PLAYING_SETTINGS: ModuleSetting[] = OWN_SETTINGS.map(gateViz);

/** What drew the visualiser before one renderer: the stored `vizEngine` (the config v4 migration writes the old media widgets' pick). */
export type LegacyEngine = "mini" | "waveform" | "bars";

/**
 * The style: `vizStyle` (config v8), else from the old keys. `waveform` (live waveform): scrolling (its default) = `scroll`,
 * static = bars, or line / mirror per `waveformVariant`; `bars` (bar visualizer): bars, or mirror when
 * `waveformVariant` or `visualizerMirrored` says so; `mini` (or none): `waveformVariant` as saved.
 */
export function vizStyleOf(s: ModuleSettings, engine: LegacyEngine = oneOf(s.vizEngine, ["mini", "waveform", "bars"]) ?? "mini"): VizStyle {
  const style = oneOf(s.vizStyle, VIZ_STYLES);
  if (style) return style;
  const v = s.waveformVariant;
  if (engine === "waveform") return (s.waveformMode ?? "scrolling") !== "static" ? "scroll" : v === "line" || v === "mirror" ? v : "bars";
  if (engine === "bars") return v === "mirror" || s.visualizerMirrored ? "mirror" : "bars";
  return oneOf(v, VIZ_STYLES) ?? "bars";
}

/** The legacy shape keys' defaults: a value equal to one is not a choice, so the skin keeps the shape. */
const SHAPE_DEFAULTS = { waveformBarWidth: 3, waveformBarGap: 1, waveformBarRadius: 1.5, waveformMinBarHeight: 4 };
const chosenNum = (s: ModuleSettings, key: keyof typeof SHAPE_DEFAULTS): number | undefined => {
  const n = numberOf(s[key]);
  return n === undefined || n === SHAPE_DEFAULTS[key] ? undefined : n;
};

/**
 * The look of the template's tuning keys (config v8 names, else the old engines' keys), at their
 * defaults when unset: bar count, alignment, orientation, resting level, line width, edge fade and
 * sensitivity. Two keys have no row: `vizMinPx` (a floor in px) and `vizScrollAs` (the Scroll style
 * drawn as a line), which v8 writes from the old keys. The old hidden shape keys count only when
 * saved away from their default: bar width + gap give the gap (unless `vizGap` is set), radius 0 a
 * square bar (unless `vizShape` is chosen), the minimum bar height the floor.
 */
export function tuningLookOf(s: ModuleSettings): Partial<VizLook> {
  const n = (key: string, legacy: string, def: number) => numberOf(s[key]) ?? numberOf(s[legacy]) ?? def;
  const width = chosenNum(s, "waveformBarWidth");
  const gapPx = chosenNum(s, "waveformBarGap");
  const radius = chosenNum(s, "waveformBarRadius");
  const minPx = numberOf(s.vizMinPx) ?? chosenNum(s, "waveformMinBarHeight");
  const gapSet = numberOf(s.vizGap) !== undefined;
  const shapeSet = s.vizShape !== undefined && s.vizShape !== "" && s.vizShape !== "auto";
  const fade = s.vizFade ?? s.waveformFadeEdges;
  return {
    count: n("vizBars", "visualizerBarCount", 24),
    align: oneOf(s.vizAlign ?? s.visualizerAlign, ["start", "center", "end"]) ?? "center",
    orientation: oneOf(s.vizOrientation ?? s.visualizerOrientation, ["horizontal", "vertical"]) ?? "horizontal",
    minLevel: n("vizMinLevel", "visualizerMinLevel", 0.08),
    lineWidth: n("vizLine", "waveformLineWidth", 1.5),
    fade: fade === undefined || Boolean(fade) ? n("vizFadeWidth", "waveformFadeWidth", 24) : 0,
    gain: n("vizGain", "waveformSensitivity", 1),
    scrollAs: (s.vizScrollAs ?? s.waveformVariant) === "line" ? "line" : "bars",
    ...(!gapSet && (width !== undefined || gapPx !== undefined) ? { gap: (gapPx ?? 1) / ((width ?? 3) + (gapPx ?? 1)) } : null),
    ...(!shapeSet && radius !== undefined ? { shape: radius === 0 ? ("square" as const) : ("round" as const) } : null),
    ...(minPx !== undefined ? { minPx } : null),
  };
}

/**
 * The pinned Web Audio capture devices (one visualizer row each). Only active while `liveCapture`
 * is on; the comma-separated `devices` (the old `liveSources`) value is split into stable device ids.
 * Empty → the single sensor row.
 */
export function captureDeviceIdsOf(s: ModuleSettings): string[] | undefined {
  if (!s.liveCapture) return undefined;
  return devicesOf(s, "liveSources");
}

/** The props the template reads from the shared keys; `tuning` = where the old engines' keys are read (`tuningLookOf`). */
export function sharedPropsOf(s: ModuleSettings, tuning: ModuleSettings = s): Partial<NowPlayingProps> {
  return {
    layout: oneOf(s.playerLayout, ["card", "vinyl", "backdrop", "wave"]),
    showTimes: s.showTimes === undefined ? undefined : Boolean(s.showTimes),
    showProgress: s.showProgress === undefined ? undefined : Boolean(s.showProgress),
    tint: s.tint === undefined ? undefined : Boolean(s.tint),
    artBackground: s.artBackground === undefined ? undefined : Boolean(s.artBackground),
    captureDevices: captureDeviceIdsOf(s),
    vizLook: { ...vizLookOf(s), ...tuningLookOf(tuning) },
  };
}
