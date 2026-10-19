import type { ModuleSettings } from "@/modules/types";

/** A stored legacy zone the migration was checked against (render-equal to its alias before the aliases went). */
export interface LegacyCase {
  name: string;
  module: string;
  settings?: ModuleSettings;
  /** Migrated keys the template reads from the saved values without offering them. */
  unlisted?: string[];
}

export const CASES: LegacyCase[] = [
  { name: "systemmodern defaults", module: "systemmodern" },
  {
    name: "systemmodern with disks, threads and no VRAM",
    module: "systemmodern",
    settings: { devices: "cpu,ram,disk", showVram: false, showCores: true, coreStyle: "bars", cpuColor: "#ff0000", decimals: "1", loadCrit: 90, sparkline: true },
  },
  { name: "systemmodern GPU only, thread heatmap", module: "systemmodern", settings: { devices: "gpu", showCores: true, showNames: true, layout: "compact" } },
  { name: "spotifymodern defaults", module: "spotifymodern" },
  // The Sample profile's zone, as stored in the live config.
  { name: "spotifymodern (Sample profile)", module: "spotifymodern", settings: { layout: "compact" } },
  { name: "spotifymodern bar visualizer", module: "spotifymodern", settings: { visualizer: true, visualizerMirrored: true, tint: false } },
  { name: "mediamodern defaults", module: "mediamodern" },
  { name: "mediamodern live waveform", module: "mediamodern", settings: { waveform: true, waveformMode: "static", waveformVariant: "line" } },
  { name: "weathermodern defaults", module: "weathermodern" },
  { name: "weathermodern now", module: "weathermodern", settings: { view: "now", showForecast: false, forecastDays: 3 } },
  { name: "steammodern defaults", module: "steammodern" },
  { name: "steammodern no dim", module: "steammodern", settings: { dimBanner: false, showNews: false } },
  { name: "fpsmodern defaults", module: "fpsmodern" },
  { name: "fpsmodern trend", module: "fpsmodern", settings: { view: "trend", sparkline: true, ringColor: "#00ff00" } },
  { name: "hardwaremodern defaults", module: "hardwaremodern" },
  { name: "hardwaremodern list", module: "hardwaremodern", settings: { maxRows: 4, tempColor: "#ff8800", showFans: false } },
  { name: "hardwaremodern temp gauges", module: "hardwaremodern", settings: { view: "temps", showFans: true, fanColor: "#00ffff", maxRows: 6 } },
  { name: "audiomodern defaults", module: "audiomodern" },
  { name: "audiomodern one device, segmented, vertical", module: "audiomodern", settings: { source: "speakers", meterVariant: "segmented", meterOrientation: "vertical", meterBallistics: "vu" } },
  { name: "audiomodern pro meter", module: "audiomodern", settings: { view: "audiometer", showDetails: true, showDevice: true, hotColor: "#ff0000" } },
  { name: "audiomodern pro meter, one device, no details", module: "audiomodern", settings: { view: "audiometer", source: "speakers", showDetails: false, meterVariant: "segmented" } },
  { name: "audiomodern volume", module: "audiomodern", settings: { view: "volume", showVolume: true, showMute: true, showDevice: true, showDetails: false } },
  { name: "audiomodern volume, one device", module: "audiomodern", settings: { view: "volume", source: "speakers", levelColor: "#00ff00" } },
  { name: "wavelinkmodern defaults", module: "wavelinkmodern" },
  { name: "wavelinkmodern horizontal", module: "wavelinkmodern", settings: { meterOrientation: "horizontal", showMixes: false } },
  { name: "bluetoothmodern defaults", module: "bluetoothmodern" },
  { name: "bluetoothmodern devices", module: "bluetoothmodern", settings: { view: "devices", showStatus: false, batteryLowColor: "#ff0000" } },
  { name: "networkmodern defaults", module: "networkmodern" },
  { name: "networkmodern totals", module: "networkmodern", settings: { view: "totals", sparkline: true, uploadColor: "#ffffff" } },
  { name: "vbz defaults", module: "vbz" },
  { name: "vbz own surface", module: "vbz", settings: { surface: "glass", showStatus: false } },
  { name: "notifications defaults", module: "notifications" },
  { name: "notifications short history", module: "notifications", settings: { maxLines: 5, accent: "#ff00ff" } },
  { name: "textfile defaults", module: "textfile" },
  { name: "textfile no header", module: "textfile", settings: { showMeta: false } },
  { name: "streamdeck defaults", module: "streamdeck" },
  { name: "streamdeck no labels", module: "streamdeck", settings: { showLabels: false } },
  { name: "webpage defaults", module: "webpage" },
  { name: "webpage url", module: "webpage", settings: { url: "https://example.com", radius: "8" } },
];
