// The Status Bar's item keys and labels, apart from their readings so the settings registry can list them without loading those.
export const CARD_ITEMS = ["cpuRing", "gpuRing", "cpuDual", "gpuDual", "fps", "frameTime", "cpuLine", "gpuLine", "fpsLine"] as const;
export type CardKey = (typeof CARD_ITEMS)[number];

export const ITEMS = ["logo", "text", "date", "time", "datetime", "weather", "cpu", "gpu", "ram", "cpuTemp", "gpuTemp", "down", "up", "disk", "network", "volume", "battery", "media", "uptime", ...CARD_ITEMS] as const;
export type ItemKey = (typeof ITEMS)[number];
export const ITEM_LABELS: Record<ItemKey, string> = {
  logo: "Logo",
  text: "Text",
  date: "Date",
  time: "Time",
  datetime: "Date and time",
  weather: "Weather",
  cpu: "CPU load",
  gpu: "GPU load",
  ram: "Memory",
  cpuTemp: "CPU temperature",
  gpuTemp: "GPU temperature",
  down: "Download",
  up: "Upload",
  disk: "Disk used",
  network: "Network",
  volume: "Volume",
  battery: "Battery",
  media: "Now playing",
  uptime: "Uptime",
  cpuRing: "CPU ring",
  gpuRing: "GPU ring",
  cpuDual: "CPU double ring",
  gpuDual: "GPU double ring",
  fps: "FPS",
  frameTime: "Frame time",
  cpuLine: "CPU line",
  gpuLine: "GPU line",
  fpsLine: "FPS line",
};
