/**
 * HWiNFO readings under the LibreHardwareMonitor key shapes the widgets read (`libre.cpu_cpu_total`,
 * `libre.gpu_gpu_core`, `libre.total_memory_memory_used`, `libre.<drive>_total_activity`, `libre.<adapter>_download_speed`),
 * so a PC that runs HWiNFO and not LibreHardwareMonitor fills the same widgets. A device class LibreHardwareMonitor
 * already reports (a CPU, a GPU, memory, drives, adapters) gets no aliases: its own readings win.
 *
 * Readings are found by their HWiNFO name and unit, which are stable across versions where the keys are not. The Data
 * API keys a name's first reading `hwinfo.{slug}` and the rest `hwinfo.{slug}_{device}` (`SensorSnapshotBuilder.HwInfoKeys`),
 * so the device of a reading is what follows its slug; drives and adapters are grouped by it. An alias keeps its source's
 * `ref`, so an InfoPanel export binds to the HWiNFO sensor; units are converted to the LibreHardwareMonitor ones (MB to GB
 * for memory, KB/s to B/s for adapters). Remote HWiNFO readings (`hwinfo.r{n}_…`, another PC) are left alone.
 */

interface Reading {
  value?: number;
  unit?: string;
  name?: string;
}

/** InfoPanel's key slug: lower case, every character but a letter or digit as `_`, trimmed of `_`. */
export const slugOf = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "_")
    .replace(/^_+|_+$/g, "");

/** `Â°C` (HWiNFO's UTF-8 read as ANSI) as `°C`. */
const unitOf = (r: Reading): string => (r.unit ?? "").replace(/Â(?=[°²³µ])/g, "");

interface Local {
  key: string;
  name: string;
  unit: string;
  /** What follows the name's slug in the key: "" for the first device, else `_{device}`. */
  device: string;
}

/** The local HWiNFO readings with their name, unit and device suffix. */
function localReadings<V extends Reading>(map: Readonly<Record<string, V>>): Local[] {
  return Object.keys(map)
    .filter((k) => k.startsWith("hwinfo.") && !/^hwinfo\.r\d+_/.test(k) && map[k].name)
    .sort()
    .map((key) => {
      const name = map[key].name!.trim();
      const base = `hwinfo.${slugOf(name)}`;
      return { key, name, unit: unitOf(map[key]), device: key.startsWith(base) ? key.slice(base.length) : "" };
    });
}

type Convert = (v: number) => number;
const MB_TO_GB: Convert = (v) => v / 1024;
// LibreHardwareMonitor's rates are bytes per second, though the Data API labels them KB/s
const KB_TO_B: Convert = (v) => v * 1024;
const MB_TO_B: Convert = (v) => v * 1024 * 1024;

interface Alias {
  /** The alias key's suffix after the device id. */
  as: string;
  name: RegExp;
  unit?: RegExp;
  convert?: Convert;
  /** The alias's unit when it converts. */
  to?: string;
  /** The alias's name after its device's, where a widget reads the hardware's name from it (`… CPU Total`). */
  title?: string;
}

// The CPU and the GPU take the first device that has the reading (HWiNFO lists the dGPU's readings first by name).
const CPU: Alias[] = [
  { as: "cpu_total", name: /^Total CPU Usage$/i, unit: /%/, title: "CPU Total" },
  { as: "cpu_core_max", name: /^Max CPU\/Thread Usage$/i, unit: /%/ },
  { as: "cpu_package", name: /^(CPU Package|CPU \(Tctl\/Tdie\)|CPU Die \(average\))$/i, unit: /°C/ },
  { as: "cpu_package_power", name: /^CPU Package Power$/i, unit: /^W$/ },
  { as: "cores__average_effective", name: /^Average Effective Clock$/i, unit: /MHz/ },
  { as: "cores__average", name: /^Core Clocks \(avg\)$/i, unit: /MHz/ },
  { as: "ccd1__tdie", name: /^CPU CCD1 \(Tdie\)$/i, unit: /°C/ },
  { as: "ccd2__tdie", name: /^CPU CCD2 \(Tdie\)$/i, unit: /°C/ },
];
const GPU: Alias[] = [
  { as: "gpu_core_load", name: /^GPU (Core )?(Load|Utilization)$/i, unit: /%/, title: "GPU Core" },
  { as: "gpu_core", name: /^GPU Temperature$/i, unit: /°C/ },
  { as: "gpu_package", name: /^(GPU Power|Total Board Power|GPU ASIC Power)$/i, unit: /^W$/ },
  { as: "gpu_core_clock", name: /^GPU Clock$/i, unit: /MHz/ },
  { as: "gpu_memory_clock", name: /^GPU Memory Clock$/i, unit: /MHz/ },
  { as: "gpu_memory_junction", name: /^GPU Memory Junction Temperature$/i, unit: /°C/ },
  { as: "gpu_hot_spot", name: /^GPU Hot ?Spot Temperature$/i, unit: /°C/ },
  { as: "gpu_core_voltage", name: /^GPU Core Voltage$/i, unit: /^V$/ },
  { as: "gpu_memory", name: /^GPU Memory Usage$/i, unit: /%/ },
  { as: "gpu_memory_used", name: /^GPU (Memory Allocated|D3D Memory Dedicated)$/i, unit: /MB/ },
  { as: "gpu_memory_controller", name: /^GPU Memory Controller (Load|Utilization)$/i, unit: /%/ },
  { as: "gpu_video_engine", name: /^GPU Video Engine Load$/i, unit: /%/ },
];
const MEMORY: Alias[] = [
  { as: "total_memory_memory", name: /^Physical Memory Load$/i, unit: /%/ },
  { as: "total_memory_memory_used", name: /^Physical Memory Used$/i, unit: /MB/, convert: MB_TO_GB, to: "GB" },
  { as: "total_memory_memory_available", name: /^Physical Memory Available$/i, unit: /MB/, convert: MB_TO_GB, to: "GB" },
  { as: "virtual_memory_memory", name: /^Virtual Memory Load$/i, unit: /%/ },
  { as: "virtual_memory_memory_used", name: /^Virtual Memory Committed$/i, unit: /MB/, convert: MB_TO_GB, to: "GB" },
  { as: "virtual_memory_memory_available", name: /^Virtual Memory Available$/i, unit: /MB/, convert: MB_TO_GB, to: "GB" },
];
const DRIVE: Alias[] = [
  { as: "total_activity", name: /^Total Activity$/i, unit: /%/ },
  { as: "read_activity", name: /^Read Activity$/i, unit: /%/ },
  { as: "write_activity", name: /^Write Activity$/i, unit: /%/ },
  { as: "read_rate", name: /^Read Rate$/i, unit: /MB\/s/, convert: MB_TO_B, to: "KB/s" },
  { as: "write_rate", name: /^Write Rate$/i, unit: /MB\/s/, convert: MB_TO_B, to: "KB/s" },
  { as: "temperature", name: /^Drive Temperature$/i, unit: /°C/ },
  { as: "life", name: /^Drive Remaining Life$/i, unit: /%/ },
  { as: "power_on_hours", name: /^Power-On Hours$/i },
];
const ADAPTER: Alias[] = [
  { as: "download_speed", name: /^Current DL rate$/i, unit: /KB\/s/, title: "Download Speed", convert: KB_TO_B, to: "KB/s" },
  { as: "upload_speed", name: /^Current UP rate$/i, unit: /KB\/s/, title: "Upload Speed", convert: KB_TO_B, to: "KB/s" },
  { as: "data_downloaded", name: /^Total DL$/i, unit: /MB/, convert: MB_TO_GB, to: "GB" },
  { as: "data_uploaded", name: /^Total UP$/i, unit: /MB/, convert: MB_TO_GB, to: "GB" },
];

/** Per-thread loads ("Core 0 T0 Usage", "P-core 0 T1 Usage") and per-core clocks and power, Intel's key shapes. */
const THREAD = /^(?:[PE]-)?Core (\d+) T(\d+) Usage$/i;
const CORE_CLOCK = /^(?:[PE]-)?Core (\d+) Clock\b/i;
const CORE_POWER = /^(?:[PE]-)?Core (\d+) Power$/i;

const matches = (a: Alias, r: Local) => a.name.test(r.name) && (!a.unit || a.unit.test(r.unit));

/** A drive's or an adapter's device suffix as an id: the model (no serial) or the connection, `_2` for a repeat. */
function deviceId(device: string, kind: "drive" | "adapter"): string {
  if (!device) return kind === "drive" ? "drive" : "network";
  // `_drive__kingston_sfyrd2000g__50026b768718d84b___c`, `_s_m_a_r_t___kingston_sfyrd2000g__…`: the model, without the serial
  if (kind === "drive") return /^_(?:drive|s_m_a_r_t)_+([a-z0-9_]+?)(?:__|$)/.exec(device)?.[1] ?? device.slice(1);
  // `_network__mediatek_mt7925_wi_fi_7_wireless_lan_card___wifi_3`: the connection's name
  return /___([a-z0-9_]+)$/.exec(device)?.[1] ?? device.slice(1);
}

/** The drive a device suffix is (a "Drive:" and a "S.M.A.R.T.:" device of one drive share it): model, serial and letter. */
const driveGroup = (device: string): string => device.replace(/^_(?:drive|s_m_a_r_t)_+/, "");

const has = (map: Readonly<Record<string, unknown>>, re: RegExp) => Object.keys(map).some((k) => re.test(k));

const cache = new WeakMap<object, object>();
const sources = new WeakMap<object, Map<string, string>>();

/** The HWiNFO key an alias of `withHwinfoAliases(map)` reads (`libre.cpu_cpu_total` → `hwinfo.total_cpu_usage`), else `key`. */
export const aliasSource = (map: object, key: string): string => sources.get(map)?.get(key) ?? key;

/** `map` with the HWiNFO aliases added (the same object when there are none). Memoised per map identity. */
export function withHwinfoAliases<V extends Reading>(map: Readonly<Record<string, V>>): Readonly<Record<string, V>> {
  const hit = cache.get(map) as Readonly<Record<string, V>> | undefined;
  if (hit) return hit;
  const readings = localReadings(map);
  const out: Record<string, V> = {};
  const from = new Map<string, string>();
  const put = (key: string, fromReading: Local, a: Pick<Alias, "convert" | "to" | "title">, device: string) => {
    const name = `${device} ${a.title ?? fromReading.name}`;
    if (key in map || key in out) return;
    const src = map[fromReading.key];
    const value = typeof src.value === "number" && a.convert ? a.convert(src.value) : src.value;
    out[key] = { ...src, value, unit: a.to ?? fromReading.unit, name } as V;
    from.set(key, fromReading.key);
  };
  const first = (id: string, label: string, list: Alias[]) => {
    for (const a of list) {
      const r = readings.find((x) => matches(a, x));
      if (r) put(`libre.${id}_${a.as}`, r, a, label);
    }
  };

  if (readings.length > 0) {
    if (!has(map, /^libre\..+_cpu_total$/)) {
      first("cpu", "CPU", CPU);
      // threads in core then thread order, numbered from 1 as LibreHardwareMonitor does
      const threads = readings
        .flatMap((r) => {
          const m = THREAD.exec(r.name);
          return m && /%/.test(r.unit) && !r.device ? [{ r, core: Number(m[1]), t: Number(m[2]) }] : [];
        })
        .sort((a, b) => a.core - b.core || a.t - b.t);
      threads.forEach(({ r }, i) => put(`libre.cpu_cpu_core__${i + 1}_load`, r, {}, "CPU"));
      for (const r of readings) {
        const clock = CORE_CLOCK.exec(r.name);
        if (clock && /MHz/.test(r.unit) && !r.device) put(`libre.cpu_cpu_core__${Number(clock[1]) + 1}_clock`, r, {}, "CPU");
        const power = CORE_POWER.exec(r.name);
        if (power && /^W$/.test(r.unit) && !r.device) put(`libre.cpu_cpu_core__${Number(power[1]) + 1}_power`, r, {}, "CPU");
      }
    }
    if (!has(map, /^libre\..+_gpu_core_load$/)) {
      first("gpu", "GPU", GPU);
      // "GPU Fan1" reads RPM on one device and % (its duty) on another
      for (const r of readings) {
        const n = /^GPU Fan ?(\d+)$/i.exec(r.name)?.[1];
        if (n && /RPM/.test(r.unit)) put(`libre.gpu_gpu_fan_${n}`, r, {}, "GPU");
        if (n && /%/.test(r.unit)) put(`libre.gpu_gpu_fan_${n}_control`, r, {}, "GPU");
      }
    }
    if (!has(map, /^libre\.total_memory_/)) for (const a of MEMORY) {
      const r = readings.find((x) => matches(a, x));
      if (r) put(`libre.${a.as}`, r, a, "Memory");
    }
    if (!has(map, /^libre\..+_(total_activity|used_space)$/)) {
      const groups = new Map<string, string>();
      const idOf = (device: string) => {
        const g = driveGroup(device);
        if (!groups.has(g)) {
          const base = deviceId(device, "drive");
          const taken = [...groups.values()].filter((v) => v === base || v.startsWith(`${base}__`)).length;
          groups.set(g, taken ? `${base}__${taken + 1}` : base);
        }
        return groups.get(g)!;
      };
      for (const a of DRIVE) for (const r of readings.filter((x) => matches(a, x))) {
        const id = idOf(r.device);
        put(`libre.${id}_${a.as}`, r, a, id);
      }
    }
    if (!has(map, /^libre\..+_download_speed$/)) {
      for (const a of ADAPTER) for (const r of readings.filter((x) => matches(a, x))) {
        const id = deviceId(r.device, "adapter");
        put(`libre.${id}_${a.as}`, r, a, id);
      }
    }
  }
  const result = Object.keys(out).length ? { ...map, ...out } : map;
  cache.set(map, result);
  if (from.size) sources.set(result, from);
  return result;
}
