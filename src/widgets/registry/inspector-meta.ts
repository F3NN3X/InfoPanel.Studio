// What the inspector needs to know about each template widget beyond its settings (widget settings v2):
// whether it draws a header, what it draws in small zones, and (read from PR 3 on) its units, thresholds and look subset.
import type { CompactShape, DashboardModule, HeaderMode } from "@/modules/types";

export type InspectorMeta = Required<Pick<DashboardModule, "header" | "compact">> &
  Pick<DashboardModule, "fmt" | "thr" | "styleSubset">;

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
  Uptime: yes(CARD),
  CpuMonitor: yes(CARD, { fmt: ["tempUnit", "decimals"], thr: ["load"] }),
  CoreHeatmap: yes(DENSE),
  GpuRings: yes(DENSE),
  GpuMonitor: yes(CARD, { fmt: ["tempUnit"], thr: ["temp"] }),
  MemoryUsage: yes(CARD, { thr: ["load"] }),
  Thermals: yes(BOTH, { fmt: ["tempUnit"], thr: ["temp"] }),
  PowerDraw: yes(CARD),
  Fans: yes(BOTH),
  // Group B: storage, network, info, generic
  DriveSpace: yes(BOTH, { thr: ["full"] }),
  StorageHealth: yes(CARD, { fmt: ["tempUnit"] }),
  DiskIO: yes(BOTH, { fmt: ["rateUnit"] }),
  NetworkThroughput: yes(CARD, { fmt: ["rateUnit"] }),
  NetworkAdapters: yes(BOTH),
  Clock: as("title-only", DENSE, { fmt: ["clock"] }),
  Timer: yes(NONE),
  CodingAgents: yes(BOTH),
  Calendar: as("none", CARD),
  Weather: yes(CARD, { fmt: ["tempUnit"] }),
  Forecast: yes(BOTH, { fmt: ["tempUnit"] }),
  SensorValue: yes(CARD, { fmt: ["decimals"], thr: ["value"] }),
  SensorGroup: yes(BOTH, { fmt: ["tempUnit", "decimals"], thr: ["value"] }),
  CustomGauge: yes(NONE),
  // Group C: media / audio
  NowPlaying: yes(BOTH),
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
  WebPage: as("none", NONE, { styleSubset: ["colors:accent", "spacing:scale,radius", "border"] }),
  TextFile: yes(BOTH),
  Notifications: yes(BOTH),
  Departures: yes(BOTH),
  Bluetooth: yes(BOTH),
  StreamDeck: yes(BOTH),
};
