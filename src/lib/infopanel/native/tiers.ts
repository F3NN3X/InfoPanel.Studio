/**
 * How each native widget goes to InfoPanel. A panel's widget kinds are all rebuilt as InfoPanel items. A
 * module is `native` (its values become bound items over a baked picture of the rest), `plugin` (its values come
 * from a plugin's entries, tables and image URLs), or `native-only`: its data isn't InfoPanel's, so it isn't
 * exported. `built` says whether this build recreates it; the others go as a snapshot until their values are
 * tagged for the decomposer (`decompose.ts`) or given a converter (`modules/`).
 */
import type { WidgetKind } from "../../panel-model.ts";

export type NativeTier = "native" | "plugin" | "native-only";

/** What the user picks per widget. A `native-only` widget is left out unless a snapshot of it is picked. */
export type NativeChoice = "recreate" | "snapshot" | "leave";

export interface TierEntry {
  tier: NativeTier;
  /** Recreated in this build. */
  built: boolean;
  /** What the InfoPanel version approximates or loses. */
  approximated?: string;
  /** Why a module that is not built goes as a snapshot. */
  gap?: string;
  /** Why a `native-only` widget isn't exported. */
  reason?: string;
}

/* Live images of a widget (an HttpImage fed by a plugin the user writes) may follow; no tier or choice exists for them. */

export const PANEL_KIND_TIERS: Record<WidgetKind, { approximated?: string }> = {
  stat: { approximated: "the skin's number font becomes an installed font" },
  value: { approximated: "the skin's number font becomes an installed font" },
  bar: { approximated: "rounded caps become a corner radius" },
  gauge: {},
  customGauge: {},
  sparkline: { approximated: "the graph starts empty: InfoPanel keeps its own history" },
  table: { approximated: "column widths" },
  text: {},
  image: { approximated: "object-fit becomes a scale" },
  clock: {},
  shape: {},
};

const hw = (built = true, approximated?: string): TierEntry => ({ tier: "native", built, ...(approximated ? { approximated } : {}) });
const plug = (built = true, approximated?: string): TierEntry => ({ tier: "plugin", built, ...(approximated ? { approximated } : {}) });
const only = (reason: string): TierEntry => ({ tier: "native-only", built: false, reason });

const TREND = "the trend line starts empty";

export const MODULE_TIERS: Record<string, TierEntry> = {
  CpuMonitor: hw(true, TREND),
  GpuMonitor: hw(true, TREND),
  MemoryUsage: hw(true, TREND),
  PowerDraw: hw(true, TREND),
  Fans: hw(),
  Thermals: hw(true, "the hottest-first order is fixed at export"),
  Vitals: hw(),
  SystemOverview: hw(true, TREND),
  MenuBar: hw(),
  KpiTiles: hw(),
  GpuRings: hw(true, "the rings are baked as frames"),
  CoreHeatmap: hw(true, "the colour ramp becomes two thresholds"),
  StatusTracker: hw(true, "block colours become one colour"),
  DiskIO: hw(true, "the auto-scaled axis becomes a fixed maximum"),
  NetworkThroughput: hw(true, "the rates keep the unit they have at export; the graph starts empty"),
  StorageHealth: hw(),
  DriveSpace: hw(true),
  SensorGroup: hw(),
  SensorValue: hw(true, TREND),
  CustomGauge: hw(),
  SystemStatus: hw(true, "the Data API health line is lost"),
  ServiceHealth: plug(true, "values are shown instead of status dots"),
  ProcessList: plug(true, "the per-row bars are lost"),
  Uptime: plug(true, "a short view shows the plugin's days:hours:minutes:seconds text"),
  NetworkAdapters: plug(true, "adapters re-bind by name on another PC"),
  Clock: plug(true, "an analog hand steps"),
  Calendar: plug(true, "the month grid is fixed at export; the month and today's date stay live"),
  StatusBar: plug(true, "the island and page dots are lost"),
  Weather: plug(true, "the animated sky becomes a static icon"),
  Forecast: plug(true, "per-day icons and the hi/lo bars are lost"),
  NowPlaying: plug(true, "the art-tinted background becomes a fixed colour"),
  AudioMeter: plug(true, "InfoPanel's refresh rate sets the motion"),
  MeterBridge: plug(true, "InfoPanel's refresh rate sets the motion"),
  Visualizer: plug(true, "the spectrum can't be bound: level bars instead"),
  VolumeMixer: plug(true, "the mute icon becomes a value"),
  SteamProfile: plug(true, "the status colour is lost"),
  SteamGame: plug(true),
  Achievements: plug(true),
  SteamFriends: plug(true, "status colours and avatars are lost; a table lists friends in the plugin's order"),
  SteamLibrary: plug(true, "cover thumbnails are lost"),
  SteamNews: plug(true, "cover thumbnails are lost"),
  PlaytimeShare: plug(true, "the share bar and game rows are fixed at export; the totals stay live"),
  GameSpotlight: plug(true, "the art's slow motion is lost; the achievement bar is fixed at export"),
  FpsMonitor: hw(true, "the auto-scaled axis becomes a fixed maximum"),
  OsdStrip: hw(),
  FramePacing: hw(true, "the auto-scaled axis becomes a fixed maximum"),
  Notifications: plug(true, "only the latest notification shows"),
  Bluetooth: plug(),
  Departures: plug(),
  StreamDeck: plug(),
  TextFile: plug(),
  BottleneckLens: only("it judges a game's frame rate from readings over time, which InfoPanel items can't"),
  FrameHistogram: only("it bins frame times over the last minute, which InfoPanel items can't"),
  SessionStats: only("it keeps min, max, average and time above a level since the page loaded"),
  ThresholdTimeline: only("it draws minutes of history as coloured lanes, which InfoPanel items can't"),
  CodingAgents: only("its data comes from the dashboard's own agent hooks, not from InfoPanel"),
  Countdown: only("it counts from a date set in this dashboard, not from an InfoPanel reading"),
  Timer: only("it is a timer you start and stop in this dashboard"),
  WebPage: only("it shows any web page, which InfoPanel can't draw"),
  WaveLink: only("its state is JSON in one reading, which InfoPanel can't show"),
};

/** The tier entry of a registry module; an id without one is `native-only` (the guard test keeps this from happening). */
export const tierOf = (moduleId: string): TierEntry => MODULE_TIERS[moduleId] ?? only("it has no InfoPanel version yet");

/** Every module and what the conversion makes of it: recreated, a snapshot (not built, with the gap), or left out (native-only). */
export function coverage(): { id: string; outcome: "recreated" | "snapshot" | "native-only"; reason?: string }[] {
  return Object.entries(MODULE_TIERS).map(([id, e]) =>
    e.tier === "native-only"
      ? { id, outcome: "native-only", reason: e.reason }
      : e.built
        ? { id, outcome: "recreated", ...(e.approximated ? { reason: `approximated: ${e.approximated}` } : {}) }
        : { id, outcome: "snapshot", reason: e.gap ?? "not built yet" },
  );
}

/** The choices a widget offers; the first is its default. */
export function choicesFor(entry: TierEntry): NativeChoice[] {
  if (entry.tier === "native-only") return ["leave", "snapshot"];
  return entry.built ? ["recreate", "snapshot", "leave"] : ["snapshot", "leave"];
}

/** The notice for a widget that isn't exported, as the dialog and the report word it. */
export const notCompatible = (name: string): string => `${name} isn't compatible with InfoPanel and is left out`;
