// The audio templates' shared settings (AudioMeter, MeterBridge, VolumeMixer) and Wave Link's, under the
// keys and defaults the old Audio and Wave Link widgets stored.
import type { BallisticsPreset } from "@/lib/audio/ballistics";
import type { ModuleSetting, ModuleSettings } from "@/modules/types";
import type { WaveLinkProps } from "../wave-link/WaveLink";
import { flowFilterOf } from "./audio-data";
import { MIXER_LOOK, type MixerLook } from "../core/mixer-look";
import type { WidgetMeta } from "../core/types";
import { meta as waveLinkMeta } from "../wave-link/meta";
import { boolSetting, colorSetting, enumSetting, numberOf, numberSetting, oneOf, splitKeys, textSetting, viewKeyOf, viewSetting } from "./settings-kit";

/** The meters' response (Behaviour › Motion), themed: the theme editor lists it too. */
export const METER_BALLISTICS: ModuleSetting = {
  key: "meterBallistics",
  label: "Meter response",
  type: "select",
  default: "peak",
  options: [
    { value: "peak", label: "Peak (fast attack, peak-hold)" },
    { value: "vu", label: "VU (slow)" },
    { value: "instant", label: "Instant" },
  ],
  // Themed since config v7: Behaviour › Motion, with Graph updates.
  section: "motion",
};

const METER_VARIANT: ModuleSetting = {
  key: "meterVariant",
  label: "Meter type",
  type: "select",
  default: "solid",
  options: [
    { value: "solid", label: "Solid" },
    { value: "segmented", label: "Segmented" },
    { value: "gradient", label: "Gradient" },
  ],
  group: "Meter",
};

/** The Show filter of every audio widget (`flow`): it narrows the device picker and what "all devices" means. */
export const audioFlowSetting = (group: string, extra: Partial<ModuleSetting> = {}): ModuleSetting =>
  enumSetting(
    "flow",
    "Show",
    "all",
    [
      { value: "all", label: "All devices" },
      { value: "output", label: "Outputs" },
      { value: "input", label: "Inputs" },
    ],
    { group, tab: "data", keywords: ["input", "output", "microphone"], ...extra }
  );

/** The stored Show filter. */
export const flowOfSettings = (s: ModuleSettings) => flowFilterOf(s.flow);

/** The picked devices (`key`, comma-separated); undefined = all. */
export function pickedDevicesOf(s: ModuleSettings, key: string): string[] | undefined {
  const picked = splitKeys(s[key]);
  return picked.length > 0 ? picked : undefined;
}

const AUDIO_SETTINGS: ModuleSetting[] = [
  { key: "showDevice", label: "Device name", type: "boolean", default: true, group: "Details" },
  {
    key: "showDetails",
    label: "Peak / RMS & L/R/volume details",
    type: "boolean",
    default: true,
    group: "Details",
  },
  { key: "showVolume", label: "Volume bar", type: "boolean", default: false, group: "Details" },
  { key: "showMute", label: "Mute indicator", type: "boolean", default: true, group: "Details" },
  METER_BALLISTICS,
];

/** The shared audio settings by key, for a template's own list. */
export const audioSettings = (...keys: string[]): ModuleSetting[] => keys.map((k) => AUDIO_SETTINGS.find((s) => s.key === k)!);

/** The stored `meterBallistics` (a select: peak / vu / instant). */
export const ballisticsOf = (s: ModuleSettings): BallisticsPreset => (s.meterBallistics === "vu" ? "vu" : s.meterBallistics === "instant" ? "instant" : "peak");

/* ───────── the mixer views (StreamMixer, VolumeMixer, WaveLink) ───────── */

const SIZES = [
  { value: "sm", label: "Small" },
  { value: "default", label: "Medium" },
  { value: "lg", label: "Large" },
];
const ORIENTATIONS = [
  { value: "vertical", label: "Vertical" },
  { value: "horizontal", label: "Horizontal" },
];

/** What a mixer's view settings differ in: the stored orientation key, and the fader options only one widget has. */
export interface MixerSettingsOptions {
  /** WaveLink keeps its `meterOrientation` (already in its list, so not added here); the others store `orientation`. */
  orientationKey: string;
  /** A writable fader (StreamMixer): its arrow-key step and the mouse wheel. */
  writable?: boolean;
  /** A dB fader (WaveLink): its law. */
  db?: boolean;
  /** WaveLink already has the Meter type and Meter response rows (and its rows view uses them); the others get them here. */
  ownMeter?: boolean;
}

/**
 * A mixer's View row and the options of its audiocn views, each shown only in the views it draws in: the strip, fader
 * and scale rows in Strips, the LCD rows in LCD and in Strips with the LCD readout on.
 */
export function mixerViewSettings(meta: WidgetMeta, o: MixerSettingsOptions): ModuleSetting[] {
  const key = viewKeyOf(meta);
  const viewOf = (v: ModuleSettings) => String(v[key] ?? "rows");
  const strips = (v: ModuleSettings) => viewOf(v) === "strips";
  const scaled = (v: ModuleSettings) => strips(v) && v.faderScale !== false;
  const metered = (v: ModuleSettings) => strips(v) && v.stripMeter !== false;
  const lcd = (v: ModuleSettings) => viewOf(v) === "lcd" || (strips(v) && v.stripLcd !== false);
  const STRIP = "Strip",
    METER = "Meter",
    FADER = "Fader",
    LCD = "LCD";
  return [
    viewSetting(meta, { group: "Layout", hint: "Strips and LCD fall back to Rows where the channels don't fit" }),
    ...(o.orientationKey === "meterOrientation" ? [] : [enumSetting(o.orientationKey, "Orientation", "vertical", ORIENTATIONS, { group: "Layout", visibleIf: (v) => viewOf(v) !== "rows" })]),
    enumSetting("stripVariant", "Strip style", "default", [{ value: "default", label: "Filled" }, { value: "card", label: "Card" }, { value: "ghost", label: "Plain" }], { group: STRIP, visibleIf: strips }),
    enumSetting("stripSize", "Strip size", "default", SIZES, { group: STRIP, visibleIf: strips }),
    boolSetting("stripAccent", "Colour tag", true, { group: STRIP, visibleIf: strips }),
    boolSetting("stripIcon", "Icon (horizontal strips)", true, { group: STRIP, visibleIf: strips }),
    boolSetting("stripSub", "Status line", true, { group: STRIP, visibleIf: strips }),
    boolSetting("stripMeter", "Meter", true, { group: STRIP, visibleIf: strips }),
    boolSetting("stripLcd", "LCD readout", true, { group: STRIP, visibleIf: strips }),
    boolSetting("stripStatus", "Live / Muted badge (horizontal strips)", false, { group: STRIP, more: true, visibleIf: strips }),
    ...(o.ownMeter ? [] : [{ ...METER_VARIANT, visibleIf: metered }, { ...METER_BALLISTICS, visibleIf: metered }]),
    numberSetting("meterSegments", "LED segments", 24, { min: 4, max: 64, step: 1, group: METER, more: true, visibleIf: (v) => metered(v) && v.meterVariant === "segmented" }),
    numberSetting("meterMinDb", "Meter floor (dB)", -60, { min: -120, max: -12, step: 6, group: METER, more: true, visibleIf: metered }),
    numberSetting("meterMaxDb", "Meter top (dB)", 0, { min: -6, max: 6, step: 1, hint: "A level never reads above 0 dB; a higher top only leaves headroom", group: METER, more: true, visibleIf: metered }),
    enumSetting("meterTaper", "Meter scale", "linear", [{ value: "linear", label: "Linear (dB)" }, { value: "audio", label: "Console (audio)" }], { group: METER, more: true, visibleIf: metered }),
    numberSetting("meterWarnDb", "Amber from (dB)", -20, { min: -60, max: 0, step: 1, group: METER, more: true, visibleIf: metered }),
    numberSetting("meterClipDb", "Red from (dB)", -9, { min: -60, max: 0, step: 1, group: METER, more: true, visibleIf: metered }),
    boolSetting("meterHold", "Peak hold", true, { group: METER, more: true, visibleIf: metered }),
    boolSetting("meterValue", "dB readout", false, { group: METER, visibleIf: metered }),
    boolSetting("meterClip", "Clip light", false, { group: METER, visibleIf: metered }),
    enumSetting("faderVariant", "Fader cap", "default", [{ value: "default", label: "Round" }, { value: "console", label: "Console" }], { group: FADER, visibleIf: strips }),
    boolSetting("faderRange", "Level fill", true, { group: FADER, visibleIf: strips }),
    boolSetting("faderScale", "Scale", true, { group: FADER, visibleIf: strips }),
    boolSetting("scaleLabels", "Scale labels", true, { group: FADER, more: true, visibleIf: scaled }),
    enumSetting("scaleSide", "Scale side", "start", [{ value: "start", label: "Before" }, { value: "end", label: "After" }], { group: FADER, more: true, visibleIf: scaled }),
    textSetting("scaleTicks", "Scale marks", "", { group: FADER, more: true, hint: "Comma-separated, e.g. 0, 50, 100; empty = the fader's own", visibleIf: scaled }),
    ...(o.db ? [enumSetting("faderTaper", "Fader law", "linear", [{ value: "linear", label: "Linear" }, { value: "audio", label: "Console (audio)" }], { group: FADER, hint: "Where a dB fader's values sit on its travel", visibleIf: strips })] : []),
    ...(o.writable
      ? [
          numberSetting("faderStep", "Arrow-key step (%)", 1, { min: 1, max: 10, step: 1, group: FADER, more: true, visibleIf: strips }),
          boolSetting("faderWheel", "Mouse wheel moves a focused fader", false, { group: FADER, more: true, visibleIf: strips }),
        ]
      : []),
    enumSetting("lcdVariant", "LCD ink", "primary", [{ value: "primary", label: "Channel" }, { value: "amber", label: "Amber" }, { value: "green", label: "Green" }, { value: "cyan", label: "Cyan" }, { value: "red", label: "Red" }], { group: LCD, visibleIf: lcd }),
    enumSetting("lcdAppearance", "LCD screen", "auto", [{ value: "auto", label: "Auto" }, { value: "light", label: "Backlit" }, { value: "dark", label: "Glowing" }], { group: LCD, hint: "Auto follows the widget's surface", visibleIf: lcd }),
    enumSetting("lcdSize", "LCD text", "sm", SIZES, { group: LCD, visibleIf: lcd }),
    boolSetting("lcdMatrix", "Dot matrix", true, { group: LCD, more: true, visibleIf: lcd }),
    boolSetting("lcdScanlines", "Scanlines", true, { group: LCD, more: true, visibleIf: lcd }),
    boolSetting("lcdStatus", "Status pixel", true, { group: LCD, more: true, visibleIf: lcd }),
  ];
}

const bool = (v: unknown, def: boolean): boolean => (typeof v === "boolean" ? v : def);
const clampNum = (v: unknown, min: number, max: number, def: number): number => {
  const n = numberOf(v);
  return Math.min(max, Math.max(min, n ?? def));
};
const ticksOf = (v: unknown): number[] | undefined => {
  const ticks = splitKeys(v).map(numberOf).filter((n): n is number => n !== undefined);
  return ticks.length ? ticks : undefined;
};

/** The stored mixer view options; a missing or unknown value is the default (the rows view, as before the views). */
export function mixerLookOf(s: ModuleSettings, orientationKey: string): MixerLook {
  const d = MIXER_LOOK;
  // the range keeps at least 6 dB; the zones start inside it, and a red zone never below the amber one
  const minDb = clampNum(s.meterMinDb, -120, -12, d.meterMinDb),
    maxDb = Math.max(minDb + 6, clampNum(s.meterMaxDb, -6, 6, d.meterMaxDb)),
    warnDb = clampNum(s.meterWarnDb, minDb, maxDb, d.meterWarnDb);
  return {
    view: oneOf(s.view, ["rows", "strips", "lcd"] as const) ?? d.view,
    vertical: s[orientationKey] !== "horizontal",
    stripVariant: oneOf(s.stripVariant, ["default", "card", "ghost"] as const) ?? d.stripVariant,
    stripSize: oneOf(s.stripSize, ["sm", "default", "lg"] as const) ?? d.stripSize,
    accent: bool(s.stripAccent, d.accent),
    icon: bool(s.stripIcon, d.icon),
    sub: bool(s.stripSub, d.sub),
    status: bool(s.stripStatus, d.status),
    meter: bool(s.stripMeter, d.meter),
    meterVariant: oneOf(s.meterVariant, ["solid", "segmented", "gradient"] as const) ?? d.meterVariant,
    meterSegments: clampNum(s.meterSegments, 4, 64, d.meterSegments),
    meterMinDb: minDb,
    meterMaxDb: maxDb,
    meterBallistics: ballisticsOf(s),
    meterTaper: oneOf(s.meterTaper, ["linear", "audio"] as const) ?? d.meterTaper,
    meterWarnDb: warnDb,
    meterClipDb: clampNum(s.meterClipDb, warnDb, maxDb, d.meterClipDb),
    meterHold: bool(s.meterHold, d.meterHold),
    meterValue: bool(s.meterValue, d.meterValue),
    meterClip: bool(s.meterClip, d.meterClip),
    faderVariant: oneOf(s.faderVariant, ["default", "console"] as const) ?? d.faderVariant,
    range: bool(s.faderRange, d.range),
    scale: bool(s.faderScale, d.scale),
    scaleLabels: bool(s.scaleLabels, d.scaleLabels),
    scaleSide: oneOf(s.scaleSide, ["start", "end"] as const) ?? d.scaleSide,
    ticks: ticksOf(s.scaleTicks),
    taper: oneOf(s.faderTaper, ["linear", "audio"] as const) ?? d.taper,
    step: Math.min(10, Math.max(1, Math.round(numberOf(s.faderStep) ?? d.step))),
    wheel: bool(s.faderWheel, d.wheel),
    lcd: bool(s.stripLcd, d.lcd),
    lcdVariant: oneOf(s.lcdVariant, ["primary", "amber", "green", "cyan", "red"] as const) ?? d.lcdVariant,
    lcdAppearance: oneOf(s.lcdAppearance, ["auto", "light", "dark"] as const) ?? d.lcdAppearance,
    lcdSize: oneOf(s.lcdSize, ["sm", "default", "lg"] as const) ?? d.lcdSize,
    lcdMatrix: bool(s.lcdMatrix, d.lcdMatrix),
    lcdScanlines: bool(s.lcdScanlines, d.lcdScanlines),
    lcdStatus: bool(s.lcdStatus, d.lcdStatus),
  };
}

export const WAVELINK_SETTINGS: ModuleSetting[] = [
  {
    key: "showReadout",
    label: "dB readouts & scale",
    type: "boolean",
    default: true,
    group: "Details",
  },
  {
    key: "showFader",
    label: "Fader level",
    type: "boolean",
    default: true,
    group: "Details",
  },
  {
    key: "showMixes",
    label: "Mixes (routes & output mixers)",
    type: "boolean",
    default: true,
    group: "Details",
  },
  METER_VARIANT,
  {
    key: "meterOrientation",
    label: "Meter orientation",
    type: "select",
    default: "vertical",
    options: [
      { value: "vertical", label: "Vertical" },
      { value: "horizontal", label: "Horizontal" },
    ],
    group: "Meter",
  },
  // Follow the theme's OK and Critical ("" = the accent, green and red); the level colour also carries the old Wave Link widget's teal (config v4, `legacy-zones.ts`).
  colorSetting("levelColor", "Level", { role: "ok", more: false }),
  colorSetting("liveColor", "Live indicator", { role: "ok", more: false }),
  colorSetting("muteColor", "Muted / offline", { role: "crit", more: false }),
  {
    key: "source",
    label: "Meters to show",
    type: "select",
    default: "",
    multiple: true,
    optionsFrom: "wavelink",
    group: "Meters",
    tab: "data",
  },
  audioFlowSetting("Meters", { hint: "Inputs are the channels and input devices, Outputs the mixes" }),
  METER_BALLISTICS,
  // its orientation is `meterOrientation` (above), in every view
  ...mixerViewSettings(waveLinkMeta, { orientationKey: "meterOrientation", db: true, ownMeter: true }),
];

/**
 * Whether the level colour is the widget's own rather than the theme's OK, which the level row follows (`role: "ok"`): only the theme's
 * gives way to the Look's meter colour (`meterColour`). `saved` is the zone's settings as the theme resolves them, where the OK is (the
 * widget's own settings hold no OK); a colour of the widget's that is the OK itself reads as the theme's.
 */
export const levelOwnOf = (s: ModuleSettings, saved?: ModuleSettings): boolean => {
  const v = String(s.levelColor ?? "").trim().toLowerCase();
  return v !== "" && v !== String(saved?.ok ?? s.ok ?? "").trim().toLowerCase();
};

export const wavelinkToProps = (s: ModuleSettings): Partial<WaveLinkProps> => ({
  source: String(s.source ?? ""),
  flow: flowOfSettings(s),
  showReadout: Boolean(s.showReadout),
  showFader: Boolean(s.showFader),
  showMixes: Boolean(s.showMixes),
  meterVariant: s.meterVariant === "segmented" ? "segmented" : s.meterVariant === "gradient" ? "gradient" : "solid",
  meterOrientation: s.meterOrientation === "horizontal" ? "horizontal" : "vertical",
  ballistics: ballisticsOf(s),
  liveColor: String(s.liveColor ?? ""),
  muteColor: String(s.muteColor ?? ""),
  mixerLook: mixerLookOf(s, "meterOrientation"),
});

/** Select options for plain values, labelled by capitalising them (the meters' styles, the visualizer's modes). */
export const opts = (values: readonly string[]) => values.map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));
/** A segment count where 0 = the widget sizes it to the zone. */
export const autoCount = (v: unknown): number | undefined => {
  const n = numberOf(v);
  return n !== undefined && n > 0 ? n : undefined;
};

// The Stream Deck screen's audio widgets (Stream Mixer, Audio Button, Audio Fader) share these rows.
const FADERS = [
  { value: "leds", label: "LEDs" },
  { value: "bar", label: "Bar" },
];

/** A row listing what the server's audio control offers now (channels, mixes, output devices). */
export const audioPick = (key: string, label: string, extra: Partial<ModuleSetting> = {}): ModuleSetting => ({ key, label, type: "select", default: "", optionsFrom: "audio-control", tab: "data", ...extra });

export const faderSetting = (): ModuleSetting => enumSetting("fader", "Fader", "leds", FADERS, { group: "Fader" });
export const mixSetting = (visibleIf?: ModuleSetting["visibleIf"]): ModuleSetting => audioPick("mix", "Wave Link mix", { group: "Source", hint: "The mix whose levels and mutes the channels use", ...(visibleIf ? { visibleIf } : {}) });
export const faderOf = (v: unknown) => oneOf(v, ["leds", "bar"] as const);
