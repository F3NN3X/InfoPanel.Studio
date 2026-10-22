// What the inspector needs to know about each template widget beyond its settings (widget settings v2):
// whether it draws a header, what it draws in small zones, the units and thresholds it renders (its schema has
// one Units & format / Thresholds row each; checked against what each renderer draws) and its look subset.
import type { CompactShape, DashboardModule, HeaderMode, ModuleSetting } from "@/modules/types";

export type InspectorMeta = Required<Pick<DashboardModule, "header" | "compact">> &
  Pick<DashboardModule, "fmt" | "thr" | "styleSubset" | "noData">;

/** A summary card and a dense view of its own (`compact` and `studio` descriptors). */
const BOTH: CompactShape = { card: true, dense: true };
/** A summary card; the dense view falls back to it (no `studio` descriptor). */
const CARD: CompactShape = { card: true, dense: "fallback" };
/** A dense view only (no `compact` descriptor). */
const DENSE: CompactShape = { card: false, dense: true };
/** Neither: small zones keep the full layout. */
const NONE: CompactShape = { card: false, dense: false };

const yes = (compact: CompactShape, more: Omit<InspectorMeta, "header" | "compact"> = {}): InspectorMeta => ({ header: "yes", compact, ...more });
const as = (header: HeaderMode, compact: CompactShape, more: Omit<InspectorMeta, "header" | "compact"> = {}): InspectorMeta => ({ header, compact, ...more });

/** Every template widget, by id. */
export const INSPECTOR_META: Record<string, InspectorMeta> = {
  // Group A: system and hardware
  SystemOverview: as("title-only", DENSE, { fmt: ["tempUnit", "decimals"], thr: ["load", "temp", "full"] }),
  MenuBar: as("none", BOTH, { fmt: ["rateUnit"] }),
  KpiTiles: as("none", BOTH),
  StatusTracker: yes(BOTH, { thr: ["load"] }),
  SystemStatus: yes(CARD, { thr: ["load"] }),
  Vitals: as("none", BOTH),
  ServiceHealth: yes(BOTH),
  ProcessList: yes(BOTH),
  // Its one reading is the plugin's uptime: nothing to pick or bind.
  Uptime: yes(CARD, { noData: true }),
  // The unit and decimals of its temperatures.
  CpuMonitor: yes(CARD, { fmt: ["tempUnit", "decimals"], thr: ["load"] }),
  CoreHeatmap: yes(DENSE),
  GpuRings: yes(DENSE),
  GpuMonitor: yes(CARD, { thr: ["temp"] }),
  MemoryUsage: yes(CARD, { thr: ["load"] }),
  Thermals: yes(BOTH, { fmt: ["tempUnit"], thr: ["temp"] }),
  PowerDraw: yes(CARD),
  Fans: yes(BOTH),
  // Group B: storage, network, info, generic
  DriveSpace: yes(BOTH, { thr: ["full"] }),
  StorageHealth: yes(CARD),
  DiskIO: yes(BOTH),
  NetworkThroughput: yes(CARD, { fmt: ["rateUnit"] }),
  NetworkAdapters: yes(BOTH),
  Clock: as("title-only", DENSE, { fmt: ["clock"] }),
  Timer: yes(NONE),
  Countdown: yes(BOTH, { fmt: ["clock"] }),
  StatusBar: as("none", DENSE, { fmt: ["clock", "tempUnit", "rateUnit"] }),
  CodingAgents: yes(BOTH),
  Calendar: as("none", CARD),
  Weather: yes(CARD, { fmt: ["tempUnit"] }),
  Forecast: yes(BOTH, { fmt: ["tempUnit"] }),
  SensorValue: yes(CARD, { fmt: ["decimals"], thr: ["value"] }),
  SensorGroup: yes(BOTH, { fmt: ["tempUnit", "decimals"], thr: ["value"] }),
  CustomGauge: yes(NONE),
  // Group C: media / audio
  NowPlaying: yes(BOTH),
  // Its amber and hot zones are the Audio level threshold (config v8).
  AudioMeter: yes(BOTH, { thr: ["db"] }),
  VolumeMixer: yes(BOTH),
  MeterBridge: yes(DENSE, { thr: ["db"] }),
  Visualizer: yes(DENSE),
  WaveLink: yes(BOTH),
  // Group D: gaming
  FpsMonitor: yes(CARD),
  GameSpotlight: as("none", BOTH),
  OsdStrip: as("none", BOTH),
  FramePacing: yes(BOTH),
  PlaytimeShare: yes(BOTH),
  SteamProfile: yes(CARD),
  SteamFriends: yes(BOTH),
  SteamGame: as("none", CARD),
  Achievements: yes(CARD),
  SteamLibrary: yes(CARD),
  SteamNews: yes(BOTH),
  // Group E: the plain plugin cards
  // A URL, no sensor data: its Data tab is empty too.
  WebPage: as("none", NONE, { styleSubset: ["colors:accent", "spacing:scale,radius", "border"], noData: true }),
  TextFile: yes(BOTH),
  Notifications: yes(BOTH),
  Departures: yes(BOTH),
  Bluetooth: yes(BOTH),
  StreamDeck: yes(BOTH),
};

/**
 * A widget's Fit rows for its small-zone shape (SPEC §4.6): Small zones
 * without the choices it cannot draw (Card without a summary card, Dense
 * without a dense view); with only Auto / Full left the row goes and
 * Density stops being a More row.
 */
export function fitSettings(defs: ModuleSetting[], compact: CompactShape): ModuleSetting[] {
  const drawn = (value: string) => (value === "card" ? compact.card : value === "dense" ? compact.dense !== false : true);
  const row = defs.find((d) => d.key === "compact");
  const options = row?.options?.filter((o) => drawn(o.value)) ?? [];
  const keep = options.length > 2;
  return defs.flatMap((d): ModuleSetting[] => {
    if (d === row) return keep ? [{ ...d, options }] : [];
    if (d.key === "sizeTier" && !keep) return [{ ...d, more: false }];
    return [d];
  });
}
