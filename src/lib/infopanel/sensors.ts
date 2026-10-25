/**
 * Maps an item's InfoPanel sensor binding to a Data API key, and turns Data
 * API values into InfoPanel's SensorReading.
 *
 * Order: the exact native `ref` (Data API with PR #173's ref), then the plugin
 * key derived from PluginSensorId, then InfoPanel's own import fallback for
 * HWiNFO (first reading with the same name), else unmapped.
 */
import type { SensorReading } from "./sensor-text.ts";
import type { DisplayItem } from "./schema.ts";

/** One value of `/api/sensors`. */
export interface DataApiValue {
  value?: number;
  text?: string;
  unit?: string;
  min?: number;
  max?: number;
  avg?: number;
  name?: string;
  source?: string;
  ref?: string;
  /** A plugin table with column names, each cell as InfoPanel draws it (null: not drawn). Fork follow-up to PR #173. */
  table?: { columns: string[]; rows: (string | null)[][]; format?: string };
}

/**
 * The unit as it should read. InfoPanel builds before the fix to its HWiNFO string decoding send "°C" as
 * "Â°C" (HWiNFO's UTF-8 read as ANSI); newer builds send it right, and this leaves that alone.
 */
export const fixUnit = (unit: string | undefined): string | undefined => unit?.replace(/Â(?=[°²³µ])/g, "");

export type BoundItem = Extract<DisplayItem, { SensorType: unknown }>;

export function isBound(item: DisplayItem): item is BoundItem {
  return "SensorType" in item;
}

/** The binding as the Data API's `ref` writes it; null when the item names no sensor. */
export function bindingRef(item: BoundItem): string | null {
  switch (item.SensorType) {
    case "Libre":
      return "LibreSensorId" in item && item.LibreSensorId ? "libre:" + item.LibreSensorId : null;
    case "Plugin":
      return item.PluginSensorId ? "plugin:" + item.PluginSensorId : null;
    case "HwInfo":
      return "Id" in item ? `hwinfo:${item.HwInfoRemoteIndex}/${item.Id}/${item.Instance}/${item.EntryId}` : null;
  }
}

/** Every binding field a kind may have: what a remap rewrites and Reset to automatic puts back. */
export const BINDING_FIELDS: readonly string[] = ["SensorType", "SensorName", "HwInfoRemoteIndex", "Id", "Instance", "EntryId", "LibreSensorId", "PluginSensorId"];

/** The item's binding fields, as they are. */
export function bindingOf(item: BoundItem): Record<string, string | number> {
  const o = item as unknown as Record<string, string | number>;
  return Object.fromEntries(BINDING_FIELDS.filter((k) => k in item).map((k) => [k, o[k]]));
}

/** InfoPanel's own binding fields (`SensorReader`): only the id field of the SensorType is read. */
export type NativeBinding =
  | { SensorType: "Libre"; LibreSensorId: string }
  | { SensorType: "Plugin"; PluginSensorId: string }
  | { SensorType: "HwInfo"; HwInfoRemoteIndex: number; Id: number; Instance: number; EntryId: number };

const isUint = (s: string) => /^\d{1,10}$/.test(s) && Number(s) <= 0xffffffff;

/**
 * The inverse of `bindingRef`: a Data API `ref` as InfoPanel's binding fields, as
 * `SensorSnapshotBuilder` makes them ("libre:" + identifier, "plugin:" + PluginSensorId,
 * "hwinfo:{remote}/{id}/{instance}/{entry}"). Libre identifiers and plugin ids start with "/";
 * the remote index is -1 for this machine. Null for anything else.
 */
export function bindingFromRef(ref: string): NativeBinding | null {
  if (ref.startsWith("libre:")) {
    const id = ref.slice(6);
    return id.length > 1 && id.startsWith("/") ? { SensorType: "Libre", LibreSensorId: id } : null;
  }
  if (ref.startsWith("plugin:")) {
    const id = ref.slice(7);
    return id.length > 1 && id.startsWith("/") ? { SensorType: "Plugin", PluginSensorId: id } : null;
  }
  if (ref.startsWith("hwinfo:")) {
    const parts = ref.slice(7).split("/");
    if (parts.length !== 4 || !/^-?\d{1,10}$/.test(parts[0]) || !parts.slice(1).every(isUint)) return null;
    const remote = Number(parts[0]);
    if (remote < -1 || remote > 2 ** 31 - 1) return null;
    return { SensorType: "HwInfo", HwInfoRemoteIndex: remote, Id: Number(parts[1]), Instance: Number(parts[2]), EntryId: Number(parts[3]) };
  }
  return null;
}

/**
 * The item rebound as InfoPanel's Replace sensor does: SensorType, that type's id fields and
 * SensorName; the other ids stay as they were. Null when the kind can't hold the binding (a
 * table reads plugins only).
 */
export function withBinding<T extends BoundItem>(item: T, binding: NativeBinding, sensorName: string): T | null {
  if (item.kind === "TableSensor" && binding.SensorType !== "Plugin") return null;
  return { ...item, ...binding, SensorName: sensorName };
}

/** The Data API key of a PluginSensorId (`SensorSnapshotBuilder.PluginKey`). */
export const pluginKey = (id: string) => "plugins." + id.replace(/^\/+/, "").replaceAll("/", ".");

/** `SensorSnapshotBuilder.CleanName`: control characters dropped, whitespace collapsed. */
const cleanName = (s: string) => s.replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();

/** How a key was found; "suggested" and "chosen" come from the remap step (src/remap). */
export type MatchVia = "ref" | "plugin-key" | "name" | "suggested" | "chosen";
export interface Match {
  key: string;
  via: MatchVia;
}

export interface Catalog {
  sensors: Record<string, DataApiValue>;
  byRef: Map<string, string>;
  /** Lower-cased key → key; the Data API's keys are case-insensitive. */
  byLowerKey: Map<string, string>;
  /** HWiNFO keys by display name, in catalog order. */
  hwinfoByName: Map<string, string[]>;
}

export function buildCatalog(sensors: Record<string, DataApiValue>): Catalog {
  const byRef = new Map<string, string>();
  const byLowerKey = new Map<string, string>();
  const hwinfoByName = new Map<string, string[]>();
  for (const [key, v] of Object.entries(sensors)) {
    if (v.ref && !byRef.has(v.ref)) byRef.set(v.ref, key);
    byLowerKey.set(key.toLowerCase(), key);
    if (key.startsWith("hwinfo.") && v.name) {
      const list = hwinfoByName.get(v.name) ?? [];
      list.push(key);
      hwinfoByName.set(v.name, list);
    }
  }
  return { sensors, byRef, byLowerKey, hwinfoByName };
}

export function mapBinding(item: BoundItem, catalog: Catalog): Match | null {
  const ref = bindingRef(item);
  const exact = ref ? catalog.byRef.get(ref) : undefined;
  if (exact) return { key: exact, via: "ref" };

  if (item.SensorType === "Plugin" && item.PluginSensorId) {
    const key = catalog.byLowerKey.get(pluginKey(item.PluginSensorId).toLowerCase());
    if (key) return { key, via: "plugin-key" };
  }

  // InfoPanel re-binds an imported HWiNFO item to the first reading whose
  // NameDefault equals its SensorName (SharedModel.cs import). The Data API
  // names a reading by NameCustom when set, so this is close, not exact.
  if (item.SensorType === "HwInfo" && "HwInfoRemoteIndex" in item && item.SensorName) {
    const prefix = item.HwInfoRemoteIndex >= 0 ? `Remote ${item.HwInfoRemoteIndex}: ` : "";
    const key = catalog.hwinfoByName.get(prefix + cleanName(item.SensorName))?.[0];
    if (key) return { key, via: "name" };
  }
  return null;
}

/**
 * InfoPanel's SensorReading for a Data API value. Plugin tables arrive
 * flattened one row per line; InfoPanel's text for a table is its first row
 * (`PluginTable.ToString`), so a multi-line text keeps its first line.
 */
export function toReading(v: DataApiValue | undefined): SensorReading | null {
  if (!v) return null;
  if (v.value === undefined && v.text !== undefined) {
    return { now: 0, min: 0, max: 0, avg: 0, unit: "", text: v.text.split("\n")[0] };
  }
  return { now: v.value ?? 0, min: v.min ?? 0, max: v.max ?? 0, avg: v.avg ?? 0, unit: fixUnit(v.unit) ?? "" };
}

/** InfoPanel's Data API on this machine. */
export const DATA_API = "http://127.0.0.1:3921";
