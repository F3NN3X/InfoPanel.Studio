#!/usr/bin/env node
// Builds the perf fixture: a complete dashboard data folder, made through the server's own HTTP API
// (asset upload, canvas store, config save) and written to tests/fixtures/perf/data, plus the manifest
// tests/fixtures/perf/fixture.json the e2e specs read. Output is deterministic: the ids are fixed, the
// asset and canvas files are named by content, and the canvas carries a fixed import time.
//   node tools/perf/make-fixture.mjs
// Starts server.mjs on a temp DASHBOARD_DATA_DIR; never touches the real data folder.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = path.join(root, "tests/fixtures/perf");
const dataOut = path.join(outDir, "data");

// Keep in step with CONFIG_VERSION in src/lib/layout.ts.
const CONFIG_VERSION = 11;

const CPU_TOTAL = "libre.amd_ryzen_9_9950x3d_cpu_total";
const GPU_LOAD = "libre.nvidia_geforce_rtx_5090_gpu_core_load";
const SENSOR_KEYS = [CPU_TOTAL, GPU_LOAD];

/* ---------------- the canvas: one icon gauge, one live text ---------------- */

const GAUGE_ICON = { name: "cpu", size: 44, color: "muted", y: 0.34 };

function canvasDoc() {
  const gauge = {
    kind: "Gauge",
    Name: "CPU gauge",
    X: 20,
    Y: 20,
    MinValue: 0,
    MaxValue: 100,
    Width: 220,
    Height: 220,
    SensorName: "CPU Total",
    SensorType: "Libre",
    LibreSensorId: "/amdcpu/0/load/0",
    ValueType: "NOW",
    Images: [],
    unknown: {},
    $: {
      key: CPU_TOTAL,
      via: "exact",
      vector: {
        shape: "arc",
        width: 220,
        height: 220,
        start: -135,
        sweep: 270,
        orientation: "horizontal",
        thickness: 16,
        rounded: true,
        segments: 0,
        gap: 3,
        track: "#1E293B",
        fill: { mode: "gradient", color: "#3B82F6", stops: [{ at: 0, color: "#22C55E" }, { at: 60, color: "#EAB308" }, { at: 85, color: "#EF4444" }] },
        needle: null,
        ticks: null,
        reverse: false,
        icon: GAUGE_ICON,
      },
    },
  };
  const label = {
    kind: "Sensor",
    Name: "GPU load",
    X: 260,
    Y: 110,
    Font: "Segoe UI",
    FontSize: 40,
    Color: "#FFFFFFFF",
    SensorName: "GPU Core",
    SensorType: "Libre",
    LibreSensorId: "/gpu-nvidia/0/load/0",
    ValueType: "NOW",
    ShowName: false,
    ShowUnit: true,
    unknown: {},
    $: { key: GPU_LOAD, via: "exact" },
  };
  return {
    format: "infopanel-canvas",
    version: 1,
    source: { name: "Perf gauge", origin: "file", importedAt: "2026-01-01T00:00:00.000Z" },
    dataApi: null,
    defaultMode: "infopanel",
    profile: { Name: "Perf gauge", Width: 480, Height: 260, BackgroundColor: "#00000000", Color: "#FFFFFFFF", unknown: {} },
    items: [gauge, label],
    assets: [],
    fonts: [],
  };
}

/* ---------------- the config ---------------- */

const zone = (id, module, colStart, rowStart, colSpan, rowSpan, extra = {}) => ({
  id,
  module,
  colStart,
  rowStart,
  colSpan,
  rowSpan,
  visible: true,
  ...extra,
});

const ISLAND = {
  enabled: true,
  idle: "sensor",
  stats: [
    { key: CPU_TOTAL, label: "CPU" },
    { key: GPU_LOAD, label: "GPU" },
  ],
  rotate: 0,
  size: "m",
  scale: 100,
  shape: "pill",
  offsetY: 8,
  collapseAfter: 0,
  reserve: false,
  tint: "black",
  bgColor: "#000000",
  fgColor: "#ffffff",
  opacity: 100,
  border: "none",
  shadow: true,
  font: "system",
  weight: "semibold",
  seconds: "general",
  hours: "general",
  motion: "lively",
  group: false,
  notices: { page: false, layout: false, plugins: false, onAir: false, calendar: false, agents: false },
  calendarLead: 10,
};

const HEAVY_ZONES = {
  statusBar: "perf-statusbar",
  overview: "perf-overview",
  heatmap: "perf-heatmap",
  rings: "perf-rings",
  audio: "perf-audio",
  weather: "perf-weather",
  gauges: "perf-gauges",
};
const LIGHT_ZONES = { clock: "perf-clock", cpu: "perf-cpu", gpu: "perf-gpu" };
/** The visualisers (Phase 2's hot/cold round trip): a profile of its own, so the heavy and light numbers stay comparable. */
const VIZ_ZONES = { nowPlaying: "perf-nowplaying", visualizer: "perf-visualizer" };

function buildConfig({ canvasRef, backgroundSrc }) {
  const heavy = {
    id: "perf-heavy",
    name: "Perf heavy",
    width: 1920,
    height: 550,
    cols: 12,
    rows: 6,
    fit: "fill",
    background: { type: "image", src: backgroundSrc, fit: "cover", dim: 35 },
    island: ISLAND,
    pages: [
      {
        id: "main",
        name: "Main",
        placements: [
          zone(HEAVY_ZONES.statusBar, "StatusBar", 1, 1, 12, 1, { settings: { view: "edge", left: "logo", center: "date,time", right: "cpu,gpu,ram,weather" } }),
          zone(HEAVY_ZONES.overview, "SystemOverview", 1, 2, 4, 5, { settings: { sections: "cpu,gpu,ram", ring: "ring", coreView: "heatmap", sparkline: true } }),
          zone(HEAVY_ZONES.heatmap, "CoreHeatmap", 5, 2, 2, 3, { settings: { shape: "grid", metric: "load" } }),
          zone(HEAVY_ZONES.rings, "GpuRings", 5, 5, 2, 2, { settings: { outer: "vram", inner: "load" } }),
          zone(HEAVY_ZONES.audio, "AudioMeter", 7, 2, 2, 2, { settings: {} }),
          zone(HEAVY_ZONES.weather, "Weather", 7, 4, 2, 3, { settings: { fxOn: true, fxPreview: "rain", tint: true } }),
          zone(HEAVY_ZONES.gauges, "infopanel", 9, 2, 4, 5, { canvasRef }),
        ],
      },
    ],
  };
  const light = {
    id: "perf-light",
    name: "Perf light",
    width: 1920,
    height: 550,
    cols: 12,
    rows: 6,
    fit: "fill",
    pages: [
      {
        id: "main",
        name: "Main",
        placements: [
          zone(LIGHT_ZONES.clock, "Clock", 1, 1, 4, 6),
          zone(LIGHT_ZONES.cpu, "SensorValue", 5, 1, 4, 6, { settings: { sensor: CPU_TOTAL, label: "CPU", display: "value" } }),
          zone(LIGHT_ZONES.gpu, "SensorValue", 9, 1, 4, 6, { settings: { sensor: GPU_LOAD, label: "GPU", display: "value" } }),
        ],
      },
      // A second page for the control-page-switch spec.
      {
        id: "second",
        name: "Second",
        placements: [zone("perf-second", "SensorValue", 1, 1, 12, 6, { settings: { sensor: CPU_TOTAL, label: "Second page", display: "value" } })],
      },
    ],
  };
  const viz = {
    id: "perf-viz",
    name: "Perf visualisers",
    width: 1920,
    height: 550,
    cols: 12,
    rows: 6,
    fit: "fill",
    pages: [
      {
        id: "main",
        name: "Main",
        placements: [
          zone(VIZ_ZONES.nowPlaying, "NowPlaying", 1, 1, 6, 6, { settings: { source: "media", progress: "visualizer", vizMode: "bars" } }),
          zone(VIZ_ZONES.visualizer, "Visualizer", 7, 1, 6, 6, { settings: {} }),
        ],
      },
    ],
  };
  return {
    version: CONFIG_VERSION,
    activeProfile: "perf-heavy",
    profiles: [heavy, light, viz],
    theme: {
      background: "240 10% 3.9%",
      foreground: "0 0% 98%",
      card: "240 10% 3.9%",
      "card-foreground": "0 0% 98%",
      popover: "240 10% 3.9%",
      "popover-foreground": "0 0% 98%",
      primary: "0 0% 98%",
      "primary-foreground": "240 5.9% 10%",
      secondary: "240 3.7% 15.9%",
      "secondary-foreground": "0 0% 98%",
      muted: "240 3.7% 15.9%",
      "muted-foreground": "240 5% 64.9%",
      accent: "240 3.7% 15.9%",
      "accent-foreground": "0 0% 98%",
      destructive: "0 62.8% 30.6%",
      "destructive-foreground": "0 0% 98%",
      border: "240 3.7% 15.9%",
      input: "240 3.7% 15.9%",
      ring: "240 4.9% 83.9%",
    },
    radius: 0.5,
    // A placeholder: the harness rewrites the port.
    dataApiUrl: "http://127.0.0.1:3921",
  };
}

/* ---------------- running the server ---------------- */

async function startServer(dataDir) {
  const child = spawn(process.execPath, [path.join(root, "server.mjs")], {
    env: { ...process.env, DASHBOARD_DATA_DIR: dataDir, PORT: "0", HOST: "127.0.0.1" },
  });
  let out = "";
  child.stdout.on("data", (c) => (out += c));
  child.stderr.on("data", (c) => (out += c));
  let port = null;
  for (let i = 0; i < 200 && !port; i++) {
    await new Promise((r) => setTimeout(r, 50));
    port = Number(/InfoPanel Studio on http:\/\/[^:]+:(\d+)/.exec(out)?.[1]) || null;
  }
  if (!port) {
    child.kill();
    throw new Error(`server.mjs did not start:\n${out}`);
  }
  return { base: `http://127.0.0.1:${port}`, stop: () => child.kill() };
}

async function api(base, route, init, expect) {
  const res = await fetch(base + route, init);
  const text = await res.text();
  if (res.status !== expect) throw new Error(`${init.method} ${route} -> ${res.status} ${text}`);
  return text;
}

/* ---------------- main ---------------- */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "perf-fixture-"));
const server = await startServer(tmp);
try {
  const png = fs.readFileSync(path.join(root, "public/assets/bg/aurora.png"));
  const asset = JSON.parse(
    await api(server.base, "/api/assets", { method: "POST", headers: { "content-type": "image/png", "x-dashboard-asset": "1" }, body: png }, 200),
  );

  const canvas = JSON.parse(
    await api(
      server.base,
      "/api/canvases",
      { method: "POST", headers: { "content-type": "application/json", "x-dashboard-canvas": "1" }, body: JSON.stringify(canvasDoc()) },
      200,
    ),
  );

  const config = buildConfig({ canvasRef: canvas.id, backgroundSrc: asset.url });
  await api(
    server.base,
    "/api/config",
    { method: "POST", headers: { "content-type": "application/json", "x-dashboard-config": "1" }, body: JSON.stringify(config) },
    200,
  );
  const stored = JSON.parse(await api(server.base, "/api/config", { method: "GET" }, 200));
  if (stored.version !== CONFIG_VERSION) throw new Error("the server did not keep the config");
} finally {
  server.stop();
}
// Let the server release its files before they are copied.
await new Promise((r) => setTimeout(r, 300));

fs.rmSync(dataOut, { recursive: true, force: true });
fs.mkdirSync(dataOut, { recursive: true });
const keep = (name) => name === "config.json" || name === "assets" || name === "canvases";
for (const name of fs.readdirSync(tmp).filter(keep)) fs.cpSync(path.join(tmp, name), path.join(dataOut, name), { recursive: true });
const skipped = fs.readdirSync(tmp).filter((n) => !keep(n));
fs.rmSync(tmp, { recursive: true, force: true });

const manifest = {
  profiles: { heavy: "perf-heavy", light: "perf-light", viz: "perf-viz" },
  zones: { heavy: Object.values(HEAVY_ZONES), light: Object.values(LIGHT_ZONES), viz: Object.values(VIZ_ZONES) },
  gaugeIconZone: HEAVY_ZONES.gauges,
  // The studio marks each zone with data-zone-id; the kiosk marks none, its zones are the grid's children in order.
  zoneSelector: "[data-zone-id]",
  kioskZoneSelector: ".kiosk > .grid > *",
  sensorKeys: SENSOR_KEYS,
  configVersion: CONFIG_VERSION,
};
fs.writeFileSync(path.join(outDir, "fixture.json"), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`fixture written to ${path.relative(root, dataOut)}${skipped.length ? ` (skipped: ${skipped.join(", ")})` : ""}\n`);
