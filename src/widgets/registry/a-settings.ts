// Inspector settings of the group A templates: every widget-specific prop of the spec as a setting,
// with the adapters back to props (docs/redesign/phase9/brief-9.5-inspector.md). SystemOverview's are in system-overview.ts.
import type { ModuleSetting, ModuleSettings } from "@/modules/types";
import { boolOf, boolSetting, colorSetting, colorsOf, deviceSetting, enumSetting, numberOf, numberSetting, oneOf, rateUnitOf, rateUnitSetting, sensorSetting, splitKeys, stringOf, textSetting, type ColorEntry } from "./settings-kit";
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
import type { StatusTrackerProps, Track } from "../StatusTracker";
import type { SystemStatusProps } from "../SystemStatus";
import type { ThermalsProps } from "../Thermals";
import type { UptimeProps } from "../Uptime";
import type { VitalsProps } from "../Vitals";

const THRESHOLDS = "Thresholds";
const opts = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));
const warnCrit = (warnKey: string, critKey: string, warn: number, crit: number, unit: string, max = 100, group = THRESHOLDS): ModuleSetting[] => [
  numberSetting(warnKey, `Warning (${unit})`, warn, { min: 0, max, step: 5, group }),
  numberSetting(critKey, `Critical (${unit})`, crit, { min: 0, max, step: 5, group }),
];
/** A stored comma-separated pick as its valid items; undefined while unset (the template's own list). */
const listPick = <T extends string>(v: unknown, allowed: readonly T[]): T[] | undefined => (v === undefined ? undefined : splitKeys(v).flatMap((k) => oneOf(k, allowed) ?? []));

/* ───────── MenuBar ───────── */
const MENU_ITEMS = ["cpu", "gpu", "temp", "mem", "down", "up", "nvme"] as const;
const MENU_LABELS: [string, string][] = [["cpu", "CPU"], ["gpu", "GPU"], ["temp", "Temperature"], ["mem", "Memory"], ["down", "Download"], ["up", "Upload"], ["nvme", "NVMe"]];
/** Download or Upload is in the bar: the network settings apply. */
const showsNet = (v: ModuleSettings): boolean => splitKeys(v.items ?? MENU_ITEMS.join(",")).some((k) => k === "down" || k === "up");
export const MENUBAR_SETTINGS: ModuleSetting[] = [
  enumSetting("items", "Items", MENU_ITEMS.join(","), opts(...MENU_LABELS), { multiple: true, group: "Menu bar" }),
  enumSetting("active", "Active item", "", opts(["", "None"], ...MENU_LABELS), { group: "Menu bar", hint: "Shown selected, with its detail when the zone is tall enough: for screens nobody clicks" }),
  enumSetting("stacked", "Label placement", "auto", opts(["auto", "Auto"], ["stacked", "Stacked"], ["inline", "Inline"]), { group: "Menu bar" }),
  boolSetting("dropdown", "Detail dropdown on click", true, { group: "Menu bar" }),
  deviceSetting("adapter", "Network adapter", "adapter", { group: "Menu bar", hint: "Auto = the busiest adapter", visibleIf: showsNet }),
  rateUnitSetting("Menu bar", { visibleIf: showsNet }),
];
export const menuBarProps = (s: ModuleSettings): Partial<MenuBarProps> => ({
  items: listPick(s.items, MENU_ITEMS),
  active: oneOf(s.active, MENU_ITEMS),
  stacked: s.stacked === "stacked" ? true : s.stacked === "inline" ? false : undefined,
  dropdown: boolOf(s.dropdown),
  adapter: stringOf(s.adapter) || undefined,
  rateUnit: rateUnitOf(s.rateUnit),
});

/* ───────── KpiTiles ───────── */
const KPI_METRICS = ["cpu", "gpu", "ram", "net", "vram", "power"] as const;
export const KPITILES_SETTINGS: ModuleSetting[] = [
  enumSetting("metrics", "Tiles", "cpu,gpu,ram,net", opts(["cpu", "CPU"], ["gpu", "GPU"], ["ram", "Memory"], ["net", "Network"], ["vram", "VRAM"], ["power", "Power"]), { multiple: true, group: "KPI tiles" }),
  numberSetting("lookback", "Change over (readings)", 10, { min: 2, max: 60, step: 1, group: "KPI tiles" }),
];
export const kpiTilesProps = (s: ModuleSettings): Partial<KpiTilesProps> => ({ metrics: listPick(s.metrics, KPI_METRICS), lookback: numberOf(s.lookback) });

/* ───────── StatusTracker: five track slots ───────── */
interface Slot {
  n: number;
  label: string;
  kind: Track["kind"];
  /** Threshold slots: warn / crit; status slots: the value that means up. */
  warn?: number;
  crit?: number;
  up?: string;
}
const SLOTS: Slot[] = [
  { n: 1, label: "Hottest thread", kind: "threshold", warn: 50, crit: 80 },
  { n: 2, label: "GPU load", kind: "threshold", warn: 50, crit: 80 },
  { n: 3, label: "Memory", kind: "threshold", warn: 80, crit: 92 },
  { n: 4, label: "Ethernet", kind: "status", up: "Up" },
  { n: 5, label: "Data API", kind: "status", up: "running" },
];
export const STATUSTRACKER_SETTINGS: ModuleSetting[] = [
  numberSetting("samples", "History length (samples)", 60, { min: 10, max: 240, step: 10, group: "Tracks" }),
  ...SLOTS.flatMap((t): ModuleSetting[] => {
    const g = `Track ${t.n}`;
    return [
      textSetting(`track${t.n}Label`, `Track ${t.n} label`, t.label, { group: "Tracks" }),
      sensorSetting(`track${t.n}Key`, "Sensor (empty = the default)", { group: g }),
      ...(t.kind === "threshold"
        ? [numberSetting(`track${t.n}Warn`, "Warning", t.warn ?? 0, { min: 0, max: 200, step: 5, group: g }), numberSetting(`track${t.n}Crit`, "Critical", t.crit ?? 0, { min: 0, max: 200, step: 5, group: g })]
        : [textSetting(`track${t.n}Up`, "Value that means up", t.up, { group: g })]),
    ];
  }),
];
export const statusTrackerProps = (s: ModuleSettings): Partial<StatusTrackerProps> => ({
  samples: numberOf(s.samples),
  tracks: SLOTS.map((t) => ({
    label: stringOf(s[`track${t.n}Label`]) ?? t.label,
    // An unset key leaves the template's detected default for this slot (StatusTracker fills it by position).
    key: stringOf(s[`track${t.n}Key`]),
    kind: t.kind,
    warn: numberOf(s[`track${t.n}Warn`]) ?? t.warn,
    crit: numberOf(s[`track${t.n}Crit`]) ?? t.crit,
    up: stringOf(s[`track${t.n}Up`]) ?? t.up,
  })),
});

/* ───────── SystemStatus / MemoryUsage / PowerDraw / Uptime / Fans / ServiceHealth / ProcessList ───────── */
export const SYSTEMSTATUS_SETTINGS: ModuleSetting[] = warnCrit("warn", "crit", 75, 90, "%");
export const systemStatusProps = (s: ModuleSettings): Partial<SystemStatusProps> => ({ warn: numberOf(s.warn), crit: numberOf(s.crit) });

export const MEMORYUSAGE_SETTINGS: ModuleSetting[] = warnCrit("warn", "crit", 80, 92, "%");
export const memoryUsageProps = (s: ModuleSettings): Partial<MemoryUsageProps> => ({ warn: numberOf(s.warn), crit: numberOf(s.crit) });

export const POWERDRAW_SETTINGS: ModuleSetting[] = [numberSetting("budget", "Power budget (W)", 750, { min: 100, max: 2000, step: 50, group: "Power" })];
export const powerDrawProps = (s: ModuleSettings): Partial<PowerDrawProps> => ({ budget: numberOf(s.budget) });

export const UPTIME_SETTINGS: ModuleSetting[] = [boolSetting("showSeconds", "Show seconds", true, { group: "Uptime" })];
export const uptimeProps = (s: ModuleSettings): Partial<UptimeProps> => ({ showSeconds: boolOf(s.showSeconds) });

export const FANS_SETTINGS: ModuleSetting[] = [
  numberSetting("maxRpm", "Full-scale speed (RPM)", 3000, { min: 500, max: 6000, step: 100, group: "Fans" }),
  boolSetting("spin", "Spin the fan icons", true, { group: "Fans" }),
];
export const fansProps = (s: ModuleSettings): Partial<FansProps> => ({ maxRpm: numberOf(s.maxRpm), spin: boolOf(s.spin) });

/** The template's `layout` is stored as `healthLayout` (the standard `layout` keeps its meaning). */
export const SERVICEHEALTH_SETTINGS: ModuleSetting[] = [enumSetting("healthLayout", "Services as", "list", opts(["list", "List"], ["pills", "Pills"]), { group: "Service health" })];
export const serviceHealthProps = (s: ModuleSettings): Partial<ServiceHealthProps> => ({ layout: oneOf(s.healthLayout, ["list", "pills"]) });

export const PROCESSLIST_SETTINGS: ModuleSetting[] = [
  enumSetting("sort", "Sort by", "cpu", opts(["cpu", "CPU"], ["utility", "CPU utility"], ["memory", "Memory"]), { group: "Process list" }),
  numberSetting("rows", "Rows (0 = fit the height)", 0, { min: 0, max: 30, step: 1, group: "Process list" }),
];
export const processListProps = (s: ModuleSettings): Partial<ProcessListProps> => ({ sort: oneOf(s.sort, ["cpu", "utility", "memory"]), rows: numberOf(s.rows) || undefined });

/* ───────── Vitals ───────── */
const VITALS_METRICS = ["cpu", "gpu", "ram", "net", "vram", "fps"] as const;
export const VITALS_SETTINGS: ModuleSetting[] = [
  enumSetting("metrics", "Vitals", "cpu,gpu,ram,net", opts(["cpu", "CPU"], ["gpu", "GPU"], ["ram", "RAM"], ["net", "Network"], ["vram", "VRAM"], ["fps", "FPS"]), { multiple: true, group: "Vitals" }),
];
export const vitalsProps = (s: ModuleSettings): Partial<VitalsProps> => ({ metrics: listPick(s.metrics, VITALS_METRICS) });

/* ───────── CpuMonitor / CoreHeatmap ───────── */
export const CPUMONITOR_SETTINGS: ModuleSetting[] = [
  deviceSetting("cpu", "Processor", "cpu", { group: "CPU monitor" }),
  enumSetting("coreView", "Threads view", "bars", opts(["bars", "Bars"], ["heatmap", "Heatmap"], ["off", "Off"]), { group: "CPU monitor" }),
  enumSetting("coreMetric", "Thread metric", "load", opts(["load", "Load"], ["clock", "Clock"]), { group: "CPU monitor", visibleIf: (v) => v.coreView !== "off" }),
  enumSetting("heatRamp", "Heatmap ramp", "accent", opts(["accent", "Accent"], ["thermal", "Thermal"]), { tab: "style", advanced: true, group: "CPU monitor", visibleIf: (v) => v.coreView === "heatmap" }),
  ...warnCrit("warn", "crit", 75, 90, "%"),
];
export const cpuMonitorProps = (s: ModuleSettings): Partial<CpuMonitorProps> => ({
  cpu: stringOf(s.cpu),
  coreView: oneOf(s.coreView, ["bars", "heatmap", "off"]),
  coreMetric: oneOf(s.coreMetric, ["load", "clock"]),
  heatRamp: oneOf(s.heatRamp, ["accent", "thermal"]),
  warn: numberOf(s.warn),
  crit: numberOf(s.crit),
});

const RAMPS = ["accent", "thermal", "viridis", "magma", "ice", "synth", "mono"] as const;
export const COREHEATMAP_SETTINGS: ModuleSetting[] = [
  deviceSetting("cpu", "Processor", "cpu", { group: "Core heatmap" }),
  enumSetting("shape", "Shape", "grid", opts(["grid", "Grid"], ["hex", "Hexagons"], ["radial", "Radial"], ["waterfall", "Waterfall"]), { group: "Core heatmap" }),
  enumSetting("metric", "Metric", "load", opts(["load", "Load"], ["clock", "Clock"], ["power", "Power"], ["vid", "Voltage (VID)"]), { group: "Core heatmap" }),
  enumSetting("showValues", "Values in cells", "auto", opts(["auto", "Auto"], ["on", "Show"], ["off", "Hide"]), { group: "Core heatmap", visibleIf: (v) => v.shape === "grid" || v.shape === "hex" }),
  numberSetting("history", "Waterfall columns", 60, { min: 10, max: 240, step: 10, group: "Core heatmap", visibleIf: (v) => v.shape === "waterfall" }),
  numberSetting("hotOutline", "Outline cells above (%)", 80, { min: 0, max: 100, step: 5, group: "Core heatmap", hint: "Share of the metric's highest value (load: percent)", visibleIf: (v) => v.shape === "grid" }),
  enumSetting("ramp", "Color ramp", "accent", RAMPS.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })), { tab: "style", advanced: true, group: "Core heatmap" }),
];
export const coreHeatmapProps = (s: ModuleSettings): Partial<CoreHeatmapProps> => ({
  cpu: stringOf(s.cpu),
  shape: oneOf(s.shape, ["grid", "hex", "radial", "waterfall"]),
  metric: oneOf(s.metric, ["load", "clock", "power", "vid"]),
  ramp: oneOf(s.ramp, RAMPS),
  showValues: s.showValues === "on" ? true : s.showValues === "off" ? false : undefined,
  history: numberOf(s.history),
  hotOutline: numberOf(s.hotOutline),
});

/* ───────── GpuRings / GpuMonitor ───────── */
const RING_COLORS: ColorEntry[] = [
  { entry: "outer", key: "outerColor", label: "Outer ring color" },
  { entry: "inner", key: "innerColor", label: "Inner ring color" },
];
export const GPURINGS_SETTINGS: ModuleSetting[] = [
  deviceSetting("gpu", "Graphics card", "gpu", { group: "GPU rings" }),
  enumSetting("outer", "Outer ring", "vram", opts(["vram", "VRAM"], ["load", "Load"], ["power", "Power"]), { group: "GPU rings" }),
  enumSetting("inner", "Inner ring", "load", opts(["load", "Load"], ["vram", "VRAM"], ["fan", "Fan"]), { group: "GPU rings" }),
  ...RING_COLORS.map((e) => colorSetting(e.key, e.label, { group: "GPU rings" })),
];
export const gpuRingsProps = (s: ModuleSettings): Partial<GpuRingsProps> => ({
  gpu: stringOf(s.gpu),
  outer: oneOf(s.outer, ["vram", "load", "power"]),
  inner: oneOf(s.inner, ["load", "vram", "fan"]),
  colors: colorsOf(s, RING_COLORS),
});

export const GPUMONITOR_SETTINGS: ModuleSetting[] = [deviceSetting("gpu", "Graphics card", "gpu", { group: "GPU monitor" }), ...warnCrit("warnTemp", "critTemp", 75, 85, "°C", 120, "Thresholds")];
export const gpuMonitorProps = (s: ModuleSettings): Partial<GpuMonitorProps> => ({ gpu: stringOf(s.gpu), warnTemp: numberOf(s.warnTemp), critTemp: numberOf(s.critTemp) });

/* ───────── Thermals (after the view / discover / fan settings it shares with Hardware) ───────── */
export const THERMALS_EXTRA_SETTINGS: ModuleSetting[] = [
  enumSetting("sortBy", "Order", "hottest", opts(["hottest", "Hottest first"], ["fixed", "Fixed"]), { group: "Content" }),
  numberSetting("max", "Bar scale (°C)", 100, { min: 40, max: 150, step: 5, group: "Content" }),
  numberSetting("warn", "Warning (°C, 0 = per sensor)", 0, { min: 0, max: 150, step: 5, group: THRESHOLDS }),
  numberSetting("crit", "Critical (°C, 0 = per sensor)", 0, { min: 0, max: 150, step: 5, group: THRESHOLDS }),
];
export const thermalsProps = (s: ModuleSettings): Partial<ThermalsProps> => ({
  sortBy: oneOf(s.sortBy, ["hottest", "fixed"]),
  max: numberOf(s.max),
  warn: numberOf(s.warn) || undefined,
  crit: numberOf(s.crit) || undefined,
  view: oneOf(s.view, ["bars", "gauges"]),
  discover: boolOf(s.discover),
  showFans: boolOf(s.showFans),
  fanColor: stringOf(s.fanColor),
});
