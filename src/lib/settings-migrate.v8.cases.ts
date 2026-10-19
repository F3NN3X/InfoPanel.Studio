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
];
