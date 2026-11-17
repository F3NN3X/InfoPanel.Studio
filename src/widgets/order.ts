// The order of the built-in widgets in the registry, and so in the studio's Add list and Library: the group widgets
// and the folder widgets (`src/widgets/<kebab-id>/`) side by side. Widget packages come after these. Read by
// tools/widgets/generate.mjs (which fails on a folder widget missing here and writes each one's place into
// registry.generated.ts) and by tests/widgets/folders.test.ts; the app itself never imports it.
export const WIDGET_ORDER: readonly string[] = [
  "SystemOverview", "MenuBar", "KpiTiles", "StatusTracker", "SystemStatus", "ServiceHealth", "ProcessList", "Uptime", "CpuMonitor", "CoreHeatmap", "GpuMonitor", "MemoryUsage", "Thermals", "PowerDraw", "Fans",
  "DriveSpace", "StorageHealth", "DiskIO", "NetworkThroughput", "NetworkAdapters", "Clock", "Timer", "Countdown", "StatusBar", "PageRail", "CodingAgents", "Calendar", "Weather", "SensorValue", "SensorGroup", "CustomGauge",
  "NowPlaying", "AudioMeter", "VolumeMixer", "MeterBridge", "Visualizer", "WaveLink",
  "FpsMonitor", "GameSpotlight", "OsdStrip", "PlaytimeShare", "SteamProfile", "SteamFriends", "SteamGame", "Achievements", "SteamLibrary", "SteamNews",
  "WebPage", "TextFile", "Notifications", "Departures", "Bluetooth",
  "DayPlanner", "RadialClockStack", "OnAirBeacon",
  "BottleneckLens", "FrameHistogram", "SessionStats",
  "StreamMixer", "AudioButton", "AudioFader",
  "StreamControl", "ObsButton",
  "StreamChat",
  "StreamDeck",
];
