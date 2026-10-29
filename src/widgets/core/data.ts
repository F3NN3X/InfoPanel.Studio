// Data contract helpers: read, parse and format InfoPanel Data API values.
// The live stream comes from the app's own store (src/lib/sensor-store.ts), not from here.
import type { Data } from "./types";

/* ───────── data helpers ───────── */
export const get = (data: Data | undefined, key: string, fb = ""): string => {
  const v = data?.[key];
  if (v == null) return fb;
  return typeof v === "object" ? v.value ?? fb : v;
};
/** A sensor's display name, or `fallback` (a label derived from the key) when it has none. */
export const sensorLabel = (key: string, names: Record<string, string> | undefined, fallback: string): string => names?.[key] || fallback;
export const num = (v: unknown): number => {
  const m = String(v ?? "").replace(",", ".").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
};
export const has = (v: unknown): boolean => v != null && v !== "" && v !== "-" && v !== "—" && v !== "Unknown";
export const clamp = (v: number, a = 0, b = 100): number => Math.min(b, Math.max(a, Number.isFinite(v) ? v : a));
export const fmt = (v: number, d = 0): string =>
  Number.isFinite(v) ? v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }) : "–";
/** The units a throughput can show in; `auto` scales bytes per second to the reading. */
export const RATE_UNITS = ["auto", "MB/s", "Mb/s", "KB/s", "Kb/s", "Mbps"] as const;
export type RateUnit = (typeof RATE_UNITS)[number];

/** Bytes per second → the unit's number, with decimal prefixes (1 KB = 1000 bytes, 1 Kb = 1000 bits). */
const RATE_DIVISOR: Record<Exclude<RateUnit, "auto">, number> = { "MB/s": 1e6, "Mb/s": 1e6 / 8, "KB/s": 1e3, "Kb/s": 1e3 / 8, Mbps: 1e6 / 8 };

/** Decimals for a scaled reading: more for small numbers, none from 100 up. */
const rateDecimals = (v: number): number => (v >= 100 ? 0 : v >= 10 ? 1 : 2);

/**
 * A throughput as text. The rate sensors (`libre.*_download_speed`, `_upload_speed`, `_read_rate`,
 * `_write_rate`) carry **bytes per second**: the source labels them "KB/s", but an Ethernet max of
 * 107,450,768 would then be 102 GB/s, and the reading matches the adapter's utilisation of its link
 * only as bytes. Prefixes are decimal, like Task Manager.
 */
export const fmtRate = (bytesPerSec: number, unit: RateUnit = "auto"): string => {
  if (!Number.isFinite(bytesPerSec)) return "–";
  const [u, div] = rateUnitOf(bytesPerSec, unit);
  const v = bytesPerSec / div;
  return `${fmt(v, u === "B/s" ? 0 : rateDecimals(v))} ${u}`;
};
/** A throughput's number and unit apart (auto-scaled like `fmtRate`), for widgets that set the unit small beside it. */
export const rateParts = (bytesPerSec: number): { text: string; unit: string } => {
  const [unit, div] = rateUnitOf(bytesPerSec);
  const v = bytesPerSec / div;
  return { text: fmt(v, unit === "B/s" ? 0 : rateDecimals(v)), unit };
};
/** The unit `fmtRate` shows a throughput in, and what it divides the bytes per second by for it. */
export const rateUnitOf = (bytesPerSec: number, unit: RateUnit = "auto"): [string, number] =>
  unit !== "auto" ? [unit, RATE_DIVISOR[unit]] : bytesPerSec >= 1e9 ? ["GB/s", 1e9] : bytesPerSec >= 1e6 ? ["MB/s", 1e6] : bytesPerSec >= 1e3 ? ["KB/s", 1e3] : ["B/s", 1];
/** Bytes per second as megabytes per second (decimal), for widgets that print the number and unit apart. */
export const toMBps = (bytesPerSec: number): number => bytesPerSec / 1e6;
export const fmtMB = (mb: number): string => {
  if (!Number.isFinite(mb)) return "–";
  if (mb >= 1024 * 1024) return `${fmt(mb / 1048576, 2)} TB`;
  if (mb >= 1024) return `${fmt(mb / 1024, mb >= 102400 ? 0 : 1)} GB`;
  return `${fmt(mb, 0)} MB`;
};
export const fmtGB = (gb: number): string => (gb >= 1024 ? `${fmt(gb / 1024, 1)} TB` : `${fmt(gb, gb >= 100 ? 0 : 1)} GB`);
// "a, b, c\nd, e, f" → [["a","b","c"],["d","e","f"]]
export const rows = (v: unknown): string[][] =>
  String(v ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(",").map((s) => s.trim()));
// Find the variable part of keys, e.g. detect(data, /^libre\.(.+)_cpu_total$/) → ["amd_ryzen_9_9950x3d"]
export const detect = (data: Data | undefined, re: RegExp): string[] => {
  const out: string[] = [];
  for (const k in data || {}) {
    const m = k.match(re);
    if (m && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
};

/** A network adapter id (`libre.<id>_download_speed`): the chosen one, else the busiest right now. */
export const adapterOf = (data: Data | undefined, chosen?: string): string | undefined => {
  if (chosen) return chosen;
  const load = (a: string) => num(get(data, `libre.${a}_download_speed`)) + num(get(data, `libre.${a}_upload_speed`));
  return [...detect(data, /^libre\.(.+)_download_speed$/)].sort((a, b) => load(b) - load(a))[0];
};

export const pretty = (slug: string): string =>
  String(slug)
    .split("_")
    .filter(Boolean)
    .map((w) => (/^(amd|nvidia|rtx|gtx|wdc|ssd|nvme|cpu|gpu)$/i.test(w) || /\d/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");

// Identical drives (three of one NVMe model) are told apart by the Data API with "#2", "#3" after the
// device name, which slugs to "__2": `kingston_sfyrd2000g__2`.
const instanceOf = (id: string) => /__(\d+)$/.exec(id)?.[1];
/** A drive's name from its slug, with its instance: `kingston_sfyrd2000g__2` → "Kingston SFYRD2000G #2". */
export const diskName = (id: string): string => {
  const n = instanceOf(id);
  return pretty(id.replace(/__\d+$/, "")) + (n ? ` #${n}` : "");
};
/** The default drive: the first by key, preferring a model's first drive over its "#2", "#3". */
export const firstDisk = (disks: string[]): string | undefined => disks.find((x) => !instanceOf(x)) ?? disks[0];
/**
 * A drive's short label: its volumes when the Data API lists them (`{id}_volumes`, "C: Windows"), else the
 * first word of its name plus its instance: "Kingston", "Kingston #2".
 */
export const diskShort = (id: string, volumes?: string): string => {
  if (volumes && has(volumes)) return volumes;
  const n = instanceOf(id);
  return pretty(id.replace(/__\d+$/, "")).split(" ")[0] + (n ? ` #${n}` : "");
};

// Hardware ids present in the snapshot (LibreHardwareMonitor sensor slugs), shared by every hardware widget
export const hw = (data: Data | undefined): { cpu?: string; gpu?: string; disks: string[]; adapters: string[] } => ({
  cpu: detect(data, /^libre\.(.+)_cpu_total$/)[0],
  gpu: detect(data, /^libre\.(.+)_gpu_core_load$/)[0],
  // drives by their hours, else (HWiNFO's, without them) by their activity
  disks: [...new Set([...detect(data, /^libre\.(.+)_power_on_hours$/), ...detect(data, /^libre\.(.+)_total_activity$/)])],
  adapters: detect(data, /^libre\.(.+)_download_speed$/),
});
