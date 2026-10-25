import type { SensorValue } from "@/hooks/useSensors";
import type { SensorMap } from "@/modules/types";

/**
 * CPU / GPU / RAM / disk readings for the System widget.
 *
 * Loads come from the Data API's own `system.*` keys where it has them; the
 * rest from LibreHardwareMonitor, whose keys are slugs of the hardware name
 * (`libre.nvidia_geforce_rtx_5090_gpu_core_load`), so they are found by
 * suffix and unit rather than by exact key. With several GPUs, the first
 * one (by key) wins.
 */

export interface DeviceReading {
  /** Hardware name, e.g. "NVIDIA GeForce RTX 5090". */
  name?: string;
  /** Load, percent (0 is a real reading). */
  load?: number;
  /** °C; absent when the sensor reports 0 (unreadable). */
  temp?: number;
  /** Watts; absent when the sensor reports 0. */
  power?: number;
  /** MHz. */
  clock?: number;
}

export interface MemoryReading {
  /** Percent used. */
  load?: number;
  /** GB. */
  used?: number;
  /** GB. */
  total?: number;
}

/** One physical drive (libre storage hardware). */
export interface DiskReading {
  /** The key without its metric suffix, unique per drive. */
  id: string;
  /** Hardware name, e.g. "KINGSTON SFYRD2000G". */
  name: string;
  /** Percent of the volume used. */
  used?: number;
  /** °C; absent when unreadable. */
  temp?: number;
  /** Total activity, percent. */
  activity?: number;
  /** KB/s. */
  read?: number;
  /** KB/s. */
  write?: number;
  /** Remaining life, percent. */
  life?: number;
  /** GB. */
  total?: number;
  /** GB. */
  free?: number;
}

/** One network adapter (`libre.<id>_download_speed`); speeds as stored, bytes per second (NaN when missing). */
export interface AdapterReading {
  /** The key slug, e.g. "wifi". */
  id: string;
  name: string;
  down: number;
  up: number;
}

export interface SystemReadings {
  cpu: DeviceReading & {
    /** Load per thread, percent, in thread order (0 is a real reading). */
    cores: number[];
  };
  gpu: DeviceReading & {
    vram: MemoryReading;
    /** Memory junction ("hotspot") °C. */
    hotspot?: number;
    /** Average fan speed, RPM. */
    fanRpm?: number;
    /** Average fan duty, percent. */
    fanPct?: number;
    /** Memory clock, MHz. */
    memClock?: number;
    /** Power draw as percent of the power limit. */
    powerLimit?: number;
  };
  ram: MemoryReading & {
    /** Page file (virtual memory) use. */
    page?: MemoryReading;
  };
  disks: DiskReading[];
}

/** The key prefixes the readings come from (for the placement subscription). */
export const SYSTEM_PREFIXES = ["system.cpu.", "system.ram.", "libre."];

type Rule = { suffix: RegExp; unit?: RegExp; not?: RegExp };

const RULES = {
  cpuLoad: { suffix: /_cpu_total$/, unit: /%/ },
  // AMD reports Tctl/Tdie, Intel "CPU Package" (°C); "Core Max" as a fallback.
  cpuTemp: [
    { suffix: /_core__tctl_tdie$/, unit: /°C/ },
    { suffix: /_cpu_package$/, unit: /°C/ },
    { suffix: /_core_max$/, unit: /°C/, not: /_gpu_/ },
  ],
  cpuPower: { suffix: /_package$/, unit: /^W$/, not: /_gpu_/ },
  gpuLoad: { suffix: /_gpu_core_load$/, unit: /%/ },
  gpuTemp: { suffix: /_gpu_core$/, unit: /°C/ },
  gpuPower: { suffix: /_gpu_package$/, unit: /^W$/ },
  gpuClock: { suffix: /_gpu_core_clock$/ },
  gpuHotspot: { suffix: /_gpu_memory_junction$/, unit: /°C/ },
  gpuMemClock: { suffix: /_gpu_memory_clock$/ },
  gpuPowerLimit: { suffix: /_gpu_power$/, unit: /%/ },
  vramLoad: { suffix: /_gpu_memory$/, unit: /%/ },
  vramUsed: { suffix: /_gpu_memory_used$/ },
  vramTotal: { suffix: /_gpu_memory_total$/ },
  ramUsed: { suffix: /^libre\.total_memory_memory_used$/ },
  ramFree: { suffix: /^libre\.total_memory_memory_available$/ },
  pageUsed: { suffix: /^libre\.virtual_memory_memory_used$/ },
  pageFree: { suffix: /^libre\.virtual_memory_memory_available$/ },
  pageLoad: { suffix: /^libre\.virtual_memory_memory$/, unit: /%/ },
} satisfies Record<string, Rule | Rule[]>;

type RuleName = keyof typeof RULES;

const matches = (rule: Rule, key: string, s: SensorValue): boolean =>
  rule.suffix.test(key) &&
  (!rule.unit || rule.unit.test(s.unit ?? "")) &&
  !(rule.not?.test(key));

/** First libre key (sorted) for each rule, with its sensor. */
function findAll(sensors: SensorMap): Partial<Record<RuleName, [string, SensorValue]>> {
  const keys = Object.keys(sensors)
    .filter((k) => k.startsWith("libre."))
    .sort();
  const found: Partial<Record<RuleName, [string, SensorValue]>> = {};
  for (const name of Object.keys(RULES) as RuleName[]) {
    const rules: Rule[] = ([] as Rule[]).concat(RULES[name]);
    // Rules are in preference order: an earlier rule beats an earlier key.
    for (const rule of rules) {
      const key = keys.find((k) => matches(rule, k, sensors[k]));
      if (key) {
        found[name] = [key, sensors[key]];
        break;
      }
    }
  }
  return found;
}

const num = (s: SensorValue | undefined): number | undefined =>
  typeof s?.value === "number" && Number.isFinite(s.value) ? s.value : undefined;
/** A reading where 0 means "not readable" (temps, power, clocks). */
const live = (s: SensorValue | undefined): number | undefined => {
  const v = num(s);
  return v === undefined || v === 0 ? undefined : v;
};
const mbToGb = (mb: number | undefined) => (mb === undefined ? undefined : mb / 1024);

/** "AMD Ryzen 9 9950X3D CPU Total" → "AMD Ryzen 9 9950X3D". */
function hardwareName(s: SensorValue | undefined, tail: RegExp): string | undefined {
  const name = s?.name?.replace(tail, "").trim();
  return name || undefined;
}

const average = (values: number[]): number | undefined =>
  values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : undefined;

/** Per-thread loads (`…_cpu_core__N`, %), sorted by N numerically. */
function readCores(sensors: SensorMap, keys: string[]): number[] {
  return keys
    .flatMap((k) => {
      const n = /_cpu_core__(\d+)$/.exec(k)?.[1];
      const v = num(sensors[k]);
      return n !== undefined && v !== undefined && /%/.test(sensors[k].unit ?? "") ? [[Number(n), v]] : [];
    })
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v);
}

/** Average of the live (non-zero) readings behind `…_gpu_fan_N` (RPM) or `…_gpu_fan_N_control` (%). */
function readFans(sensors: SensorMap, keys: string[], base: string, control: boolean) {
  const re = control ? /_gpu_fan_\d+_control$/ : /_gpu_fan_\d+$/;
  const unit = control ? /%/ : /RPM/;
  return average(
    keys
      .filter((k) => k.startsWith(base) && re.test(k) && unit.test(sensors[k].unit ?? ""))
      .flatMap((k) => live(sensors[k]) ?? [])
  );
}

/**
 * Drives: one per `…_used_space` (%) key. The doubled `_load` / `_data`
 * variants and NICs never end that way, so they are not drives.
 */
function readDisks(sensors: SensorMap, keys: string[]): DiskReading[] {
  return keys
    .filter((k) => /_used_space$/.test(k) && /%/.test(sensors[k].unit ?? ""))
    .map((key) => {
      const id = key.replace(/_used_space$/, "");
      const get = (suffix: string) => sensors[`${id}_${suffix}`];
      // "Temperature #N" is the drive's own sensor; "Composite" the NVMe fallback.
      const tempKey = keys.find((k) => k.startsWith(id) && /^_temperature__\d+$/.test(k.slice(id.length)));
      return {
        id,
        name: hardwareName(sensors[key], /\s*Used Space$/i) ?? id.replace(/^libre\./, ""),
        used: num(sensors[key]),
        temp: live(tempKey ? sensors[tempKey] : get("composite_temperature")),
        activity: num(get("total_activity")),
        read: num(get("read_rate")),
        write: num(get("write_rate")),
        life: num(get("life")),
        total: live(get("total_space")),
        free: num(get("free_space")),
      };
    });
}

/** Network adapters, one per `libre.<id>_download_speed`, in the data's key order. */
export function readAdapters(sensors: SensorMap): AdapterReading[] {
  return Object.keys(sensors).flatMap((k) => {
    const id = /^libre\.(.+)_download_speed$/.exec(k)?.[1];
    if (id === undefined) return [];
    const up = num(sensors[`libre.${id}_upload_speed`]);
    return [{ id, name: hardwareName(sensors[k], /\s*Download Speed$/i) ?? id, down: num(sensors[k]) ?? NaN, up: up ?? NaN }];
  });
}

/** Lower case with punctuation as spaces, so "WDS100T2B0A-00SM50" matches the slug name "wds100t2b0a_00sm50". */
const looseName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Drives whose name contains one of the comma-separated substrings (empty = all), ignoring case and punctuation. */
export function filterDisks(disks: DiskReading[], filter: string): DiskReading[] {
  const terms = filter
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => looseName(t) !== "");
  // the exact substring as before; the loose match only adds slug-named drives (`wds100t2b0a_00sm50`)
  const match = (name: string, t: string) => name.toLowerCase().includes(t) || (/^[a-z0-9_]+$/i.test(name) && looseName(t).length >= 3 && looseName(name).includes(looseName(t)));
  return terms.length === 0 ? disks : disks.filter((d) => terms.some((t) => match(d.name, t)));
}

export type TempUnit = "c" | "f";

/** A °C reading as text in the chosen unit, e.g. "64°C" / "147°F". */
export function formatTemp(celsius: number, unit: TempUnit, decimals = 0): string {
  const v = unit === "f" ? (celsius * 9) / 5 + 32 : celsius;
  return `${v.toFixed(decimals)}°${unit === "f" ? "F" : "C"}`;
}

/** KB/s as a short rate: "512 KB/s", "3.2 MB/s", "1.4 GB/s". */
export function readSystem(sensors: SensorMap): SystemReadings {
  const f = findAll(sensors);
  const keys = Object.keys(sensors)
    .filter((k) => k.startsWith("libre."))
    .sort();
  const at = (name: RuleName) => f[name]?.[1];

  const vramUsed = mbToGb(live(at("vramUsed")));
  const vramTotal = mbToGb(live(at("vramTotal")));
  const vramLoad =
    num(at("vramLoad")) ??
    (vramUsed !== undefined && vramTotal ? (vramUsed / vramTotal) * 100 : undefined);

  const ramUsed = num(at("ramUsed"));
  const ramFree = num(at("ramFree"));
  const ramTotal = ramUsed !== undefined && ramFree !== undefined ? ramUsed + ramFree : undefined;
  const ramLoad =
    num(sensors["system.ram.load"]) ??
    (ramUsed !== undefined && ramTotal ? (ramUsed / ramTotal) * 100 : undefined);

  const pageUsed = num(at("pageUsed"));
  const pageFree = num(at("pageFree"));
  const pageTotal = pageUsed !== undefined && pageFree !== undefined ? pageUsed + pageFree : undefined;
  const pageLoad =
    num(at("pageLoad")) ?? (pageUsed !== undefined && pageTotal ? (pageUsed / pageTotal) * 100 : undefined);
  // Fans belong to the same card as the GPU load sensor.
  const gpuBase = f.gpuLoad?.[0].replace(/_gpu_core_load$/, "") ?? "";

  return {
    cpu: {
      cores: readCores(sensors, keys),
      name: hardwareName(at("cpuLoad"), /\s*CPU Total$/i),
      load: num(sensors["system.cpu.load"]) ?? num(at("cpuLoad")),
      temp: live(at("cpuTemp")),
      power: live(at("cpuPower")),
    },
    gpu: {
      name: hardwareName(at("gpuLoad"), /\s*GPU Core$/i),
      load: num(at("gpuLoad")),
      temp: live(at("gpuTemp")),
      power: live(at("gpuPower")),
      clock: live(at("gpuClock")),
      vram: { load: vramLoad, used: vramUsed, total: vramTotal },
      hotspot: live(at("gpuHotspot")),
      fanRpm: readFans(sensors, keys, gpuBase, false),
      fanPct: readFans(sensors, keys, gpuBase, true),
      memClock: live(at("gpuMemClock")),
      powerLimit: live(at("gpuPowerLimit")),
    },
    ram: {
      load: ramLoad,
      used: ramUsed,
      total: ramTotal,
      page:
        pageLoad === undefined && pageUsed === undefined
          ? undefined
          : { load: pageLoad, used: pageUsed, total: pageTotal },
    },
    disks: readDisks(sensors, keys),
  };
}

/** What the Graphs / Gauges views show for a drive. */
export type DiskValue = "activity" | "used" | "rate";
/** Which way of an adapter's traffic. */
export type NetDirection = "down" | "up" | "both";
/** Bytes per second in one megabit per second. */
export const MBPS = 125_000;

/** The drive picked by `pick` (a key slug; "" = the first detected, as the drive picker's Auto says), among the already filtered `disks`. */
export function pickDisk(disks: DiskReading[], pick = ""): DiskReading | undefined {
  return pick ? disks.find((d) => d.id === `libre.${pick}` || d.id === pick) : disks[0];
}

/** The adapter picked by `pick` (an id; "" = the busiest by download speed). */
export function pickAdapter(adapters: AdapterReading[], pick = ""): AdapterReading | undefined {
  if (pick) return adapters.find((a) => a.id === pick);
  return adapters.reduce<AdapterReading | undefined>((best, a) => (!best || (Number.isFinite(a.down) ? a.down : -1) > (Number.isFinite(best.down) ? best.down : -1) ? a : best), undefined);
}

/** A drive's reading: activity or used as percent, rate as read + write (as stored); NaN when it has none. */
export function diskMetric(d: DiskReading, kind: DiskValue): number {
  if (kind === "used") return d.used ?? NaN;
  if (kind === "rate") return d.read === undefined && d.write === undefined ? NaN : (d.read ?? 0) + (d.write ?? 0);
  return d.activity ?? NaN;
}

/** An adapter's traffic in one direction (both = the sum), bytes per second. */
export function netMetric(a: AdapterReading, dir: NetDirection): number {
  if (dir === "down") return a.down;
  if (dir === "up") return a.up;
  return Number.isFinite(a.down) || Number.isFinite(a.up) ? (Number.isFinite(a.down) ? a.down : 0) + (Number.isFinite(a.up) ? a.up : 0) : NaN;
}

/** A gauge / graph's top for a rate: `max` Mbps when set above 0, else the history's peak (never under `floor`, bytes per second). */
export function rateTop(history: readonly number[], maxMbps = 0, floor = MBPS): number {
  if (maxMbps > 0) return maxMbps * MBPS;
  return Math.max(floor, ...history.filter(Number.isFinite));
}

/** `"62.5 %"` → value 62.5, unit "%"; text without a leading number has no value. */
function unflatten(raw: string): SensorValue {
  const cut = raw.indexOf(" ");
  const head = cut < 0 ? raw : raw.slice(0, cut);
  const value = Number(head);
  return /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(head) ? { value, unit: cut < 0 ? "" : raw.slice(cut + 1) } : { text: raw, unit: "" };
}

/** The flat data's libre / system keys as sensors. */
function flatSensors(data: Record<string, string | { value: string }>, names?: Record<string, string>): SensorMap {
  const sensors: SensorMap = {};
  for (const [key, v] of Object.entries(data)) {
    if (key.startsWith("libre.") || key.startsWith("system.")) sensors[key] = { ...unflatten(typeof v === "object" ? v.value : v), name: names?.[key] };
  }
  return sensors;
}

const flatCache = new WeakMap<object, { names?: Record<string, string>; readings: SystemReadings }>();

/**
 * The readings from the widget templates' flat data (`{ key: "62.5 %" }`, `widgets/data-adapter.ts`).
 * Flat data carries no sensor names: without `names` (the display names by key) hardware names stay
 * unset and drives are named by their key slug (`kingston_sfyrd2000g`). Memoised per data identity.
 */
export function readSystemFlat(data: Record<string, string | { value: string }>, names?: Record<string, string>): SystemReadings {
  const hit = flatCache.get(data);
  if (hit && hit.names === names) return hit.readings;
  const readings = readSystem(flatSensors(data, names));
  flatCache.set(data, { names, readings });
  return readings;
}

/** The key each reading of `readSystemFlat` comes from (`cpuTemp` → `libre.…_core__tctl_tdie`), for the InfoPanel conversion's tags. */
export function systemKeysFlat(data: Record<string, string | { value: string }>): Partial<Record<RuleName, string>> {
  return Object.fromEntries(Object.entries(findAll(flatSensors(data))).map(([name, hit]) => [name, hit?.[0]]));
}

/** The network adapters from the templates' flat data (data order). */
export const readAdaptersFlat = (data: Record<string, string | { value: string }>, names?: Record<string, string>): AdapterReading[] => readAdapters(flatSensors(data, names));
