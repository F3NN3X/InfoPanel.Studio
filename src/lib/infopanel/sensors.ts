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
  table?: { columns: string[]; rows: (string | null)[][] };
}

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
  return { now: v.value ?? 0, min: v.min ?? 0, max: v.max ?? 0, avg: v.avg ?? 0, unit: v.unit ?? "" };
}

/** InfoPanel's Data API on this machine. */
export const DATA_API = "http://127.0.0.1:3921";
