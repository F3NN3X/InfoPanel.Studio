// SystemOverview's stored settings (the detail switches keep the old System widget's keys) and the
// mapping to template props.
import { decimalsOf, tempUnitOf, thresholdsOf } from "@/modules/setting-readers";
import type { ModuleSetting, ModuleSettings, PaletteRole } from "@/modules/types";
import type { Detail, Section, SystemOverviewProps } from "../SystemOverview";
import { meta } from "../meta/SystemOverview";
import { boolSetting, colorSetting, enumSetting, formatSetting, numberOf, numberSetting, oneOf, splitKeys, textSetting, thresholdSetting, viewOnly, viewSetting } from "./settings-kit";

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

const choices = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));
/** A section's label override (More of its section; "" = the section's own name). */
const labelSetting = (key: string, group: string, name: string): ModuleSetting => textSetting(key, "Label", "", { group, more: true, hint: `Empty = ${name}` });
/** A section's colour (Style › Widget colors): its theme series colour ("" = the widget's palette). */
const sectionColor = (key: string, label: string, role: PaletteRole): ModuleSetting => colorSetting(key, label, { role, more: false });

/**
 * The SystemOverview zone's rows (SPEC §6.3): which sections show, then one Show section per device
 * section (its label behind More), the device colours (theme series 1–6) in Widget colors, the drive
 * filter in Data, the trends in Behaviour. The detail switches keep the old System widget's keys.
 */
/** Settings of the Graphs and Gauges views only, and of the Panel only (its details, rings, heatmap, sparklines). */
const graphed = viewOnly(meta, "graphs", "gauges");
const panelOnly = viewOnly(meta, "panel");

const OVERVIEW_SETTINGS: ModuleSetting[] = [
  viewSetting(meta, { group: "Sections" }),
  enumSetting("sections", "Show", "cpu,gpu,ram", SECTIONS.map((v) => ({ value: v, label: v === "disk" ? "Disks" : v === "net" ? "Network" : v.toUpperCase() })), { multiple: true, group: "Sections", hint: "Order follows the click order." }),
  panelOnly(enumSetting("details", "Detail level", "auto", choices([["auto", "Auto"], ["min", "Minimal"], ["full", "Full"]]), { group: "Sections" })),
  panelOnly(enumSetting("ring", "Load rings", "ring", choices([["ring", "Rings"], ["none", "None"]]), { group: "Sections" })),
  panelOnly(boolSetting("showNames", "Hardware names", true, { group: "Sections" })),
  panelOnly(boolSetting("showTemps", "Temperatures", true, { group: "Sections" })),
  panelOnly(boolSetting("showPower", "Power draw", true, { group: "Sections" })),
  panelOnly(enumSetting("coreView", "Threads", "heatmap", choices([["heatmap", "Heatmap"], ["bars", "Bars"], ["off", "Off"]]), { group: "CPU" })),
  labelSetting("cpuLabel", "CPU", "CPU"),
  panelOnly(boolSetting("showClock", "Core clock", true, { group: "GPU" })),
  panelOnly(boolSetting("showHotspot", "Hotspot", true, { group: "GPU", hint: "The memory junction temperature" })),
  panelOnly(boolSetting("showFans", "Fans", true, { group: "GPU" })),
  panelOnly(boolSetting("showMemClock", "Memory clock", true, { group: "GPU", more: true })),
  panelOnly(boolSetting("showPowerLimit", "Power (% of limit)", true, { group: "GPU", more: true })),
  labelSetting("gpuLabel", "GPU", "GPU"),
  panelOnly(boolSetting("showMemory", "Used / total", true, { group: "Memory" })),
  panelOnly(boolSetting("showPageFile", "Page file", true, { group: "Memory" })),
  labelSetting("ramLabel", "Memory", "RAM"),
  panelOnly(boolSetting("showDiskTemp", "Temperature", true, { group: "Drives" })),
  panelOnly(boolSetting("showDiskIo", "Read / write rate", true, { group: "Drives" })),
  panelOnly(boolSetting("showDiskLife", "Life remaining", true, { group: "Drives" })),
  labelSetting("diskLabel", "Drives", "Disks"),
  // Not in the concept: the Network section draws nothing else to set, but its label is still read.
  labelSetting("netLabel", "Network", "NET"),
  boolSetting("unifiedColor", "One accent for every section", false, { tab: "style", perWidget: true }),
  sectionColor("cpuColor", "CPU", "s1"),
  sectionColor("gpuColor", "GPU", "s2"),
  sectionColor("ramColor", "RAM", "s3"),
  sectionColor("vramColor", "VRAM", "s4"),
  sectionColor("diskColor", "Disks", "s5"),
  sectionColor("netColor", "Network", "s6"),
  panelOnly(enumSetting("heatRamp", "Thread heat ramp", "accent", choices([["accent", "Accent"], ["thermal", "Thermal"]]), { tab: "style", more: true, perWidget: true })),
  textSetting("diskFilter", "Drives to show", "", { group: "Drives", tab: "data", hint: "Names, comma-separated; empty = all" }),
  graphed({ key: "diskPick", label: "Drive", type: "select", default: "", optionsFrom: "disk", group: "Drives", tab: "data" }),
  graphed(enumSetting("diskValue", "Drive shows", "activity", choices([["activity", "Activity"], ["used", "Used"], ["rate", "Read + write"]]), { group: "Drives", tab: "data" })),
  graphed({ key: "netAdapter", label: "Adapter", type: "select", default: "", optionsFrom: "adapter", group: "Network", tab: "data" }),
  graphed(enumSetting("netDirection", "Direction", "down", choices([["down", "Down"], ["up", "Up"], ["both", "Both"]]), { group: "Network", tab: "data" })),
  graphed(numberSetting("netMax", "Top speed (Mbps)", 0, { min: 0, step: 50, group: "Network", tab: "data", hint: "0 = the recent peak" })),
  panelOnly(boolSetting("sparkline", "Trend sparklines", true, { group: "Trends", tab: "behaviour" })),
  numberSetting("historyLength", "Length (samples)", 60, { min: 12, max: 120, step: 12, group: "Trends", tab: "behaviour" }),
  thresholdSetting("load"),
  thresholdSetting("temp"),
  thresholdSetting("full", { hint: "VRAM and drive fullness" }),
  panelOnly(formatSetting("tempUnit")),
  formatSetting("decimals", { options: ["auto", "0", "1"].map((value) => ({ value, label: value === "auto" ? "Auto" : value })), hint: "Auto: none" }),
];

/** The sections a setting draws in: it is offered only while one of them is shown (unlisted = always). */
const SECTION_OF: Record<string, readonly Section[]> = {
  ...Object.fromEntries(["cpuLabel", "cpuColor", "coreView"].map((k) => [k, ["cpu"]])),
  ...Object.fromEntries(["showClock", "showHotspot", "showFans", "showMemClock", "showPowerLimit", "gpuLabel", "gpuColor"].map((k) => [k, ["gpu"]])),
  ...Object.fromEntries(["showMemory", "showPageFile", "ramLabel", "ramColor"].map((k) => [k, ["ram"]])),
  ...Object.fromEntries(["showDiskTemp", "showDiskIo", "showDiskLife", "diskFilter", "diskLabel", "diskColor"].map((k) => [k, ["disk"]])),
  ...Object.fromEntries(["netLabel", "netColor"].map((k) => [k, ["net"]])),
  vramColor: ["vram"],
  "warn.full": ["vram", "disk"],
};
/** Further conditions: the thread ramp colours the heatmap, the length sizes the sparklines, one accent replaces the section colours. */
const ALSO: Record<string, (v: ModuleSettings) => boolean> = {
  heatRamp: (v) => splitKeys(v.sections ?? "cpu,gpu,ram").includes("cpu") && (v.coreView ?? "heatmap") === "heatmap",
  historyLength: (v) => v.sparkline !== false,
  ...Object.fromEntries((Object.values(COLOR_KEYS) as string[]).map((k) => [k, (v: ModuleSettings) => !v.unifiedColor])),
};
const offered = (d: ModuleSetting): ModuleSetting => {
  const secs = SECTION_OF[d.key];
  const also = ALSO[d.key];
  if (!secs && !also) return d;
  return { ...d, visibleIf: (v) => (d.visibleIf?.(v) ?? true) && (!secs || secs.some((x) => splitKeys(v.sections ?? "cpu,gpu,ram").includes(x))) && (!also || also(v)) };
};

/** The SystemOverview zone's settings, each offered only while it can show. */
export const SYSTEM_OVERVIEW_SETTINGS: ModuleSetting[] = OVERVIEW_SETTINGS.map(offered);

const text = (v: unknown) => String(v ?? "").trim();
const has = (s: ModuleSettings, key: string) => s[key] !== undefined && s[key] !== "";

/** Stored keys → props; a key that is not stored leaves the template's default. */
export function systemOverviewProps(s: ModuleSettings): Partial<SystemOverviewProps> {
  const out: Partial<SystemOverviewProps> = {};
  // The sections and thread view defaults are the template's own, so they stay unset until changed.
  if (s.sections !== undefined && s.sections !== "cpu,gpu,ram") out.sections = splitKeys(s.sections).flatMap((k) => oneOf(k, SECTIONS) ?? []);
  if (has(s, "view")) out.view = oneOf(s.view, ["panel", "graphs", "gauges"]);
  if (has(s, "details")) out.details = oneOf(s.details, ["auto", "min", "full"]);
  if (has(s, "ring")) out.ring = s.ring === "none" ? "none" : "ring";
  if (has(s, "heatRamp")) out.heatRamp = String(s.heatRamp);
  if (s.unifiedColor !== undefined) out.unifiedColor = Boolean(s.unifiedColor);
  if (has(s, "coreView") && s.coreView !== "heatmap") out.coreView = oneOf(s.coreView, ["heatmap", "bars", "off"]);
  const show = Object.fromEntries((Object.entries(DETAIL_KEYS) as [Detail, string][]).filter(([, key]) => s[key] !== undefined).map(([d, key]) => [d, Boolean(s[key])]));
  if (Object.keys(show).length) out.show = show;
  if (s.sparkline !== undefined) out.sparkline = Boolean(s.sparkline);
  if (has(s, "historyLength")) out.historyLength = Math.max(12, Math.round(Number(s.historyLength) || 48));
  const load = thresholdsOf(s, "load", ["loadWarn", "loadCrit"]);
  const temp = thresholdsOf(s, "temp", ["tempWarn", "tempCrit"]);
  const full = thresholdsOf(s, "full", ["vramWarn", "vramCrit"]);
  if (load.warn !== undefined) out.warn = load.warn;
  if (load.crit !== undefined) out.crit = load.crit;
  if (temp.warn !== undefined) out.tempWarn = temp.warn;
  if (temp.crit !== undefined) out.tempCrit = temp.crit;
  if (full.warn !== undefined) out.vramWarn = full.warn;
  if (full.crit !== undefined) out.vramCrit = full.crit;
  out.tempUnit = tempUnitOf(s);
  out.decimals = decimalsOf(s) === 1 ? 1 : 0;
  if (has(s, "diskFilter")) out.diskFilter = String(s.diskFilter);
  if (has(s, "diskPick")) out.diskPick = String(s.diskPick);
  if (has(s, "diskValue")) out.diskValue = oneOf(s.diskValue, ["activity", "used", "rate"]);
  if (has(s, "netAdapter")) out.netAdapter = String(s.netAdapter);
  if (has(s, "netDirection")) out.netDirection = oneOf(s.netDirection, ["down", "up", "both"]);
  if (numberOf(s.netMax) !== undefined) out.netMax = Math.max(0, numberOf(s.netMax)!);
  const labels = Object.fromEntries((Object.entries(LABEL_KEYS) as [Section, string][]).filter(([, key]) => text(s[key])).map(([k, key]) => [k, text(s[key])]));
  if (Object.keys(labels).length) out.labels = labels;
  const colors = Object.fromEntries((Object.entries(COLOR_KEYS) as [Section, string][]).filter(([, key]) => text(s[key])).map(([k, key]) => [k, text(s[key])]));
  if (Object.keys(colors).length) out.colors = colors;
  return out;
}
