// Inspector settings of the group A templates: every widget-specific prop of the spec as a setting,
// with the adapters back to props (docs/redesign/phase9/brief-9.5-inspector.md). SystemOverview's are in system-overview.ts.
import { decimalsOf, deviceOf, levelOf, tempUnitOf, thresholdsOf } from "@/modules/setting-readers";
import type { ModuleSetting, ModuleSettings } from "@/modules/types";
import { boolOf, boolSetting, colorSetting, colorsOf, deviceSetting, enumSetting, formatSetting, numberOf, numberSetting, oneOf, rateUnitOf, rateUnitSetting, sensorSetting, splitKeys, stringOf, textSetting, thresholdSetting, viewSetting, type ColorEntry } from "./settings-kit";
import type { CoreHeatmapProps } from "../CoreHeatmap";
import type { CpuMonitorProps } from "../CpuMonitor";
import type { FansProps } from "../Fans";
import type { GpuMonitorProps } from "../GpuMonitor";
import type { GpuRingsProps } from "../GpuRings";
import type { KpiTilesProps } from "../KpiTiles";
import type { MemoryUsageProps } from "../MemoryUsage";
import type { MenuBarProps } from "../MenuBar";
import type { PowerDrawProps } from "../PowerDraw";
import type { ProcessListProps } from "../ProcessList";
import type { ServiceHealthProps } from "../ServiceHealth";
import { meta as serviceHealthMeta } from "../meta/ServiceHealth";
import type { StatusTrackerProps, Track } from "../StatusTracker";
import type { SystemStatusProps } from "../SystemStatus";
import type { ThermalsProps } from "../Thermals";
import type { UptimeProps } from "../Uptime";
import type { VitalsProps } from "../Vitals";

const opts = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));
/** A stored comma-separated pick as its valid items; undefined while unset (the template's own list). */
const listPick = <T extends string>(v: unknown, allowed: readonly T[]): T[] | undefined => (v === undefined ? undefined : splitKeys(v).flatMap((k) => oneOf(k, allowed) ?? []));

/* ───────── MenuBar ───────── */
const MENU_ITEMS = ["cpu", "gpu", "temp", "mem", "down", "up", "nvme"] as const;
const MENU_LABELS: [string, string][] = [["cpu", "CPU"], ["gpu", "GPU"], ["temp", "Temperature"], ["mem", "Memory"], ["down", "Download"], ["up", "Upload"], ["nvme", "NVMe"]];
/** Download or Upload is in the bar: the network settings apply. */
const showsNet = (v: ModuleSettings): boolean => splitKeys(v.items ?? MENU_ITEMS.join(",")).some((k) => k === "down" || k === "up");
export const MENUBAR_SETTINGS: ModuleSetting[] = [
  enumSetting("items", "Items", MENU_ITEMS.join(","), opts(...MENU_LABELS), { multiple: true, group: "Items" }),
  enumSetting("active", "Active item", "", opts(["", "None"], ...MENU_LABELS), { group: "Items", hint: "Shown selected, with its detail when the widget is tall enough: for screens nobody clicks" }),
  enumSetting("stacked", "Label placement", "auto", opts(["auto", "Auto"], ["stacked", "Stacked"], ["inline", "Inline"]), { group: "Items" }),
  deviceSetting("Network adapter", "adapter", { group: "Network adapter", visibleIf: showsNet }),
  boolSetting("dropdown", "Detail dropdown on click", true, { group: "Interaction", tab: "behaviour" }),
  rateUnitSetting({ visibleIf: showsNet }),
];
export const menuBarProps = (s: ModuleSettings): Partial<MenuBarProps> => ({
  items: listPick(s.items, MENU_ITEMS),
  active: oneOf(s.active, MENU_ITEMS),
  stacked: s.stacked === "stacked" ? true : s.stacked === "inline" ? false : undefined,
  dropdown: boolOf(s.dropdown),
  adapter: deviceOf(s, "adapter"),
  rateUnit: rateUnitOf(s.rateUnit),
});

/* ───────── KpiTiles ───────── */
const KPI_METRICS = ["cpu", "gpu", "ram", "net", "vram", "power"] as const;
export const KPITILES_SETTINGS: ModuleSetting[] = [
  enumSetting("metrics", "Tiles", "cpu,gpu,ram,net", opts(["cpu", "CPU"], ["gpu", "GPU"], ["ram", "Memory"], ["net", "Network"], ["vram", "VRAM"], ["power", "Power"]), { multiple: true, group: "Tiles" }),
  numberSetting("lookback", "Change over (readings)", 10, { min: 2, max: 60, step: 1, group: "History", tab: "behaviour" }),
];
export const kpiTilesProps = (s: ModuleSettings): Partial<KpiTilesProps> => ({ metrics: listPick(s.metrics, KPI_METRICS), lookback: numberOf(s.lookback) });

/* ───────── StatusTracker: five track slots ───────── */
interface Slot {
  n: number;
  label: string;
  kind: Track["kind"];
  /** Status slots: the value that means up (threshold slots follow the Load threshold). */
  up?: string;
}
const SLOTS: Slot[] = [
  { n: 1, label: "Hottest thread", kind: "threshold" },
  { n: 2, label: "GPU load", kind: "threshold" },
  { n: 3, label: "Memory", kind: "threshold" },
  { n: 4, label: "Ethernet", kind: "status", up: "Up" },
  { n: 5, label: "Data API", kind: "status", up: "running" },
];
/** A track's own level (`track.N.warn` / `track.N.crit`, config v7), a More row of Thresholds; blank = the theme's Load threshold. */
const trackLevel = (t: Slot, level: "warn" | "crit"): ModuleSetting =>
  textSetting(`track.${t.n}.${level}`, `${t.label}: ${level === "warn" ? "warning" : "critical"}`, "", { section: "thresholds", more: true, hint: "Blank = the Load threshold; off = never" });
export const STATUSTRACKER_SETTINGS: ModuleSetting[] = [
  ...SLOTS.map((t) => textSetting(`track${t.n}Label`, `Track ${t.n} label`, t.label, { group: "Tracks" })),
  ...SLOTS.filter((t) => t.kind === "status").map((t) => textSetting(`track${t.n}Up`, `Track ${t.n}: value that means up`, t.up, { group: "Tracks" })),
  ...SLOTS.map((t) => sensorSetting(`track${t.n}Key`, `Track ${t.n} sensor (empty = the default)`, { group: "Sensors" })),
  numberSetting("samples", "History length (samples)", 60, { min: 10, max: 240, step: 10, group: "History", tab: "behaviour" }),
  thresholdSetting("load"),
  ...SLOTS.filter((t) => t.kind === "threshold").flatMap((t) => [trackLevel(t, "warn"), trackLevel(t, "crit")]),
];
/** A track's level: its own (`track.N.*`, else the old `trackN*`), `off` = never, else the Load threshold. */
const trackLevelOf = (s: ModuleSettings, n: number, level: "warn" | "crit", load: number | undefined): number | undefined => {
  const own = levelOf(s[`track.${n}.${level}`] || s[`track${n}${level === "warn" ? "Warn" : "Crit"}`]);
  return own === "off" ? Number.POSITIVE_INFINITY : (own ?? load);
};
export const statusTrackerProps = (s: ModuleSettings): Partial<StatusTrackerProps> => {
  const load = thresholdsOf(s, "load");
  return {
  samples: numberOf(s.samples),
  tracks: SLOTS.map((t) => ({
    label: stringOf(s[`track${t.n}Label`]) ?? t.label,
    // An unset key leaves the template's detected default for this slot (StatusTracker fills it by position).
    key: stringOf(s[`track${t.n}Key`]),
    kind: t.kind,
    ...(t.kind === "threshold" ? { warn: trackLevelOf(s, t.n, "warn", load.warn), crit: trackLevelOf(s, t.n, "crit", load.crit) } : {}),
    up: stringOf(s[`track${t.n}Up`]) ?? t.up,
  })),
  };
};

/* ───────── SystemStatus / MemoryUsage / PowerDraw / Uptime / Fans / ServiceHealth / ProcessList ───────── */
export const SYSTEMSTATUS_SETTINGS: ModuleSetting[] = [thresholdSetting("load")];
export const systemStatusProps = (s: ModuleSettings): Partial<SystemStatusProps> => thresholdsOf(s, "load", ["warn", "crit"]);

export const MEMORYUSAGE_SETTINGS: ModuleSetting[] = [thresholdSetting("load")];
export const memoryUsageProps = (s: ModuleSettings): Partial<MemoryUsageProps> => thresholdsOf(s, "load", ["warn", "crit"]);

export const POWERDRAW_SETTINGS: ModuleSetting[] = [numberSetting("budget", "Power budget (W)", 750, { min: 100, max: 2000, step: 50, group: "Budget" })];
export const powerDrawProps = (s: ModuleSettings): Partial<PowerDrawProps> => ({ budget: numberOf(s.budget) });

export const UPTIME_SETTINGS: ModuleSetting[] = [boolSetting("showSeconds", "Seconds", true, { group: "Time" })];
export const uptimeProps = (s: ModuleSettings): Partial<UptimeProps> => ({ showSeconds: boolOf(s.showSeconds) });

export const FANS_SETTINGS: ModuleSetting[] = [
  boolSetting("spin", "Spin the fan icons", true, { group: "Dynamics", tab: "behaviour" }),
  numberSetting("maxRpm", "Full-scale speed (RPM)", 3000, { min: 500, max: 6000, step: 100, group: "Bar scale", tab: "data" }),
];
export const fansProps = (s: ModuleSettings): Partial<FansProps> => ({ maxRpm: numberOf(s.maxRpm), spin: boolOf(s.spin) });

/** The template's `layout` is stored as `healthLayout` (the standard `layout` keeps its meaning). */
export const SERVICEHEALTH_SETTINGS: ModuleSetting[] = [viewSetting(serviceHealthMeta, { label: "Services as", group: "Services" })];
export const serviceHealthProps = (s: ModuleSettings): Partial<ServiceHealthProps> => ({ layout: oneOf(s.healthLayout, ["list", "pills"]) });

export const PROCESSLIST_SETTINGS: ModuleSetting[] = [
  numberSetting("rows", "Rows (0 = fit the height)", 0, { min: 0, max: 30, step: 1, group: "Rows" }),
  enumSetting("sort", "Sort by", "cpu", opts(["cpu", "CPU"], ["utility", "CPU utility"], ["memory", "Memory"]), { group: "Sorting", tab: "behaviour" }),
];
export const processListProps = (s: ModuleSettings): Partial<ProcessListProps> => ({ sort: oneOf(s.sort, ["cpu", "utility", "memory"]), rows: numberOf(s.rows) || undefined });

/* ───────── Vitals ───────── */
const VITALS_METRICS = ["cpu", "gpu", "ram", "net", "vram", "fps"] as const;
export const VITALS_SETTINGS: ModuleSetting[] = [
  enumSetting("metrics", "Metrics", "cpu,gpu,ram,net", opts(["cpu", "CPU"], ["gpu", "GPU"], ["ram", "RAM"], ["net", "Network"], ["vram", "VRAM"], ["fps", "FPS"]), { multiple: true, group: "Metrics" }),
];
export const vitalsProps = (s: ModuleSettings): Partial<VitalsProps> => ({ metrics: listPick(s.metrics, VITALS_METRICS) });

/* ───────── CpuMonitor / CoreHeatmap ───────── */
export const CPUMONITOR_SETTINGS: ModuleSetting[] = [
  enumSetting("coreView", "Threads", "bars", opts(["bars", "Bars"], ["heatmap", "Heatmap"], ["off", "Off"]), { group: "Threads" }),
  enumSetting("coreMetric", "Metric", "load", opts(["load", "Load"], ["clock", "Clock"]), { group: "Threads", visibleIf: (v) => v.coreView !== "off" }),
  enumSetting("heatRamp", "Heatmap ramp", "accent", opts(["accent", "Accent"], ["thermal", "Thermal"]), { tab: "style", perWidget: true, visibleIf: (v) => v.coreView === "heatmap" }),
  deviceSetting("Processor", "cpu", { group: "Processor" }),
  thresholdSetting("load"),
  formatSetting("tempUnit"),
  formatSetting("decimals"),
];
export const cpuMonitorProps = (s: ModuleSettings): Partial<CpuMonitorProps> => ({
  cpu: deviceOf(s, "cpu"),
  coreView: oneOf(s.coreView, ["bars", "heatmap", "off"]),
  coreMetric: oneOf(s.coreMetric, ["load", "clock"]),
  heatRamp: oneOf(s.heatRamp, ["accent", "thermal"]),
  ...thresholdsOf(s, "load", ["warn", "crit"]),
  tempUnit: tempUnitOf(s),
  decimals: decimalsOf(s),
});

const RAMPS = ["accent", "thermal", "viridis", "magma", "ice", "synth", "mono"] as const;
export const COREHEATMAP_SETTINGS: ModuleSetting[] = [
  enumSetting("shape", "Shape", "grid", opts(["grid", "Grid"], ["hex", "Hexagons"], ["radial", "Radial"], ["waterfall", "Waterfall"]), { group: "Cells" }),
  enumSetting("metric", "Metric", "load", opts(["load", "Load"], ["clock", "Clock"], ["power", "Power"], ["vid", "Voltage (VID)"]), { group: "Cells" }),
  enumSetting("showValues", "Values in cells", "auto", opts(["auto", "Auto"], ["on", "Show"], ["off", "Hide"]), { group: "Cells", visibleIf: (v) => v.shape === "grid" || v.shape === "hex" }),
  enumSetting("ramp", "Color ramp", "accent", RAMPS.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })), { tab: "style", more: true, perWidget: true }),
  deviceSetting("Processor", "cpu", { group: "Processor" }),
  numberSetting("history", "Waterfall columns", 60, { min: 10, max: 240, step: 10, group: "History", tab: "behaviour", visibleIf: (v) => v.shape === "waterfall" }),
  numberSetting("hotOutline", "Outline cells above (%)", 80, { min: 0, max: 100, step: 5, section: "thresholds", hint: "Share of the metric's highest value (load: percent)", visibleIf: (v) => v.shape === "grid" }),
];
export const coreHeatmapProps = (s: ModuleSettings): Partial<CoreHeatmapProps> => ({
  cpu: deviceOf(s, "cpu"),
  shape: oneOf(s.shape, ["grid", "hex", "radial", "waterfall"]),
  metric: oneOf(s.metric, ["load", "clock", "power", "vid"]),
  ramp: oneOf(s.ramp, RAMPS),
  showValues: s.showValues === "on" ? true : s.showValues === "off" ? false : undefined,
  history: numberOf(s.history),
  hotOutline: numberOf(s.hotOutline),
});

/* ───────── GpuRings / GpuMonitor ───────── */
const RING_COLORS: ColorEntry[] = [
  { entry: "outer", key: "outerColor", label: "Outer ring" },
  { entry: "inner", key: "innerColor", label: "Inner ring" },
];
/** The rings follow the theme's Series 1 and 2 ("" = the widget's own colours). */
const RING_ROLES = { outerColor: "s1", innerColor: "s2" } as const;
export const GPURINGS_SETTINGS: ModuleSetting[] = [
  enumSetting("outer", "Outer ring", "vram", opts(["vram", "VRAM"], ["load", "Load"], ["power", "Power"]), { group: "Rings" }),
  enumSetting("inner", "Inner ring", "load", opts(["load", "Load"], ["vram", "VRAM"], ["fan", "Fan"]), { group: "Rings" }),
  ...RING_COLORS.map((e) => colorSetting(e.key, e.label, { role: RING_ROLES[e.key as keyof typeof RING_ROLES], more: false })),
  deviceSetting("Graphics card", "gpu", { group: "Graphics card" }),
];
export const gpuRingsProps = (s: ModuleSettings): Partial<GpuRingsProps> => ({
  gpu: deviceOf(s, "gpu"),
  outer: oneOf(s.outer, ["vram", "load", "power"]),
  inner: oneOf(s.inner, ["load", "vram", "fan"]),
  colors: colorsOf(s, RING_COLORS),
});

export const GPUMONITOR_SETTINGS: ModuleSetting[] = [deviceSetting("Graphics card", "gpu", { group: "Graphics card" }), thresholdSetting("temp")];
export const gpuMonitorProps = (s: ModuleSettings): Partial<GpuMonitorProps> => {
  const { warn, crit } = thresholdsOf(s, "temp", ["warnTemp", "critTemp"]);
  return { gpu: deviceOf(s, "gpu"), warnTemp: warn, critTemp: crit };
};

/* ───────── Thermals (after the view / discover / fan settings it shares with Hardware) ───────── */
export const THERMALS_EXTRA_SETTINGS: ModuleSetting[] = [
  enumSetting("sortBy", "Order", "hottest", opts(["hottest", "Hottest first"], ["fixed", "Fixed"]), { group: "Sorting", tab: "behaviour" }),
  numberSetting("max", "Bar scale (°C)", 100, { min: 40, max: 150, step: 5, group: "Bar scale", tab: "data" }),
  // Replaces "0 = per sensor" (config v7, owner decision Q3): on, each sensor keeps its own limits.
  boolSetting("sensorLimits", "Use sensor limits", true, { section: "thresholds", hint: "Each sensor's own warning and critical levels; off: the Temperature threshold for every sensor" }),
  thresholdSetting("temp", { visibleIf: (v) => v.sensorLimits === false }),
  formatSetting("tempUnit"),
];
/** The temperature levels: none while each sensor keeps its own limits, else the threshold. */
const thermalLevels = (s: ModuleSettings): { warn?: number; crit?: number } => (s.sensorLimits === false ? thresholdsOf(s, "temp") : {});
export const thermalsProps = (s: ModuleSettings): Partial<ThermalsProps> => ({
  sortBy: oneOf(s.sortBy, ["hottest", "fixed"]),
  max: numberOf(s.max),
  ...thermalLevels(s),
  tempUnit: tempUnitOf(s),
  view: oneOf(s.view, ["bars", "gauges"]),
  discover: boolOf(s.discover),
  showFans: boolOf(s.showFans),
  fanColor: stringOf(s.fanColor),
});
