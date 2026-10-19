import type { ModuleSettings } from "@/modules/types";

/**
 * Render parity of the v8 migration: v7 zones of the nine refiled widgets, unchanged since v7.
 * `__fixtures__/v8-parity.json` holds what each rendered under the v7 code (its markup, and for
 * NowPlaying the props, since the visualiser draws on a canvas), taken at the v7 commit.
 */
export interface ParityCase {
  id: string;
  module: string;
  settings?: ModuleSettings;
  follow?: Record<string, boolean>;
}

const VIZ = { progress: "visualizer" };

export const PARITY_CASES: ParityCase[] = [
  { id: "so-default", module: "SystemOverview" },
  {
    id: "so-own",
    module: "SystemOverview",
    settings: { sections: "cpu,gpu,ram,disk,net", cpuColor: "#ff0000", diskColor: "#00ff00", cpuLabel: "Proc", netLabel: "LAN", showDiskIo: false, coreView: "bars", details: "full" },
  },
  // v7's Widget colors flag did nothing for these rows: the own colour applied.
  { id: "so-own-follows", module: "SystemOverview", settings: { cpuColor: "#ff0000", gpuColor: "#0000ff" }, follow: { palette: true } },
  { id: "so-unified", module: "SystemOverview", settings: { unifiedColor: true, cpuColor: "#ff0000" } },
  { id: "np-default", module: "NowPlaying" },
  {
    id: "np-viz",
    module: "NowPlaying",
    settings: {
      ...VIZ,
      waveformVariant: "mirror",
      visualizerBarCount: 32,
      vizRamp: "#00ff00",
      waveformSensitivity: 2,
      visualizerAlign: "end",
      visualizerOrientation: "vertical",
      visualizerMinLevel: 0.2,
      waveformLineWidth: 3,
      waveformFadeEdges: false,
      waveformFadeWidth: 60,
      waveformBarWidth: 6,
      waveformBarGap: 2,
      waveformBarRadius: 0,
      waveformMinBarHeight: 10,
      vizColor2: "#0000ff",
      vizPeakColor: "#ffffff",
      tint: true,
    },
  },
  { id: "np-waveform-line", module: "NowPlaying", settings: { ...VIZ, vizEngine: "waveform", waveformVariant: "line" } },
  { id: "np-waveform-static", module: "NowPlaying", settings: { ...VIZ, vizEngine: "waveform", waveformMode: "static", waveformVariant: "mirror" } },
  { id: "np-bars-mirrored", module: "NowPlaying", settings: { ...VIZ, vizEngine: "bars", visualizerMirrored: true, vizShape: "pill" } },
  { id: "np-mode", module: "NowPlaying", settings: { ...VIZ, vizRamp: "#00ff00", vizColorMode: "solid", waveformVariant: "dots" } },
  { id: "sg-default", module: "SensorGroup" },
  { id: "sg-auto", module: "SensorGroup", settings: { auto: true, maxRows: 4, tempColor: "#ff0000" } },
  {
    id: "sg-list",
    module: "SensorGroup",
    settings: { sensors: "system.cpu.load,system.ram.load", groupMax: 200, items: JSON.stringify({ "system.cpu.load": { label: "Proc" } }), "warn.value": 50, "crit.value": "off" },
  },
  { id: "am-default", module: "AudioMeter" },
  { id: "am-ring", module: "AudioMeter", settings: { meterStyle: "ring" } },
  { id: "am-mirror", module: "AudioMeter", settings: { meterStyle: "mirror" } },
  { id: "am-solid", module: "AudioMeter", settings: { meterStyle: "solid" } },
  { id: "am-vu", module: "AudioMeter", settings: { meterStyle: "vu" } },
  { id: "am-bridge", module: "AudioMeter", settings: { mode: "bridge" } },
  { id: "am-colors", module: "AudioMeter", settings: { levelColor: "#00ff00", hotColor: "#ff00ff", sizeTier: "lg" } },
  { id: "wx-default", module: "Weather" },
  { id: "wx-now", module: "Weather", settings: { view: "now", showForecast: false, tint: false } },
  { id: "wx-forecast", module: "Weather", settings: { view: "forecast", showStats: false, forecastDays: 7 } },
  { id: "cpu-default", module: "CpuMonitor" },
  { id: "cpu-lg", module: "CpuMonitor", settings: { sizeTier: "lg", coreView: "heatmap", heatRamp: "thermal" } },
  { id: "up-default", module: "Uptime" },
  { id: "up-no-seconds", module: "Uptime", settings: { showSeconds: false } },
  { id: "steam-default", module: "SteamProfile" },
  { id: "web", module: "WebPage", settings: { url: "https://example.com", radius: "8", accent: "#ff0000" } },
  // Batch A (system and hardware widgets).
  { id: "mb-default", module: "MenuBar" },
  { id: "mb-own", module: "MenuBar", settings: { items: "cpu,down,up", active: "gpu", stacked: "inline", dropdown: false, rateUnit: "Mbps" } },
  { id: "kpi-default", module: "KpiTiles" },
  { id: "kpi-own", module: "KpiTiles", settings: { metrics: "cpu,vram,power", lookback: 20 } },
  { id: "st-default", module: "StatusTracker" },
  { id: "st-own", module: "StatusTracker", settings: { sizeTier: "lg", samples: 30, track1Label: "Hot", track2Key: "libre.x", "track.1.warn": "40", "track.1.crit": "off", track4Up: "Down" } },
  { id: "sstat-default", module: "SystemStatus" },
  { id: "sstat-own", module: "SystemStatus", settings: { "warn.load": 30, "crit.load": 40 } },
  { id: "vit-default", module: "Vitals" },
  { id: "vit-own", module: "Vitals", settings: { metrics: "cpu,fps,net" } },
  { id: "sh-default", module: "ServiceHealth" },
  { id: "sh-pills", module: "ServiceHealth", settings: { healthLayout: "pills" } },
  { id: "pl-default", module: "ProcessList" },
  { id: "pl-own", module: "ProcessList", settings: { sizeTier: "lg", sort: "memory", rows: 5 } },
  { id: "ch-default", module: "CoreHeatmap" },
  { id: "ch-waterfall", module: "CoreHeatmap", settings: { shape: "waterfall", history: 30, ramp: "viridis", metric: "clock" } },
  { id: "ch-grid", module: "CoreHeatmap", settings: { shape: "grid", hotOutline: 50, showValues: "on" } },
  { id: "gr-default", module: "GpuRings" },
  { id: "gr-own", module: "GpuRings", settings: { outer: "load", inner: "fan", outerColor: "#ff0000", innerColor: "#00ff00" } },
  { id: "gr-own-follows", module: "GpuRings", settings: { outerColor: "#ff0000" }, follow: { palette: true } },
  { id: "gm-default", module: "GpuMonitor" },
  { id: "gm-own", module: "GpuMonitor", settings: { sizeTier: "lg", "warn.temp": 30, "crit.temp": 40 } },
  { id: "mem-default", module: "MemoryUsage" },
  { id: "mem-own", module: "MemoryUsage", settings: { "warn.load": 10, "crit.load": 20 } },
  { id: "th-default", module: "Thermals" },
  { id: "th-gauges", module: "Thermals", settings: { view: "gauges", showFans: true, fanColor: "#00ff00" } },
  { id: "th-fan-follows", module: "Thermals", settings: { view: "gauges", fanColor: "#00ff00" }, follow: { palette: true } },
  { id: "th-limits", module: "Thermals", settings: { sensorLimits: false, "warn.temp": 40, "crit.temp": 60, sortBy: "fixed", max: 80, tempUnit: "f" } },
  { id: "th-discover", module: "Thermals", settings: { discover: true } },
  { id: "pd-default", module: "PowerDraw" },
  { id: "pd-own", module: "PowerDraw", settings: { budget: 400 } },
  { id: "fans-default", module: "Fans" },
  { id: "fans-own", module: "Fans", settings: { maxRpm: 2000, spin: false } },
];
