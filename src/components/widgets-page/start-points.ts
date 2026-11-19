// "Duplicate as a recipe" (Phase 5b): the built-in widgets that map cleanly to a recipe's blocks, each as the recipe it starts
// from, and for every other one the reason it can't, which the Widgets page shows on the disabled button. A built-in draws with
// its own code; a start point is the blocks that draw what its default preset shows, reading the same keys.
import type { Recipe } from "@/widgets/recipe/types";
import { DEFAULT_PLACES, newRecipe, withSampleItems } from "./builder-model";

/** Why a built-in can't be a recipe, by what it does that blocks can't. */
const WHY = {
  lists: "It lists rows of something a Repeat can't run over (processes, services, volumes, readings…); a Repeat runs over places, drives, cores, fans, adapters and GPUs",
  controls: "It has buttons or sliders that act on something; a recipe only shows values",
  time: "It draws the time and date itself; a recipe has no clock block",
  stream: "It draws the fast audio or frame stream at screen rate; recipe blocks draw sensor readings",
  content: "It shows pictures or text from a service, a page or a file; a recipe holds no addresses and only its own images",
  runtime: "It picks its parts from the data as it runs (which sensors exist, how many cores or drives); a recipe's parts are fixed",
  gauge: "It draws a gauge made in Gauges; edit that gauge there",
} as const;

/** Every built-in that has no start point, with its reason. */
export const NO_START: Readonly<Record<string, keyof typeof WHY>> = {
  SystemOverview: "runtime",
  MenuBar: "runtime",
  KpiTiles: "runtime",
  StatusTracker: "lists",
  SystemStatus: "lists",
  ServiceHealth: "lists",
  ProcessList: "lists",
  Uptime: "time",
  MemoryUsage: "runtime",
  Thermals: "lists",
  PowerDraw: "runtime",
  DriveSpace: "lists",
  StorageHealth: "lists",
  NetworkThroughput: "runtime",
  NetworkAdapters: "lists",
  Clock: "time",
  Timer: "controls",
  Countdown: "time",
  StatusBar: "runtime",
  PageRail: "controls",
  Keys: "controls",
  CodingAgents: "lists",
  Calendar: "time",
  SensorGroup: "lists",
  CustomGauge: "gauge",
  NowPlaying: "content",
  AudioMeter: "stream",
  VolumeMixer: "controls",
  MeterBridge: "stream",
  Visualizer: "stream",
  WaveLink: "controls",
  FpsMonitor: "runtime",
  GameSpotlight: "content",
  OsdStrip: "runtime",
  PlaytimeShare: "content",
  SteamProfile: "content",
  SteamFriends: "lists",
  SteamGame: "content",
  Achievements: "lists",
  SteamLibrary: "lists",
  SteamNews: "content",
  WebPage: "content",
  TextFile: "content",
  Notifications: "lists",
  Departures: "lists",
  Bluetooth: "lists",
  DeviceBatteries: "runtime",
  DayPlanner: "time",
  RadialClockStack: "time",
  OnAirBeacon: "stream",
  BottleneckLens: "runtime",
  FrameHistogram: "stream",
  SessionStats: "runtime",
  StreamMixer: "controls",
  AudioButton: "controls",
  AudioFader: "controls",
  StreamControl: "controls",
  ObsButton: "controls",
  StreamChat: "lists",
  StreamDeck: "controls",
};

/** Why a built-in can't be duplicated as a recipe, or undefined when it can. */
export const whyNoStart = (id: string): string | undefined => (START[id] ? undefined : WHY[NO_START[id] ?? "runtime"]);

type Make = (name: string, taken: ReadonlySet<string>) => Recipe;

/** CPU Monitor's default: the load as a ring, temperature, clock and power, the load's history; the CPU a device option. */
const cpu: Make = (name, taken) => ({
  ...newRecipe(name, taken),
  icon: "memory",
  category: "Hardware",
  description: "From CPU Monitor: the load as a ring, temperature, clock and power, and the load's history. Temperature, clock and power read AMD's key names.",
  options: [{ key: "cpu", label: "CPU", type: "device", kind: "cpu", default: "auto" }],
  root: {
    type: "card",
    title: "CPU",
    icon: "memory",
    subtitle: { sensor: "libre.{cpu}_cpu_total" },
    children: [
      {
        type: "row",
        name: "Top row",
        gap: 12,
        grow: 3,
        children: [
          { type: "ring", name: "Ring", bind: { sensor: "libre.{cpu}_cpu_total" }, min: 0, max: 100, color: "thresholds", thresholds: { warn: 70, crit: 90 }, unit: "%", grow: 2 },
          {
            type: "row",
            name: "Values",
            direction: "column",
            gap: 4,
            grow: 3,
            children: [
              { type: "value", label: "Temp", bind: { sensor: "libre.{cpu}_core__tctl_tdie" }, decimals: 1, scale: 0.9 },
              { type: "value", label: "Clock", bind: { sensor: "libre.{cpu}_cores__average" }, decimals: 0, scale: 0.9 },
              { type: "value", label: "Power", bind: { sensor: "libre.{cpu}_package" }, decimals: 0, scale: 0.9 },
            ],
          },
        ],
      },
      { type: "sparkline", name: "Sparkline", bind: { sensor: "libre.{cpu}_cpu_total" }, min: 0, max: 100, style: "area", grow: 1 },
    ],
  },
});

/** GPU Monitor's default: the load as a gauge, temperature, VRAM and power, the load's history; the GPU a device option. */
const gpu: Make = (name, taken) => ({
  ...newRecipe(name, taken),
  icon: "developer_board",
  category: "Hardware",
  description: "From GPU Monitor: the load as a gauge, temperature, memory and power, and the load's history.",
  options: [{ key: "gpu", label: "GPU", type: "device", kind: "gpu", default: "auto" }],
  root: {
    type: "card",
    title: "GPU",
    icon: "developer_board",
    subtitle: { sensor: "libre.{gpu}_gpu_core_load" },
    children: [
      {
        type: "row",
        name: "Top row",
        gap: 12,
        grow: 3,
        children: [
          { type: "gauge", name: "Gauge", bind: { sensor: "libre.{gpu}_gpu_core_load" }, min: 0, max: 100, color: "series-2", unit: "%", grow: 2 },
          {
            type: "row",
            name: "Values",
            direction: "column",
            gap: 4,
            grow: 3,
            children: [
              { type: "value", label: "Core", bind: { sensor: "libre.{gpu}_gpu_core" }, decimals: 0, scale: 0.9, color: "thresholds", thresholds: { warn: 75, crit: 85 } },
              { type: "value", label: "VRAM", bind: { sensor: "libre.{gpu}_gpu_memory_used" }, decimals: 1, scale: 0.9 },
              { type: "value", label: "Power", bind: { sensor: "libre.{gpu}_gpu_package" }, decimals: 0, scale: 0.9 },
            ],
          },
        ],
      },
      { type: "sparkline", name: "Sparkline", bind: { sensor: "libre.{gpu}_gpu_core_load" }, min: 0, max: 100, style: "area", color: "series-2", grow: 1 },
    ],
  },
});

/** Sensor Value's default: one reading, picked by people, as a ring and a value. */
const sensor: Make = (name, taken) => ({
  ...newRecipe(name, taken),
  icon: "sensors",
  category: "Generic",
  description: "From Sensor Value: one reading people pick, as a ring with its value.",
  size: { min: [1, 1], max: [4, 3], default: [2, 2] },
  presets: [{ id: "default", name: "Default", settings: {}, size: [2, 2], default: true }],
  options: [{ key: "sensor", label: "Sensor", type: "sensor", default: "" }],
  root: { type: "card", title: "Sensor", icon: "sensors", subtitle: { option: "sensor" }, children: [{ type: "ring", name: "Ring", bind: { option: "sensor" }, min: 0, max: 100, color: "accent" }] },
});

/** Weather's default, as Weather by place: a row per place with its icon, condition, temperature and next hours. */
const weather: Make = (name, taken) =>
  withSampleItems({
    ...newRecipe(name, taken),
    icon: "partly_cloudy_day",
    category: "Info",
    description: "From Weather, for places you pick: now, today's high and low and the next hours (Weather by place).",
    size: { min: [3, 2], max: [6, 4], default: [4, 3] },
    presets: [{ id: "default", name: "Default", settings: {}, size: [4, 3], default: true }],
    options: [{ key: "places", label: "Locations", type: "place-list", default: DEFAULT_PLACES }],
    root: {
      type: "card",
      title: "Weather",
      icon: "partly_cloudy_day",
      children: [
        {
          type: "repeat",
          name: "Locations",
          over: "places",
          source: "weather-by-place",
          direction: "rows",
          max: 4,
          dividers: true,
          children: [
            { type: "weather-icon", name: "Weather icon", bind: { field: "condition" }, scale: 1.6, grow: 0.6 },
            { type: "label", name: "City", bind: { field: "name" }, scale: 0.85, grow: 2 },
            { type: "value", name: "Temperature", bind: { field: "temp" }, unit: "°", decimals: 0, scale: 1.3, grow: 1.2 },
            { type: "sparkline", name: "Next hours", bind: { field: "hourly" }, style: "bars", color: "series-1", grow: 2 },
          ],
        },
      ],
    },
  });

/** Fans, as a Repeat over fans (G38): each fan's name and speed, every fan the readings have (Thermals' fan list). Format 2. */
const fans: Make = (name, taken) => ({
  ...newRecipe(name, taken),
  format: 2,
  icon: "mode_fan",
  category: "Hardware",
  description: "From Fans: each fan's name and speed, for every fan the readings have.",
  size: { min: [2, 2], max: [6, 6], default: [3, 3] },
  presets: [{ id: "default", name: "Default", settings: {}, size: [3, 3], default: true }],
  root: {
    type: "card",
    title: "Fans",
    icon: "mode_fan",
    children: [
      {
        type: "repeat",
        name: "Fans",
        source: "fans",
        direction: "rows",
        max: 8,
        dividers: true,
        children: [
          { type: "label", name: "Name", bind: { field: "name" }, grow: 2 },
          { type: "value", name: "Speed", bind: { field: "rpm" }, decimals: 0, grow: 1 },
        ],
      },
    ],
  },
});

/** Disk I/O, as a Repeat over drives (G38): each drive's name, read and write. Format 2. */
const diskio: Make = (name, taken) => ({
  ...newRecipe(name, taken),
  format: 2,
  icon: "hard_drive",
  category: "Hardware",
  description: "From Disk I/O: each drive's read and write rate.",
  size: { min: [3, 2], max: [6, 4], default: [4, 2] },
  presets: [{ id: "default", name: "Default", settings: {}, size: [4, 2], default: true }],
  root: {
    type: "card",
    title: "Disk I/O",
    icon: "hard_drive",
    children: [
      {
        type: "repeat",
        name: "Drives",
        source: "drives",
        direction: "rows",
        max: 4,
        dividers: true,
        children: [
          { type: "label", name: "Name", bind: { field: "name" }, grow: 2 },
          { type: "value", name: "Read", label: "R", bind: { field: "read" }, convert: "MB/s", decimals: 1, grow: 2 },
          { type: "value", name: "Write", label: "W", bind: { field: "write" }, convert: "MB/s", decimals: 1, grow: 2 },
        ],
      },
    ],
  },
});

/** Core Heatmap, as a grid of a Repeat over cores (G38): a ring per core coloured by its load. Format 2. */
const cores: Make = (name, taken) => ({
  ...newRecipe(name, taken),
  format: 2,
  icon: "memory",
  category: "Hardware",
  description: "From Core Heatmap: a ring per core of the first CPU, coloured by its load.",
  size: { min: [2, 2], max: [8, 6], default: [4, 3] },
  presets: [{ id: "default", name: "Default", settings: {}, size: [4, 3], default: true }],
  root: {
    type: "card",
    title: "Cores",
    icon: "memory",
    children: [
      {
        type: "grid",
        name: "Cores",
        spacing: "tight",
        children: [
          { type: "repeat", name: "Cores", source: "cores", children: [{ type: "ring", name: "Load", bind: { field: "load" }, min: 0, max: 100, color: "thresholds", thresholds: { warn: 70, crit: 90 }, center: false }] },
        ],
      },
    ],
  },
});

/** The built-ins that have a start point, by id. */
export const START: Readonly<Record<string, Make>> = { CpuMonitor: cpu, GpuMonitor: gpu, SensorValue: sensor, Weather: weather, Fans: fans, DiskIO: diskio, CoreHeatmap: cores };
