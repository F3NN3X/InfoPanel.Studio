// The visualiser look settings shared by the NowPlaying template and the Visualizer widget: colours
// (Style, More), shape and the dynamics (Behaviour, More). Colour 1 stays each widget's own key (`vizColor1`, the
// old `vizRamp` until config v8 / `ramp`).
import type { ModuleSetting, ModuleSettings } from "@/modules/types";
import type { VizLook } from "../core/viz/types";
import { boolOf, boolSetting, colorSetting, enumSetting, numberOf, numberSetting, oneOf, stringOf } from "./settings-kit";

export const VIZ_COLORS_GROUP = "Visualizer colors";
export const VIZ_SHAPE_GROUP = "Visualizer shape";
export const VIZ_DYNAMICS_GROUP = "Visualizer dynamics";

const COLOR_MODES = ["follow", "solid", "gradient", "ramp"] as const;
const GRADIENTS = ["vertical", "horizontal", "radial"] as const;
const GLOWS = ["auto", "on", "off"] as const;
const SHAPES = ["auto", "round", "square", "segments", "pill"] as const;
const custom = (v: ModuleSettings) => v.vizColorMode === "gradient" || v.vizColorMode === "ramp";
/** The styles that draw bars, so the only ones the bar shape and gap reach. */
const BAR_STYLES = ["bars", "mirror", "scroll"];
const style = { tab: "style", advanced: true, group: VIZ_COLORS_GROUP } as const;
const dynamics = { tab: "behaviour", advanced: true, group: VIZ_DYNAMICS_GROUP } as const;

/** The colour settings, with the widget's colour-1 setting moved in as the first colour. */
export function vizColorSettings(color1: ModuleSetting): ModuleSetting[] {
  return [
    enumSetting("vizColorMode", "Color mode", "follow", [{ value: "follow", label: "Follow theme" }, { value: "solid", label: "Solid" }, { value: "gradient", label: "Gradient" }, { value: "ramp", label: "Ramp" }], { ...style, hint: "Follow takes the accent and the skin; the others use colours 1–3" }),
    enumSetting("vizGradient", "Gradient", "vertical", [{ value: "vertical", label: "Vertical" }, { value: "horizontal", label: "Horizontal" }, { value: "radial", label: "Radial" }], { ...style, visibleIf: (v) => v.vizColorMode === "gradient" }),
    // Follow ignores colour 1, except for a colour saved before the mode existed (it still draws as a ramp)
    { ...color1, ...style, visibleIf: (v) => v.vizColorMode !== "follow" || Boolean(v[color1.key]), hint: "Colour 1, or a ramp name (thermal, viridis, magma, ice, synth, mono) in Ramp mode" },
    colorSetting("vizColor2", "Color 2", { group: VIZ_COLORS_GROUP, visibleIf: custom }),
    colorSetting("vizColor3", "Color 3", { group: VIZ_COLORS_GROUP, visibleIf: custom }),
    colorSetting("vizPeakColor", "Peak cap color", { group: VIZ_COLORS_GROUP }),
    numberSetting("vizOpacity", "Opacity (%)", 100, { ...style, min: 10, max: 100, step: 5 }),
    enumSetting("vizGlow", "Glow", "auto", [{ value: "auto", label: "Skin" }, { value: "on", label: "On" }, { value: "off", label: "Off" }], style),
  ];
}

/** The shape and gap; `modeKey` is the widget's own style key, which decides whether they are drawn. */
export const vizShapeSettings = (modeKey: string): ModuleSetting[] => {
  const bars = (v: ModuleSettings) => BAR_STYLES.includes(String(v[modeKey]));
  return [
    enumSetting("vizShape", "Bar shape", "auto", [{ value: "auto", label: "Skin" }, { value: "round", label: "Round" }, { value: "square", label: "Square" }, { value: "segments", label: "Segments" }, { value: "pill", label: "Pill" }], { group: VIZ_SHAPE_GROUP, visibleIf: bars }),
    numberSetting("vizGap", "Bar gap (% of the slot)", 30, { min: 0, max: 80, step: 5, group: VIZ_SHAPE_GROUP, visibleIf: bars }),
  ];
};

const DYNAMICS_HINT = "Real spectrum from the AudioMeter plugin (v1.3.0+)";
export const vizDynamicsSettings = (): ModuleSetting[] => [
  numberSetting("vizFloorDb", "Floor (dB)", -60, { ...dynamics, min: -90, max: -30, step: 1, hint: DYNAMICS_HINT }),
  numberSetting("vizCeilDb", "Ceiling (dB)", -12, { ...dynamics, min: -30, max: 0, step: 1 }),
  numberSetting("vizTilt", "Treble tilt (dB/oct)", 3, { ...dynamics, min: 0, max: 6, step: 0.5 }),
  boolSetting("vizAutoGain", "Auto gain", true, dynamics),
  numberSetting("vizAttack", "Attack (ms)", 60, { ...dynamics, min: 10, max: 500, step: 10 }),
  numberSetting("vizRelease", "Release (ms)", 300, { ...dynamics, min: 50, max: 2000, step: 50 }),
];

/**
 * The colour mode: the saved choice; else Ramp when colour 1 (`vizColor1` / `vizRamp` / `ramp`) is set, which is how
 * the renderers before the look settings drew that colour, so a saved colour keeps showing; else unset
 * (Follow). `saved` holds the raw stored values, since the resolved look fills the default in.
 */
export function colorModeOf(s: ModuleSettings, saved?: ModuleSettings): VizLook["colorMode"] | undefined {
  const own = saved ?? s;
  const chosen = oneOf(own.vizColorMode, COLOR_MODES);
  if (chosen) return chosen;
  // A theme's Series 1 is no saved colour: only an own one keeps the old Ramp.
  return stringOf(own.vizColor1) || stringOf(own.vizRamp) || stringOf(own.ramp) ? "ramp" : undefined;
}

/** The look from the shared keys; unset keys stay unset (the renderer's defaults apply). */
export function vizLookOf(s: ModuleSettings, saved?: ModuleSettings): Partial<VizLook> {
  const opacity = numberOf(s.vizOpacity);
  const gap = numberOf(s.vizGap);
  return {
    colorMode: colorModeOf(s, saved),
    gradient: oneOf(s.vizGradient, GRADIENTS),
    color2: stringOf(s.vizColor2),
    color3: stringOf(s.vizColor3),
    peakColor: stringOf(s.vizPeakColor),
    opacity: opacity === undefined ? undefined : opacity / 100,
    glow: oneOf(s.vizGlow, GLOWS),
    shape: oneOf(s.vizShape, SHAPES),
    gap: gap === undefined ? undefined : gap / 100,
    floorDb: numberOf(s.vizFloorDb),
    ceilDb: numberOf(s.vizCeilDb),
    tiltDb: numberOf(s.vizTilt),
    autoGain: boolOf(s.vizAutoGain),
    attackMs: numberOf(s.vizAttack),
    releaseMs: numberOf(s.vizRelease),
  };
}
