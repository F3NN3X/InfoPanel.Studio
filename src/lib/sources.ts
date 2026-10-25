import type { ApiHwinfoDevice, ApiSources } from "@/lib/catalog";
import type { SensorMap } from "@/modules/types";
import { YR_FORECAST_KEY, YR_FORECAST_RE } from "@/lib/sensors";
import { fixUnit } from "@/lib/infopanel/sensors";

/**
 * The studio's view of "sources": every plugin the Data API exposes with
 * its containers and entries, as `/api/sources` names and types them, plus
 * the flat (non-plugin) namespaces — `libre.*`, `hwinfo.*`, `system.*` and
 * pushed sources such as `spotify.*` — from the sensor snapshot.
 */

export interface SourceEntry {
  /** Full sensor key. */
  key: string;
  /** Entry id (last key segment) or the flat remainder. */
  id: string;
  /** Human label (the entry's display name). */
  label: string;
  /** Entry type from `/api/sources` ("sensor", "text", "table", "image"). */
  type?: string;
  value?: number;
  text?: string;
  unit?: string;
}

export interface SourceInfo {
  /** Container id ("" for flat, non-plugin sources). */
  id: string;
  /** Owning plugin id (or the flat namespace). */
  pluginId: string;
  /** Friendly display name for this source. */
  label: string;
  entries: SourceEntry[];
}

export interface PluginGroup {
  id: string;
  name: string;
  sources: SourceInfo[];
}

/** Names for the flat namespaces (the rest are pretty-printed). */
const FLAT_NAMES: Record<string, string> = {
  libre: "LibreHardwareMonitor",
  hwinfo: "HWiNFO",
  system: "System",
};

function pretty(id: string): string {
  return id
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Drop a plugin's leading decorative glyph (e.g. the audio meter's "🎵 "). */
export function cleanName(name: string): string {
  return name.replace(/^\p{Extended_Pictographic}\s*/u, "").trim();
}

const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);

function pluginGroups(sources: ApiSources | null, sensors: SensorMap): PluginGroup[] {
  return (sources?.plugins ?? []).map((plugin) => ({
    id: plugin.id,
    name: plugin.name || pretty(plugin.id),
    sources: plugin.containers
      .map((c) => ({
        id: c.id,
        pluginId: plugin.id,
        label: cleanName(c.name) || c.id,
        entries: c.entries.map((e) => {
          const s = sensors[e.key];
          return {
            key: e.key,
            id: e.id,
            label: e.name || e.id,
            type: e.type,
            value: s?.value,
            text: s?.text,
            unit: fixUnit(s?.unit),
          };
        }),
      }))
      // The audio meter's "default device" container leads its list.
      .sort((a, b) =>
        a.id === "default-audio" ? -1 : b.id === "default-audio" ? 1 : byLabel(a, b)
      ),
  }));
}

function flatEntry(key: string, id: string, s: SensorMap[string]): SourceEntry {
  return {
    key,
    id,
    label: s.name?.trim() || key,
    type: s.value !== undefined ? "sensor" : "text",
    value: s.value,
    text: s.text,
    unit: fixUnit(s.unit),
  };
}

/**
 * HWiNFO by device, in the order the Data API lists them. Readings the tree doesn't name (a build
 * that lists devices but missed some) follow in one "Other" source.
 */
function hwinfoSources(devices: readonly ApiHwinfoDevice[], entries: readonly SourceEntry[]): SourceInfo[] {
  const byKey = new Map(entries.map((e) => [e.key, e]));
  const placed = new Set<string>();
  const out: SourceInfo[] = [];
  for (const device of devices) {
    const own = device.entries.flatMap((e) => {
      const entry = byKey.get(e.key);
      placed.add(e.key);
      return entry ? [entry] : [];
    });
    if (own.length > 0) out.push({ id: device.id, pluginId: "hwinfo", label: device.name, entries: own });
  }
  const rest = entries.filter((e) => !placed.has(e.key)).sort(byLabel);
  if (rest.length > 0) out.push({ id: "other", pluginId: "hwinfo", label: "Other", entries: rest });
  return out;
}

function flatGroups(sensors: SensorMap, devices: readonly ApiHwinfoDevice[] | undefined): PluginGroup[] {
  const byNs = new Map<string, SourceEntry[]>();
  for (const [key, s] of Object.entries(sensors)) {
    if (key.startsWith("plugins.")) continue;
    const dot = key.indexOf(".");
    const ns = dot < 0 ? key : key.slice(0, dot);
    const list = byNs.get(ns) ?? [];
    list.push(flatEntry(key, key.slice(dot + 1), s));
    byNs.set(ns, list);
  }
  return [...byNs].map(([ns, entries]) => {
    const name = FLAT_NAMES[ns] ?? pretty(ns);
    return {
      id: ns,
      name,
      sources:
        ns === "hwinfo" && devices && devices.length > 0
          ? hwinfoSources(devices, entries)
          : [{ id: "", pluginId: ns, label: name, entries: entries.sort(byLabel) }],
    };
  });
}

/** Every source the Data API offers, grouped plugin → container → entry. */
export function groupSources(sources: ApiSources | null, sensors: SensorMap): PluginGroup[] {
  return [...pluginGroups(sources, sensors), ...flatGroups(sensors, sources?.hwinfo)].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

export interface SourceOption {
  value: string;
  label: string;
}

/**
 * Options for a widget's "source" select: "all sources" plus one entry per
 * container of the plugin under `prefix` (`plugins.<id>.`). Used by the
 * schema's dynamic `optionsFrom: "sources"` setting type.
 */
export function sourceOptions(sources: ApiSources | null, prefix: string): SourceOption[] {
  const plugin = sources?.plugins.find((p) => `plugins.${p.id}.` === prefix);
  const containers = pluginGroups(plugin ? { plugins: [plugin] } : null, {})[0]?.sources ?? [];
  return [
    { value: "", label: "All sources" },
    ...containers.map((c) => ({ value: c.id, label: c.label })),
  ];
}

/** One bindable key in the studio's sensor picker. */
export interface PickerOption {
  key: string;
  label: string;
  /** "Plugin › Container" (or the flat namespace's name). */
  where: string;
  type?: string;
  /** Lower-cased text the picker's search matches against. */
  search: string;
}

/**
 * Every bindable key, plugin → container → entry order, plus the
 * yr-forecast placeholder that follows the first configured location.
 */
export function pickerOptions(sources: ApiSources | null, sensors: SensorMap): PickerOption[] {
  const out: PickerOption[] = [];
  for (const group of groupSources(sources, sensors)) {
    for (const source of group.sources) {
      const where = source.id ? `${group.name} › ${source.label}` : group.name;
      for (const e of source.entries) {
        out.push({
          key: e.key,
          label: e.label,
          where,
          type: e.type,
          search: `${e.label} ${where} ${e.key}`.toLowerCase(),
        });
      }
    }
  }
  if (out.some((o) => YR_FORECAST_RE.test(o.key))) {
    const where = "Weather (yr) › first location";
    out.unshift({
      key: YR_FORECAST_KEY,
      label: "Forecast",
      where,
      type: "table",
      search: `forecast ${where} ${YR_FORECAST_KEY}`.toLowerCase(),
    });
  }
  return out;
}
