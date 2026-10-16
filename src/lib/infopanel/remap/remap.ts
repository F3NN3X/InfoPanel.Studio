/**
 * Sensor remapping (L2): bound items grouped by the sensor they name, each
 * group resolved to a Data API key, and ranked suggestions for groups the
 * automatic mapping leaves open.
 *
 * Resolution order per group: the user's choice, then `mapBinding` (exact ref,
 * plugin key, HWiNFO name), then the one strong suggestion when exactly one
 * candidate is strong. Suggestions are flagged so the remap step asks for a
 * confirmation; they are never silently final.
 */
import type { DisplayItem } from "../schema.ts";
import { bindingRef, isBound, mapBinding, type BoundItem, type Catalog, type Match } from "../sensors.ts";

/** Items that read the same sensor. */
export interface Group {
  id: string;
  type: BoundItem["SensorType"];
  /** The binding as the Data API's ref writes it, when the item names one. */
  ref: string | null;
  sensorName: string;
  /** Tree paths ("2.0") of the items, in tree order. */
  paths: string[];
  /** The first item, standing for the group when mapping. */
  item: BoundItem;
}

/** `""` leaves the group unbound on purpose. */
export type Overrides = ReadonlyMap<string, string>;

export type Status = "exact" | "name" | "suggested" | "chosen" | "unbound" | "unresolved";

export function groupId(item: BoundItem): string {
  return `${bindingRef(item) ?? item.SensorType}|${item.SensorName}`;
}

export function groupBindings(items: DisplayItem[]): Group[] {
  const groups = new Map<string, Group>();
  const walk = (list: DisplayItem[], prefix: string) =>
    list.forEach((item, i) => {
      const path = prefix ? `${prefix}.${i}` : String(i);
      if (isBound(item)) {
        const id = groupId(item);
        const g = groups.get(id);
        if (g) g.paths.push(path);
        else groups.set(id, { id, type: item.SensorType, ref: bindingRef(item), sensorName: item.SensorName, paths: [path], item });
      }
      if (item.kind === "Group") walk(item.DisplayItems, path);
    });
  walk(items, "");
  return [...groups.values()];
}

const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9%]+/).filter(Boolean);

/** Libre identifier parts: "/gpu-amd/2/temperature/0" → family gpu, type temperature, index 0. */
function libreParts(ref: string | null | undefined) {
  if (!ref?.startsWith("libre:/")) return null;
  const segs = ref.slice(7).split("/");
  if (segs.length < 3) return null;
  const cls = segs[0].toLowerCase();
  const family = cls.startsWith("gpu")
    ? "gpu"
    : cls.endsWith("cpu")
      ? "cpu"
      : ["nvme", "ssd", "hdd"].includes(cls)
        ? "storage"
        : ["memory", "ram"].includes(cls)
          ? "memory"
          : cls;
  return { family, type: segs[segs.length - 2], index: segs[segs.length - 1] };
}

/** Plugin id parts: "/fps-plugin/fps/fps" → plugin, group, reading. */
function pluginParts(ref: string | null | undefined) {
  if (!ref?.startsWith("plugin:/")) return null;
  const segs = ref.slice(8).toLowerCase().split("/");
  return { plugin: segs[0], group: segs.slice(1, -1).join("/"), reading: segs[segs.length - 1] };
}

interface Indexed {
  key: string;
  name: string;
  tokens: Set<string>;
  libre: ReturnType<typeof libreParts>;
  plugin: ReturnType<typeof pluginParts>;
}

/** Candidate features, computed once per set of keys. */
export interface CatalogIndex {
  catalog: Catalog;
  entries: Indexed[];
}

export function indexCatalog(catalog: Catalog): CatalogIndex {
  const entries = Object.entries(catalog.sensors).map(([key, v]) => ({
    key,
    name: v.name ?? "",
    tokens: new Set([...tokens(v.name ?? ""), ...tokens(key.replace(/^[^.]+\./, ""))]),
    libre: libreParts(v.ref),
    plugin: pluginParts(v.ref),
  }));
  return { catalog, entries };
}

export interface Candidate {
  key: string;
  score: number;
  /** Close enough to pre-fill when it is the only strong one. */
  strong: boolean;
}

function score(g: Group, c: Indexed): Candidate | null {
  const want = tokens(g.sensorName);
  const overlap = want.length ? want.filter((t) => c.tokens.has(t)).length / want.length : 0;
  const name = c.name.toLowerCase();
  const sensor = g.sensorName.toLowerCase().trim();
  const tail = sensor !== "" && (name === sensor || name.endsWith(" " + sensor));
  let s = 3 * overlap + (tail ? 2 : 0);
  let strong = false;

  const lib = libreParts(g.ref);
  if (lib && c.libre) {
    // A Libre reading only stands in for one of the same type (a clock is no temperature).
    if (lib.type !== c.libre.type) return null;
    const family = lib.family === c.libre.family;
    s += 2 + (family ? 2 : 0) + (lib.index === c.libre.index ? 0.5 : 0);
    strong = family && tail;
  }
  const plug = pluginParts(g.ref);
  if (plug && c.plugin) {
    const same = plug.plugin === c.plugin.plugin;
    const reading = plug.reading === c.plugin.reading;
    s += (same ? 3 : 0) + (reading ? 3 : 0) + (plug.group === c.plugin.group ? 1 : 0);
    strong = same && reading;
  }
  return s > 0 ? { key: c.key, score: Math.round(s * 100) / 100, strong } : null;
}

/** Candidates for a group, best first. */
export function suggest(g: Group, index: CatalogIndex, limit = 8): Candidate[] {
  return index.entries
    .map((c) => score(g, c))
    .filter((c): c is Candidate => c !== null)
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .slice(0, limit);
}

/**
 * Keys whose key, name or ref hold every word of the query. For a group, the
 * ones that would suit it come first (a fan's speed before its control %).
 */
export function search(index: CatalogIndex, query: string, limit = 50, group?: Group): string[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = index.entries.filter((c) => {
    const hay = `${c.key} ${c.name} ${index.catalog.sensors[c.key].ref ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const ranked = group
    ? hits.map((c) => ({ c, s: score(group, c)?.score ?? -1 })).sort((a, b) => b.s - a.s).map(({ c }) => c)
    : hits;
  return ranked.slice(0, limit).map((c) => c.key);
}

export function resolveGroup(g: Group, index: CatalogIndex, overrides: Overrides): Match | null {
  const chosen = overrides.get(g.id);
  if (chosen !== undefined) return chosen === "" ? null : { key: chosen, via: "chosen" };
  const auto = mapBinding(g.item, index.catalog);
  if (auto) return auto;
  const strong = suggest(g, index, 50).filter((c) => c.strong);
  return strong.length === 1 ? { key: strong[0].key, via: "suggested" } : null;
}

export function resolveAll(groups: Group[], index: CatalogIndex, overrides: Overrides): Map<string, Match | null> {
  return new Map(groups.map((g) => [g.id, resolveGroup(g, index, overrides)]));
}

export function statusOf(g: Group, match: Match | null, overrides: Overrides): Status {
  if (overrides.get(g.id) === "") return "unbound";
  if (!match) return "unresolved";
  if (match.via === "ref" || match.via === "plugin-key") return "exact";
  return match.via;
}

/** Groups the remap step asks about. */
export const needsAttention = (s: Status) => s === "name" || s === "suggested" || s === "unresolved";
