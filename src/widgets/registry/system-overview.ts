// SystemOverview's stored settings (the detail switches keep the old System widget's keys) and the
// mapping to template props.
import type { ModuleSetting, ModuleSettings } from "@/modules/types";
import type { Detail, Section, SystemOverviewProps } from "../SystemOverview";
import { boolSetting, colorSetting, enumSetting, numberSetting, oneOf, splitKeys, textSetting } from "./settings-kit";

const GROUP_THRESHOLDS = "Thresholds";
const GROUP_UNITS = "Units & labels";

/** The detail switches, each stored under the old System widget's key. */
const DETAIL_KEYS: Record<Detail, string> = {
  names: "showNames",
  temps: "showTemps",
  power: "showPower",
  clock: "showClock",
  hotspot: "showHotspot",
  fans: "showFans",
  memClock: "showMemClock",
  powerLimit: "showPowerLimit",
  memory: "showMemory",
  pageFile: "showPageFile",
  diskTemp: "showDiskTemp",
  diskIo: "showDiskIo",
  diskLife: "showDiskLife",
};

const LABEL_KEYS: Partial<Record<Section, string>> = { cpu: "cpuLabel", gpu: "gpuLabel", ram: "ramLabel", disk: "diskLabel", net: "netLabel" };
const COLOR_KEYS: Partial<Record<Section, string>> = { cpu: "cpuColor", gpu: "gpuColor", ram: "ramColor", disk: "diskColor", vram: "vramColor", net: "netColor" };
const SECTIONS: readonly Section[] = ["cpu", "gpu", "ram", "vram", "disk", "net"];

/** The details, graphs, thresholds, units, labels and colours (a new zone shows every detail and its graphs). */
const DETAIL_SETTINGS: ModuleSetting[] = [
  { key: "showNames", label: "Hardware names", type: "boolean", default: true, group: "Devices" },
  { key: "showTemps", label: "Temperatures", type: "boolean", default: true, group: "Devices" },
  { key: "showPower", label: "Power draw", type: "boolean", default: true, group: "Devices" },
  { key: "showClock", label: "GPU clock", type: "boolean", default: true, group: "GPU" },
  { key: "showHotspot", label: "GPU hotspot (memory junction)", type: "boolean", default: true, group: "GPU" },
  { key: "showFans", label: "GPU fans", type: "boolean", default: true, group: "GPU" },
  { key: "showMemClock", label: "GPU memory clock", type: "boolean", default: true, group: "GPU" },
  { key: "showPowerLimit", label: "GPU power (% of limit)", type: "boolean", default: true, group: "GPU" },
  { key: "showMemory", label: "Memory used / total", type: "boolean", default: true, group: "Memory" },
  { key: "showPageFile", label: "RAM page file", type: "boolean", default: true, group: "Memory" },
  { key: "showDiskTemp", label: "Drive temperature", type: "boolean", default: true, group: "Drives" },
  { key: "showDiskIo", label: "Drive read / write rate", type: "boolean", default: true, group: "Drives" },
  { key: "showDiskLife", label: "Drive life remaining", type: "boolean", default: true, group: "Drives" },
  {
    key: "diskFilter",
    label: "Drives to show (names, comma-separated; empty = all)",
    type: "text",
    default: "",
    group: "Drives",
  },
  { key: "sparkline", label: "Trend sparklines", type: "boolean", default: true, group: "Trends", tab: "behaviour" },
  {
    key: "historyLength",
    label: "Sparkline length (samples)",
    type: "number",
    default: 60,
    min: 12,
    max: 120,
    step: 12,
    group: "Trends",
    tab: "behaviour",
  },
  {
    key: "tempWarn",
    label: "Temperature warning (°C)",
    type: "number",
    default: 80,
    min: 50,
    max: 100,
    step: 5,
    group: GROUP_THRESHOLDS,
  },
  {
    key: "tempCrit",
    label: "Temperature critical (°C)",
    type: "number",
    default: 90,
    min: 50,
    max: 110,
    step: 5,
    group: GROUP_THRESHOLDS,
  },
  {
    key: "vramWarn",
    label: "VRAM / drive full warning (%)",
    type: "number",
    default: 90,
    min: 10,
    max: 100,
    step: 5,
    group: GROUP_THRESHOLDS,
  },
  {
    key: "tempUnit",
    label: "Temperature unit",
    type: "select",
    default: "c",
    options: [
      { value: "c", label: "Celsius (°C)" },
      { value: "f", label: "Fahrenheit (°F)" },
    ],
    group: GROUP_UNITS,
  },
  {
    key: "decimals",
    label: "Decimals",
    type: "select",
    default: "0",
    options: [
      { value: "0", label: "None" },
      { value: "1", label: "One" },
    ],
    group: GROUP_UNITS,
  },
  { key: "cpuLabel", label: "CPU label", type: "text", default: "", group: GROUP_UNITS },
  { key: "gpuLabel", label: "GPU label", type: "text", default: "", group: GROUP_UNITS },
  { key: "ramLabel", label: "RAM label", type: "text", default: "", group: GROUP_UNITS },
  { key: "diskLabel", label: "Disks label", type: "text", default: "", group: GROUP_UNITS },
  { key: "cpuColor", label: "CPU color", type: "color", default: "", group: "Device colors" },
  { key: "gpuColor", label: "GPU color", type: "color", default: "", group: "Device colors" },
  { key: "ramColor", label: "RAM color", type: "color", default: "", group: "Device colors" },
  { key: "diskColor", label: "Disks color", type: "color", default: "", group: "Device colors" },
  { key: "vramColor", label: "VRAM color", type: "color", default: "", group: "Device colors" },
];

const GROUP_OVERVIEW = "System Overview";

/** Sections, core view, ring, detail level, load thresholds, NET label and colour. */
const OVERVIEW_ONLY: ModuleSetting[] = [
  enumSetting("sections", "Sections", "cpu,gpu,ram", SECTIONS.map((v) => ({ value: v, label: v === "disk" ? "Disks" : v === "net" ? "Network" : v.toUpperCase() })), { multiple: true, group: GROUP_OVERVIEW }),
  enumSetting("details", "Detail level", "auto", [{ value: "auto", label: "Auto" }, { value: "min", label: "Minimal" }, { value: "full", label: "Full" }], { group: GROUP_OVERVIEW }),
  enumSetting("ring", "Load rings", "ring", [{ value: "ring", label: "Rings" }, { value: "none", label: "None" }], { group: GROUP_OVERVIEW }),
  enumSetting("coreView", "CPU threads view", "heatmap", [{ value: "heatmap", label: "Heatmap" }, { value: "bars", label: "Bars" }, { value: "off", label: "Off" }], { group: GROUP_OVERVIEW }),
  numberSetting("loadWarn", "Load warning (%)", 80, { min: 10, max: 100, step: 5, group: GROUP_THRESHOLDS }),
  numberSetting("loadCrit", "Load critical (%)", 92, { min: 10, max: 100, step: 5, group: GROUP_THRESHOLDS }),
  textSetting("netLabel", "Network label", "", { group: GROUP_UNITS }),
  boolSetting("unifiedColor", "Accent for every section", false, { group: "Device colors", tab: "style", advanced: true }),
  enumSetting("heatRamp", "Thread heat ramp", "accent", [{ value: "accent", label: "Accent" }, { value: "thermal", label: "Thermal" }], { group: "Device colors", tab: "style", advanced: true }),
  colorSetting("netColor", "Network color", { group: "Device colors" }),
];

/** The sections a setting draws in: it is offered only while one of them is shown (unlisted = always). */
const SECTION_OF: Record<string, readonly Section[]> = {
  ...Object.fromEntries(["cpuLabel", "cpuColor", "coreView"].map((k) => [k, ["cpu"]])),
  ...Object.fromEntries(["showClock", "showHotspot", "showFans", "showMemClock", "showPowerLimit", "gpuLabel", "gpuColor"].map((k) => [k, ["gpu"]])),
  ...Object.fromEntries(["showMemory", "showPageFile", "ramLabel", "ramColor"].map((k) => [k, ["ram"]])),
  ...Object.fromEntries(["showDiskTemp", "showDiskIo", "showDiskLife", "diskFilter", "diskLabel", "diskColor"].map((k) => [k, ["disk"]])),
  ...Object.fromEntries(["netLabel", "netColor"].map((k) => [k, ["net"]])),
  vramColor: ["vram"],
  vramWarn: ["vram", "disk"],
};
/** Further conditions: the thread ramp colours the heatmap, the length sizes the sparklines. */
const ALSO: Record<string, (v: ModuleSettings) => boolean> = {
  heatRamp: (v) => splitKeys(v.sections ?? "cpu,gpu,ram").includes("cpu") && (v.coreView ?? "heatmap") === "heatmap",
  historyLength: (v) => v.sparkline !== false,
};
const offered = (d: ModuleSetting): ModuleSetting => {
  const secs = SECTION_OF[d.key];
  const also = ALSO[d.key];
  if (!secs && !also) return d;
  return { ...d, visibleIf: (v) => (!secs || secs.some((x) => splitKeys(v.sections ?? "cpu,gpu,ram").includes(x))) && (!also || also(v)) };
};

/** The SystemOverview zone's settings: the details, then its own; each offered only while it can show. */
export const SYSTEM_OVERVIEW_SETTINGS: ModuleSetting[] = [...DETAIL_SETTINGS, ...OVERVIEW_ONLY].map(offered);

const text = (v: unknown) => String(v ?? "").trim();
const has = (s: ModuleSettings, key: string) => s[key] !== undefined && s[key] !== "";

/** Stored keys → props; a key that is not stored leaves the template's default. */
export function systemOverviewProps(s: ModuleSettings): Partial<SystemOverviewProps> {
  const out: Partial<SystemOverviewProps> = {};
  // The sections and thread view defaults are the template's own, so they stay unset until changed.
  if (s.sections !== undefined && s.sections !== "cpu,gpu,ram") out.sections = splitKeys(s.sections).flatMap((k) => oneOf(k, SECTIONS) ?? []);
  if (has(s, "details")) out.details = oneOf(s.details, ["auto", "min", "full"]);
  if (has(s, "ring")) out.ring = s.ring === "none" ? "none" : "ring";
  if (has(s, "heatRamp")) out.heatRamp = String(s.heatRamp);
  if (s.unifiedColor !== undefined) out.unifiedColor = Boolean(s.unifiedColor);
  if (has(s, "coreView") && s.coreView !== "heatmap") out.coreView = oneOf(s.coreView, ["heatmap", "bars", "off"]);
  const show = Object.fromEntries((Object.entries(DETAIL_KEYS) as [Detail, string][]).filter(([, key]) => s[key] !== undefined).map(([d, key]) => [d, Boolean(s[key])]));
  if (Object.keys(show).length) out.show = show;
  if (s.sparkline !== undefined) out.sparkline = Boolean(s.sparkline);
  if (has(s, "historyLength")) out.historyLength = Math.max(12, Math.round(Number(s.historyLength) || 48));
  if (has(s, "loadWarn")) out.warn = Number(s.loadWarn) || 80;
  if (has(s, "loadCrit")) out.crit = Number(s.loadCrit) || 95;
  if (has(s, "tempWarn")) out.tempWarn = Number(s.tempWarn) || 80;
  if (has(s, "tempCrit")) out.tempCrit = Number(s.tempCrit) || 90;
  if (has(s, "vramWarn")) out.vramWarn = Number(s.vramWarn) || 90;
  if (has(s, "tempUnit")) out.tempUnit = s.tempUnit === "f" ? "f" : "c";
  if (has(s, "decimals")) out.decimals = Number(s.decimals) === 1 ? 1 : 0;
  if (has(s, "diskFilter")) out.diskFilter = String(s.diskFilter);
  const labels = Object.fromEntries((Object.entries(LABEL_KEYS) as [Section, string][]).filter(([, key]) => text(s[key])).map(([k, key]) => [k, text(s[key])]));
  if (Object.keys(labels).length) out.labels = labels;
  const colors = Object.fromEntries((Object.entries(COLOR_KEYS) as [Section, string][]).filter(([, key]) => text(s[key])).map(([k, key]) => [k, text(s[key])]));
  if (Object.keys(colors).length) out.colors = colors;
  return out;
}
