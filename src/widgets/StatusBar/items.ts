// What each Status Bar item reads from the data, as plain values: an item whose data is absent is null, so the bar never shows "–".
import { weatherKind, type WeatherCondition } from "@/lib/weather-icons";
import { inUnit } from "@/modules/setting-readers";
import { adapterOf, detect, fmt, fmtRate, get, has, hw, num, type Data, type RateUnit } from "../kit";
import { trackOf } from "../NowPlaying";

export const ITEMS = ["logo", "text", "date", "time", "datetime", "weather", "cpu", "gpu", "ram", "cpuTemp", "gpuTemp", "down", "up", "disk", "network", "volume", "battery", "media", "uptime"] as const;
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
};

export type Display = "both" | "value" | "icon";

/** One item as drawn: an icon (a name, a weather condition or an image), a value, or both. */
export interface Reading {
  icon?: string;
  weather?: WeatherCondition;
  image?: string;
  value?: string;
  /** The value as pieces with a divider between (date and time). */
  parts?: string[];
  /** The icon says it (a level, a link): the value shows only when the bar is set to values. */
  glyph?: boolean;
}

export interface ReadCtx {
  d: Data;
  now: Date;
  locale: string;
  clock: "auto" | "12" | "24";
  seconds: boolean;
  tempUnit: "c" | "f";
  rateUnit?: RateUnit;
  logoIcon: string;
  logoImage?: string;
  text: string;
}

/** "Thu, Jul 30". */
export const dateText = (now: Date, locale: string): string => now.toLocaleDateString(locale || undefined, { weekday: "short", month: "short", day: "numeric" });

/** "14:05" or "2:05 PM", with seconds when asked. */
export const timeText = (now: Date, locale: string, clock: ReadCtx["clock"], seconds: boolean): string =>
  now.toLocaleTimeString(locale || undefined, { hour: clock === "24" ? "2-digit" : "numeric", minute: "2-digit", ...(seconds ? { second: "2-digit" as const } : {}), ...(clock === "auto" ? {} : clock === "12" ? { hour12: true } : { hourCycle: "h23" as const }) });

/** A wireless adapter by its name or slug; anything else reads as wired. */
export const isWifi = (name: string): boolean => /wi-?fi|wireless|wlan|802\.11/i.test(name);

/** What shows of a reading at the bar's Display setting: whether the icon does, and the value text. */
export function shownOf(r: Reading, display: Display): { icon: boolean; value: string | undefined } {
  const text = r.parts ? r.parts.join(" ") : r.value;
  const hasIcon = r.icon !== undefined || r.weather !== undefined || r.image !== undefined;
  if (!hasIcon) return { icon: false, value: text };
  if (!text) return { icon: true, value: undefined };
  if (display === "value") return { icon: false, value: text };
  if (display === "icon") return { icon: true, value: undefined };
  return { icon: true, value: r.glyph ? undefined : text };
}

const L = (d: Data, k: string) => num(get(d, `libre.${k}`));
const pct = (v: number) => (Number.isFinite(v) ? `${fmt(v, 0)}%` : undefined);
const withIcon = (icon: string, value: string | undefined): Reading | null => (value === undefined ? null : { icon, value });
const rate = (bytesPerSec: number, unit: RateUnit | undefined) => (Number.isFinite(bytesPerSec) ? fmtRate(bytesPerSec, unit) : undefined);

/** A °C reading in the unit, "23°C". */
const temp = (c: number, unit: "c" | "f"): string | undefined => (Number.isFinite(c) ? `${fmt(inUnit(c, unit), 0)}°${unit.toUpperCase()}` : undefined);

/** The first drive's used share: the drive plugin lists drives by id. */
function diskUsed(d: Data): number {
  const id = detect(d, /^plugins\.drive-info-plugin\.([^.]+)\.name$/)[0];
  if (!id) return NaN;
  return (num(get(d, `plugins.drive-info-plugin.${id}.used_space`)) / num(get(d, `plugins.drive-info-plugin.${id}.total_size`))) * 100;
}

function weather(c: ReadCtx): Reading | null {
  const yr = detect(c.d, /^plugins\.yr-weather-plugin\.([^.]+)\.temp$/)[0];
  const base = yr ? `plugins.yr-weather-plugin.${yr}` : "plugins.weather-plugin.weather";
  const value = temp(num(get(c.d, `${base}.temp`)), c.tempUnit);
  return value === undefined ? null : { weather: weatherKind(get(c.d, `${base}.weather_icon`), get(c.d, `${base}.weather_desc`)), value };
}

function network(d: Data): Reading | null {
  const ids = detect(d, /^plugins\.network-info-plugin\.(\{[^}]+\})\.name$/);
  const up = ids.filter((id) => get(d, `plugins.network-info-plugin.${id}.status`) === "Up");
  const busy = adapterOf(d);
  if (ids.length === 0 && !busy) return null;
  if (ids.length > 0 && up.length === 0) return { icon: "sensors_off", value: "Offline", glyph: true };
  // the busiest measured adapter names the link; with none measured, the first one that is up
  const name = busy ?? `${get(d, `plugins.network-info-plugin.${up[0]}.name`)} ${get(d, `plugins.network-info-plugin.${up[0]}.description`)}`;
  return isWifi(name) ? { icon: "wifi", value: "Wi-Fi", glyph: true } : { icon: "settings_ethernet", value: "Ethernet", glyph: true };
}

function volume(d: Data): Reading | null {
  const ids = detect(d, /^plugins\.volume-plugin\.(.+)\.short_name$/);
  const id = ids.find((x) => x === "default") ?? ids[0];
  if (!id) return null;
  const level = num(get(d, `plugins.volume-plugin.${id}.volume`));
  if (!Number.isFinite(level)) return null;
  const muted = get(d, `plugins.volume-plugin.${id}.mute`) === "True";
  return { icon: muted ? "volume_off" : level < 35 ? "volume_down" : "volume_up", value: muted ? "Muted" : `${fmt(level, 0)}%`, glyph: true };
}

/** A battery is a LibreHardwareMonitor "Charge Level" sensor; a desktop has none. */
function battery(d: Data): Reading | null {
  const id = detect(d, /^libre\.(.+)_charge_level$/)[0];
  const level = id ? L(d, `${id}_charge_level`) : NaN;
  return Number.isFinite(level) ? { icon: level >= 70 ? "battery_full" : level >= 30 ? "battery_3_bar" : "battery_1_bar", value: `${fmt(level, 0)}%`, glyph: true } : null;
}

function media(d: Data): Reading | null {
  const t = trackOf(d, "auto");
  if (!has(t.track)) return null;
  return { icon: "music_note", value: has(t.artist) ? `${t.track} · ${t.artist}` : t.track };
}

function uptime(d: Data): Reading | null {
  const k = (s: string) => num(get(d, `plugins.system-info-plugin.uptime.${s}`));
  const [days, hours, minutes] = [k("days"), k("hours"), k("minutes")];
  if (![days, hours, minutes].every(Number.isFinite)) return null;
  return { icon: "timer", value: days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}m` };
}

/** The item's reading, or null while its data is absent (date, time and the logo always read). */
export function readingOf(key: ItemKey, c: ReadCtx): Reading | null {
  const { d } = c;
  const { cpu, gpu } = hw(d);
  const adapter = adapterOf(d);
  switch (key) {
    case "logo":
      return c.logoImage ? { image: c.logoImage } : { icon: c.logoIcon || "monitor" };
    case "text":
      return c.text ? { value: c.text } : null;
    case "date":
      return { value: dateText(c.now, c.locale) };
    case "time":
      return { value: timeText(c.now, c.locale, c.clock, c.seconds) };
    case "datetime":
      return { parts: [dateText(c.now, c.locale), timeText(c.now, c.locale, c.clock, c.seconds)] };
    case "weather":
      return weather(c);
    case "cpu":
      return withIcon("memory", pct(L(d, `${cpu}_cpu_total`)));
    case "gpu":
      return withIcon("developer_board", pct(L(d, `${gpu}_gpu_core_load`)));
    case "ram":
      return withIcon("memory_alt", pct(L(d, "total_memory_memory")));
    case "cpuTemp":
      return withIcon("device_thermostat", temp(L(d, `${cpu}_core__tctl_tdie`), c.tempUnit));
    case "gpuTemp":
      return withIcon("device_thermostat", temp(L(d, `${gpu}_gpu_core`), c.tempUnit));
    case "down":
      return adapter ? withIcon("south", rate(L(d, `${adapter}_download_speed`), c.rateUnit)) : null;
    case "up":
      return adapter ? withIcon("north", rate(L(d, `${adapter}_upload_speed`), c.rateUnit)) : null;
    case "disk":
      return withIcon("hard_drive", pct(diskUsed(d)));
    case "network":
      return network(d);
    case "volume":
      return volume(d);
    case "battery":
      return battery(d);
    case "media":
      return media(d);
    case "uptime":
      return uptime(d);
  }
}
