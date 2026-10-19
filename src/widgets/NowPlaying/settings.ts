// NowPlaying's settings (the old Spotify / Media widgets' keys, which the template keeps) and the
// mapping from those stored keys to NowPlaying props.
import type { ModuleSetting, ModuleSettings } from "@/modules/types";
import { VIZ_STYLES, type VizLook, type VizStyle } from "../core/viz/types";
import type { NowPlayingProps } from "../NowPlaying";
import { devicesOf } from "@/modules/setting-readers";
import { boolSetting, deviceSetting, enumSetting, numberOf, oneOf } from "../registry/settings-kit";
import { vizLookOf } from "../registry/viz-settings";

/** The audio-level-meter plugin, which drives the visualizers' live level. */
export const AUDIO_LEVEL = "plugins.audio-level-meter.";

/** The old media widgets' own settings (keys and defaults unchanged); the template module offers a subset (`registry/c.ts`). */
export const MEDIA_SETTINGS: ModuleSetting[] = [
  { key: "showTimes", label: "Times", type: "boolean", default: true, group: "Now playing" },
  { key: "showProgress", label: "Progress", type: "boolean", default: true, group: "Now playing" },
  { key: "tint", label: "Tint from cover art", type: "boolean", default: true, group: "Cover art" },
  {
    key: "artBackground",
    label: "Cover art background (blurred)",
    type: "boolean",
    default: false,
    group: "Cover art",
  },
  {
    key: "waveform",
    label: "Live waveform (audiocn)",
    type: "boolean",
    default: false,
    group: "Waveform",
  },
  {
    key: "waveformVariant",
    label: "Waveform style",
    type: "select",
    default: "bars",
    options: [
      { value: "bars", label: "Bars" },
      { value: "line", label: "Line" },
      { value: "mirror", label: "Mirror" },
    ],
    group: "Waveform",
  },
  {
    key: "waveformMode",
    label: "Waveform mode",
    type: "select",
    default: "scrolling",
    options: [
      { value: "scrolling", label: "Scrolling (level history)" },
      { value: "static", label: "Static (current bands)" },
    ],
    group: "Waveform",
  },
  {
    key: "waveformSensitivity",
    label: "Waveform sensitivity (gain)",
    type: "number",
    default: 1,
    min: 0.1,
    max: 4,
    step: 0.1,
    group: "Waveform",
  },
  {
    key: "waveformActive",
    label: "Waveform active (off = idle dotted line)",
    type: "boolean",
    default: true,
    group: "Waveform",
  },
  {
    key: "visualizer",
    label: "Bar visualizer (audiocn)",
    type: "boolean",
    default: false,
    group: "Visualizer",
  },
  {
    key: "visualizerBarCount",
    label: "Visualizer bar count",
    type: "number",
    default: 24,
    min: 4,
    max: 64,
    step: 2,
    group: "Visualizer",
  },
  {
    key: "visualizerAlign",
    label: "Visualizer alignment",
    type: "select",
    default: "center",
    options: [
      { value: "center", label: "Center" },
      { value: "start", label: "Start" },
      { value: "end", label: "End" },
    ],
    group: "Visualizer",
  },
  {
    key: "visualizerMirrored",

    advanced: true,
    label: "Visualizer mirrored",
    type: "boolean",
    default: false,
    group: "Visualizer",
  },
  {
    key: "visualizerMinLevel",

    advanced: true,
    label: "Visualizer resting bar size",
    type: "number",
    default: 0.08,
    min: 0,
    max: 0.5,
    step: 0.02,
    group: "Visualizer",
  },
  {
    key: "visualizerIdle",
    label: "Visualizer idle behavior",
    type: "select",
    default: "static",
    options: [
      { value: "static", label: "Static" },
      { value: "pulse", label: "Pulse" },
      { value: "wave", label: "Wave" },
    ],
    group: "Visualizer",
  },
  {
    key: "visualizerLoading",

    advanced: true,
    label: "Visualizer loading sweep",
    type: "boolean",
    default: false,
    group: "Visualizer",
  },
  {
    key: "visualizerOrientation",

    advanced: true,
    label: "Visualizer orientation",
    type: "select",
    default: "horizontal",
    options: [
      { value: "horizontal", label: "Horizontal" },
      { value: "vertical", label: "Vertical" },
    ],
    group: "Visualizer",
  },
  {
    key: "waveformBarWidth",

    advanced: true,
    label: "Waveform bar width (px)",
    type: "number",
    default: 3,
    min: 1,
    max: 12,
    step: 1,
    group: "Waveform shape",
  },
  {
    key: "waveformBarGap",

    advanced: true,
    label: "Waveform bar gap (px)",
    type: "number",
    default: 1,
    min: 0,
    max: 8,
    step: 1,
    group: "Waveform shape",
  },
  {
    key: "waveformBarRadius",

    advanced: true,
    label: "Waveform bar radius (px)",
    type: "number",
    default: 1.5,
    min: 0,
    max: 8,
    step: 0.5,
    group: "Waveform shape",
  },
  {
    key: "waveformMinBarHeight",

    advanced: true,
    label: "Waveform min bar height (px)",
    type: "number",
    default: 4,
    min: 0,
    max: 40,
    step: 1,
    group: "Waveform shape",
  },
  {
    key: "waveformLineWidth",

    advanced: true,
    label: "Waveform line width (px)",
    type: "number",
    default: 1.5,
    min: 0.5,
    max: 6,
    step: 0.5,
    group: "Waveform shape",
  },
  {
    key: "waveformFadeEdges",

    advanced: true,
    label: "Waveform edge fade",
    type: "boolean",
    default: true,
    group: "Waveform shape",
  },
  {
    key: "waveformFadeWidth",

    advanced: true,
    label: "Waveform fade width (px)",
    type: "number",
    default: 24,
    min: 0,
    max: 200,
    step: 4,
    group: "Waveform shape",
  },
  {
    key: "liveSource",

    tab: "data",
    label: "Live level source (audio device)",
    type: "select",
    default: "",
    optionsFrom: "sources",
    sourcePlugin: AUDIO_LEVEL,
    group: "Audio source",
  },
  {
    key: "liveCapture",

    tab: "data",
    label: "Live capture (Web Audio, real-time)",
    type: "boolean",
    default: false,
    group: "Audio source",
  },
  {
    // `liveSources` until config v7 (`devices`, the shared multi-device key).
    key: "devices",

    tab: "data",
    label: "Capture devices (one visualizer row each)",
    type: "select",
    default: "",
    optionsFrom: "media",
    multiple: true,
    group: "Audio source",
  },
];

/** The template layout, stored as `playerLayout` (the standard `layout` keeps its meaning). */
export const PLAYER_LAYOUT: ModuleSetting = {
  key: "playerLayout",
  label: "Player layout",
  type: "select",
  default: "card",
  options: [
    { value: "card", label: "Card" },
    { value: "vinyl", label: "Vinyl" },
    { value: "backdrop", label: "Backdrop" },
    { value: "wave", label: "Wave" },
  ],
  group: "Now playing",
};

/** The template's styles, one picker; choosing one clears a stored legacy `vizEngine` (read by `vizStyleOf`). */
const STYLE_OPTIONS = VIZ_STYLES.map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1), applies: { vizEngine: "mini" } }));

/**
 * The template's own props: `vizMode` is stored under the legacy key `waveformVariant` (PHASE9_PLAN §3.2),
 * `vizDevice` under the shared `device` (the legacy `liveSource` until config v7), here with the template's
 * full option set.
 */
export const NOW_PLAYING_OWN: ModuleSetting[] = [
  enumSetting("source", "Source", "auto", [{ value: "auto", label: "Auto" }, { value: "media", label: "Windows Media" }, { value: "spotify", label: "Spotify" }, { value: "pushed", label: "Pushed" }], { group: "Now playing" }),
  boolSetting("showArt", "Cover art", true, { group: "Now playing" }),
  enumSetting("progress", "Progress row", "bar", [{ value: "bar", label: "Bar" }, { value: "wave", label: "Wavy progress bar" }, { value: "visualizer", label: "Visualizer" }], { group: "Now playing" }),
  enumSetting("waveformVariant", "Visualizer style", "bars", STYLE_OPTIONS, { group: "Visualizer" }),
  deviceSetting("Visualizer device", "audio", { group: "Visualizer" }),
  boolSetting("showTimeline", "Timeline under the visualizer", true, { group: "Visualizer" }),
];

/** What drew the visualiser before one renderer: the stored `vizEngine` (the config v4 migration writes the old media widgets' pick). */
export type LegacyEngine = "mini" | "waveform" | "bars";

/**
 * The style from the stored keys. `waveform` (live waveform): scrolling (its default) = `scroll`,
 * static = bars, or line / mirror per `waveformVariant`; `bars` (bar visualizer): bars, or mirror when
 * `waveformVariant` or `visualizerMirrored` says so; `mini` (or none): `waveformVariant` as saved.
 */
export function vizStyleOf(s: ModuleSettings, engine: LegacyEngine = oneOf(s.vizEngine, ["mini", "waveform", "bars"]) ?? "mini"): VizStyle {
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
 * The look from the old engines' keys, at their defaults when unset: bar count, alignment, orientation,
 * resting level, line width, edge fade and sensitivity. The hidden shape keys count only when saved
 * away from their default: bar width + gap give the gap (unless `vizGap` is set), radius 0 a square
 * bar (unless `vizShape` is chosen), the minimum bar height a floor in px.
 */
export function tuningLookOf(s: ModuleSettings): Partial<VizLook> {
  const n = (key: string, def: number) => numberOf(s[key]) ?? def;
  const width = chosenNum(s, "waveformBarWidth");
  const gapPx = chosenNum(s, "waveformBarGap");
  const radius = chosenNum(s, "waveformBarRadius");
  const minPx = chosenNum(s, "waveformMinBarHeight");
  const gapSet = numberOf(s.vizGap) !== undefined;
  const shapeSet = s.vizShape !== undefined && s.vizShape !== "" && s.vizShape !== "auto";
  return {
    count: n("visualizerBarCount", 24),
    align: oneOf(s.visualizerAlign, ["start", "center", "end"]) ?? "center",
    orientation: oneOf(s.visualizerOrientation, ["horizontal", "vertical"]) ?? "horizontal",
    minLevel: n("visualizerMinLevel", 0.08),
    lineWidth: n("waveformLineWidth", 1.5),
    fade: s.waveformFadeEdges === undefined || Boolean(s.waveformFadeEdges) ? n("waveformFadeWidth", 24) : 0,
    gain: n("waveformSensitivity", 1),
    scrollAs: s.waveformVariant === "line" ? "line" : "bars",
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
