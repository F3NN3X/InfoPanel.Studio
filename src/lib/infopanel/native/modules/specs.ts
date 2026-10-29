/**
 * What each reading-list widget shows, as the readings InfoPanel has for it: hardware by role (`templates/roles.ts`),
 * plugin entries by the key's tail, so a widget finds its plugin's container whatever the device or location is called.
 * See `readings.ts` for how a spec is drawn.
 */
import { clock } from "./clock.ts";
import { driveSpace } from "./drive-space.ts";
import { fromSpec, type Reading, type Spec } from "./readings.ts";
import { steamLibrary } from "./steam.ts";
import { across, type Converter } from "./kit.ts";
import { make } from "../items.ts";
import { newCores } from "../../elements/create.ts";
import { detectCores } from "../../elements/cores.ts";
import { applyElement, elementOf } from "../../elements/apply.ts";
import type { DisplayItem } from "../../schema.ts";

const listed = (v: unknown): string[] => (typeof v === "string" && v ? v.split(",").map((k) => k.trim()).filter(Boolean) : []);
const tail = (suffix: string) => new RegExp(`\\.${suffix.replaceAll(".", "\\.")}$`, "i");
const named = (label: string) => () => label;
const numbered = (label: string) => (_k: string, i: number) => `${label} ${i + 1}`;
/** Every reading under a plugin's prefix, as values (an image URL as an image, a table as a table). */
const plugin = (prefix: string, limit = 6): Spec => (f) =>
  f.match(new RegExp(`^plugins\\.${prefix.replaceAll(".", "\\.")}\\.`, "i"), (k) => k.split(".").slice(-1)[0].replaceAll("-", " "), "value", limit).map((r): Reading => {
    const v = f.sensors[r.key];
    return /(url|image|icon|cover|art)$/i.test(r.key) ? { ...r, kind: "image" } : v?.table ? { ...r, kind: "table" } : r;
  });

const SPECS: Record<string, Spec> = {
  PowerDraw: (f) => [...f.role("cpu.power", "graph"), ...f.role("gpu.power", "graph")],
  Fans: (f) => [...f.role("gpu.fan"), ...f.role("cpu.fan", "value", "CPU fan"), ...f.role("board.vrm", "value", "VRM")],
  Thermals: (f) => [...f.role("cpu.temp", "ring"), ...f.role("gpu.temp", "ring"), ...f.role("gpu.hotspot"), ...f.role("vram.temp"), ...f.role("disk.temp")],
  Vitals: (f) => [...f.role("cpu.load", "bar"), ...f.role("gpu.load", "bar"), ...f.role("ram.load", "bar"), ...f.role("net.down"), ...f.role("vram.used"), ...f.role("fps")],
  SystemOverview: (f) => [...f.role("cpu.load", "ring"), ...f.role("gpu.load", "ring"), ...f.role("ram.load", "ring"), ...f.role("cpu.temp"), ...f.role("gpu.temp"), ...f.role("fps")],
  MenuBar: (f) => [...f.role("cpu.load"), ...f.role("gpu.load"), ...f.role("ram.load"), ...f.role("net.down"), ...f.role("net.up")],
  KpiTiles: (f) => [...f.role("cpu.load", "graph"), ...f.role("gpu.load", "graph"), ...f.role("ram.load", "graph"), ...f.role("net.down", "graph")],
  GpuRings: (f) => [...f.role("gpu.load", "ring"), ...f.role("vram.used", "ring"), ...f.role("gpu.temp", "ring")],
  StatusTracker: (f) => f.role("cpu.load", "graph"),
  DiskIO: (f) => [...f.role("disk.load", "graph"), ...f.role("disk.temp")],
  NetworkThroughput: (f) => [...f.role("net.down", "graph"), ...f.role("net.up", "graph")],
  SystemStatus: (f) => [...f.key("system.cpu.load", "CPU", "bar"), ...f.key("system.ram.load", "Memory", "bar"), ...f.key("system.ram.free", "Free memory")],
  ServiceHealth: (f) => [
    ...f.key("plugins.InfoPanel.RTSS.rtss.fps", "RTSS"),
    ...f.match(tail("media.current-track"), named("Media")),
    ...f.match(tail("spotify.current-track"), named("Spotify")),
    ...f.match(tail("SteamAPI-Profile.player-name"), named("Steam")),
    ...f.match(/public.?ip/i, named("Public IP"), "value", 1),
  ],
  FpsMonitor: (f) => [...f.role("fps", "graph"), ...f.role("fps.low1"), ...f.role("frametime")],
  OsdStrip: (f) => [...f.role("fps"), ...f.role("fps.low1"), ...f.role("frametime"), ...f.role("cpu.load"), ...f.role("gpu.load")],
  FramePacing: (f) => [...f.role("frametime", "graph"), ...f.role("fps")],
  SensorValue: (f, s) => {
    const key = String(s.sensor ?? "");
    return f.key(key, f.sensors[key]?.name ?? key, "graph");
  },
  SensorGroup: (f, s) => {
    const keys = listed(s.sensors);
    return keys.length > 0 ? keys.flatMap((k) => f.key(k, f.sensors[k]?.name ?? k, "bar")) : [...f.role("cpu.load", "bar"), ...f.role("gpu.load", "bar"), ...f.role("ram.load", "bar")];
  },
  CustomGauge: (f, s) => {
    const key = String(s.sensor ?? "");
    return f.key(key, f.sensors[key]?.name ?? key, "ring");
  },
  ProcessList: (f) => [...f.match(tail("processes.top-cpu-usage"), named("Top CPU"), "table", 1), ...f.match(tail("processes.top-memory-usage"), named("Top memory"), "table", 1)],
  Uptime: (f) => f.match(tail("uptime.formatted"), named("Uptime"), "value", 1),
  NetworkAdapters: (f) => [...f.match(tail("name"), numbered("Adapter"), "value", 3).filter((r) => /network-info/.test(r.key)), ...f.match(/network-info.*ipv4-0$/i, numbered("IP"), "value", 3)],
  Forecast: (f) => f.match(tail("forecast"), named("Forecast"), "table", 1),
  AudioMeter: (f) => f.match(/audio-level-meter\..*\.(left|right)-channel$/i, (k) => (/left/.test(k) ? "Left" : "Right"), "bar", 2),
  MeterBridge: (f) => f.match(/audio-level-meter\..*\.(left-channel|right-channel|peak-hold)$/i, (k) => k.split(".").slice(-1)[0].replaceAll("-", " "), "bar", 3),
  Visualizer: (f) => f.match(/audio-level-meter\..*\.(left-channel|right-channel|audio-level)$/i, (k) => k.split(".").slice(-1)[0].replaceAll("-", " "), "bar", 3),
  VolumeMixer: (f) => [...f.match(/volume-plugin\..*\.volume$/i, numbered("Volume"), "bar", 3), ...f.match(/volume-plugin\..*\.mute$/i, numbered("Mute"), "value", 3)],
  GameSpotlight: (f) => [...f.match(tail("game_grid_url"), named("Game"), "image", 1), ...f.role("fps")],
  Notifications: (f) => [...f.match(tail("windows.latest"), named("Latest"), "value", 1), ...f.match(tail("windows.count"), named("Count"), "value", 1)],
  Bluetooth: plugin("bluetooth-battery-plugin"),
  Departures: plugin("InfoPanel.VBZ"),
  StreamDeck: plugin("InfoPanel.StreamDeck"),
  TextFile: plugin("InfoPanel.TextFile"),
};

/** CoreHeatmap: the Cores element, one bar per core bound to its load. */
const coreHeatmap: Converter = (box, ctx) => {
  const cores = detectCores(ctx.sensors);
  if (cores.length === 0) return [];
  const group = newCores(ctx.look, ctx.palette, cores, Math.round(box.x), Math.round(box.y));
  return [applyElement({ ...group, element: { ...elementOf(group)!, width: Math.round(box.w), height: Math.round(box.h) } } as unknown as DisplayItem)];
};

/** Calendar: InfoPanel's Calendar for today's date (the month grid has no InfoPanel item). */
const calendar: Converter = (box, ctx) => [make("Calendar", ctx, box, "Date", { FontSize: Math.max(8, Math.round(box.h * 0.4 / 1.33)), Color: ctx.palette.text, Format: "dddd d MMMM yyyy", CenterAlign: true, Width: Math.round(box.w) })];

/** The status bar: the clock, and the CPU and memory load beside it. */
const statusBar: Converter = (box, ctx, s) => {
  const [left, right] = across(box, [1, 1]);
  return [...clock(left, ctx, { ...s, face: "digital", showDate: false }), ...fromSpec((f) => [...f.role("cpu.load"), ...f.role("ram.load")])(right, ctx, s)];
};

export const SPEC_CONVERTERS: Readonly<Record<string, Converter>> = {
  ...Object.fromEntries(Object.entries(SPECS).map(([id, spec]) => [id, fromSpec(spec)])),
  CoreHeatmap: coreHeatmap,
  Calendar: calendar,
  StatusBar: statusBar,
  StorageHealth: driveSpace,
  PlaytimeShare: steamLibrary,
};

