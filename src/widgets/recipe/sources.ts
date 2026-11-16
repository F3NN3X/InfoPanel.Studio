// The device sources a Repeat runs over (builder Phase F, G38): the drives, CPU cores, fans, network adapters and GPUs the readings
// hold, each found by the built-ins' own code (`readSystemFlat`'s drives as SystemOverview lists them, `readCpuFlat`'s threads as
// CoreHeatmap draws them, `readings`' fans as Thermals lists them, `readAdaptersFlat`, `hw`'s GPU pick), so a recipe lists what the
// built-in widgets list. An item's fields are readings with their units ("46.9 %"), read by a block as a sensor's. Nothing here
// asks the server: the lists come from the keys the page already has (live, or a recipe's sample readings).
import { readAdaptersFlat, readCpuFlat, readSystemFlat } from "@/lib/system-metrics";
import { detect, diskName, diskShort, get, hw, num, pretty } from "../core/data";
import type { Data } from "../core/types";
import { readings } from "../shared/hardware-readings";
import type { Item } from "./weather";

/** The sources a Repeat may run over: Weather by place (over a place list) and the devices the readings name. */
export const REPEAT_SOURCES = ["weather-by-place", "drives", "cores", "fans", "adapters", "gpus"] as const;
export type RepeatSource = (typeof REPEAT_SOURCES)[number];
export type DeviceSource = Exclude<RepeatSource, "weather-by-place">;
export const DEVICE_SOURCES: readonly DeviceSource[] = ["drives", "cores", "fans", "adapters", "gpus"];
export const isDeviceSource = (s: unknown): s is DeviceSource => (DEVICE_SOURCES as readonly unknown[]).includes(s);

/** A Repeat over devices shows at most this many items (a 16-core CPU's 32 threads); over places, `ITEMS_MAX`. */
export const DEVICE_ITEMS_MAX = 32;

/** The fields each item of a source has (a place's are Weather by place's, `WEATHER_PLACE_FIELDS`). */
export const SOURCE_FIELDS: Readonly<Record<DeviceSource, readonly string[]>> = {
  drives: ["name", "model", "used", "temp", "activity", "read", "write", "free", "total", "life"],
  cores: ["name", "load"],
  fans: ["name", "rpm"],
  adapters: ["name", "down", "up"],
  gpus: ["name", "load", "temp", "clock", "power", "vram"],
};

/** A source's main reading: what a new Ring, Gauge, Bar or Value inside its Repeat reads. */
export const SOURCE_MAIN: Readonly<Record<DeviceSource, string>> = { drives: "used", cores: "load", fans: "rpm", adapters: "down", gpus: "load" };

/** One device: its fields, and the keys they were read from (what a save keeps in the sample, so the Sample draws the same list). */
interface Device {
  item: Item;
  keys: string[];
}

/** A number with its unit, as the Data API writes a reading; nothing when there is no number. */
const reading = (v: number | undefined, unit: string): string | undefined => (v !== undefined && Number.isFinite(v) ? `${v} ${unit}` : undefined);
/** An item of the fields that have a value. */
const itemOf = (fields: Record<string, string | undefined>): Item => Object.fromEntries(Object.entries(fields).filter((e): e is [string, string] => e[1] !== undefined && e[1] !== ""));
const keysFrom = (data: Data, prefix: string): string[] => Object.keys(data).filter((k) => k.startsWith(prefix));

function drives(data: Data, names?: Record<string, string>): Device[] {
  return readSystemFlat(data, names).disks.map((d) => {
    const slug = d.id.replace(/^libre\./, "");
    return {
      item: itemOf({
        name: diskShort(slug, get(data, `${d.id}_volumes`)),
        model: diskName(slug),
        used: reading(d.used, "%"),
        temp: reading(d.temp, "°C"),
        activity: reading(d.activity, "%"),
        // the Data API's rates are bytes per second under a "KB/s" label (B20)
        read: reading(d.read, "B/s"),
        write: reading(d.write, "B/s"),
        free: reading(d.free, "GB"),
        total: reading(d.total, "GB"),
        life: reading(d.life, "%"),
      }),
      keys: keysFrom(data, `${d.id}_`),
    };
  });
}

function cores(data: Data): Device[] {
  const cpu = hw(data).cpu;
  if (!cpu) return [];
  const { cores: loads, coreKeys } = readCpuFlat(data, cpu);
  // the CPU's total is what finds the CPU (`hw`), so the sample keeps it with the threads
  return loads.map((load, n) => ({ item: itemOf({ name: `Core ${n + 1}`, load: reading(load, "%") }), keys: [`libre.${cpu}_cpu_total`, coreKeys[n]] }));
}

function fans(data: Data, names?: Record<string, string>): Device[] {
  return readings(data, names)
    .filter((r) => r.kind === "fan" && /rpm/i.test(r.unit))
    .map((r) => ({ item: { name: r.label, rpm: reading(r.value, r.unit)! }, keys: [r.key] }));
}

function adapters(data: Data, names?: Record<string, string>): Device[] {
  return readAdaptersFlat(data, names).map((a) => ({
    item: itemOf({ name: a.name === a.id ? pretty(a.id) : a.name, down: reading(a.down, "B/s"), up: reading(a.up, "B/s") }),
    keys: [`libre.${a.id}_download_speed`, `libre.${a.id}_upload_speed`].filter((k) => k in data),
  }));
}

/** A GPU's readings by field: the keys GPU Monitor reads. */
const GPU_KEYS = { load: "gpu_core_load", temp: "gpu_core", clock: "gpu_core_clock", power: "gpu_package", vram: "gpu_memory_used" } as const;

function gpus(data: Data, names?: Record<string, string>): Device[] {
  const ids = detect(data, /^libre\.(.+)_gpu_core_load$/);
  // the GPU `hw` picks (the card with the most memory, `gpu-pick.ts`) first, as the GPU widgets read it
  const first = hw(data).gpu;
  return [...ids.filter((id) => id === first), ...ids.filter((id) => id !== first)].map((id) => {
    const key = (f: keyof typeof GPU_KEYS) => `libre.${id}_${GPU_KEYS[f]}`;
    const named = names?.[key("load")]?.replace(/\s*GPU Core$/i, "").trim();
    const vram = num(get(data, key("vram")));
    return {
      item: itemOf({ name: named || pretty(id), load: get(data, key("load")), temp: get(data, key("temp")), clock: get(data, key("clock")), power: get(data, key("power")), vram: reading(vram, "MB") }),
      keys: Object.keys(GPU_KEYS).map((f) => key(f as keyof typeof GPU_KEYS)).filter((k) => k in data),
    };
  });
}

const FIND: Readonly<Record<DeviceSource, (data: Data, names?: Record<string, string>) => Device[]>> = { drives, cores, fans, adapters, gpus };

/** A device source's items in `data`, in its order. */
export const deviceItems = (source: DeviceSource, data: Data | undefined, names?: Record<string, string>): Item[] => (data ? FIND[source](data, names).map((d) => d.item) : []);

/** The keys a device source's items read in `data`: what a save keeps in the sample. */
export const sourceKeys = (source: DeviceSource, data: Data): string[] => [...new Set(FIND[source](data).flatMap((d) => d.keys))];

/** The key prefixes a device source reads, for a placement's data gate (as a hardware widget reads `libre.`). */
export const SOURCE_PREFIXES: Readonly<Record<DeviceSource, readonly string[]>> = { drives: ["libre."], cores: ["libre."], fans: ["libre.", "hwinfo."], adapters: ["libre."], gpus: ["libre."] };
