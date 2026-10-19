// The audio templates' shared settings (AudioMeter, MeterBridge, VolumeMixer) and Wave Link's, under the
// keys and defaults the old Audio and Wave Link widgets stored.
import type { BallisticsPreset } from "@/lib/audio/ballistics";
import type { ModuleSetting, ModuleSettings } from "@/modules/types";
import type { WaveLinkProps } from "../WaveLink";
import { colorSetting } from "./settings-kit";

const METER_BALLISTICS: ModuleSetting = {
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
  label: "Meter style",
  type: "select",
  default: "solid",
  options: [
    { value: "solid", label: "Solid" },
    { value: "segmented", label: "Segmented" },
    { value: "gradient", label: "Gradient" },
  ],
  group: "Meter",
};

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
  METER_BALLISTICS,
];

export const wavelinkToProps = (s: ModuleSettings): Partial<WaveLinkProps> => ({
  source: String(s.source ?? ""),
  showReadout: Boolean(s.showReadout),
  showFader: Boolean(s.showFader),
  showMixes: Boolean(s.showMixes),
  meterVariant: s.meterVariant === "segmented" ? "segmented" : s.meterVariant === "gradient" ? "gradient" : "solid",
  meterOrientation: s.meterOrientation === "horizontal" ? "horizontal" : "vertical",
  ballistics: ballisticsOf(s),
  liveColor: String(s.liveColor ?? ""),
  muteColor: String(s.muteColor ?? ""),
});
