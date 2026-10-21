import type { DataModel } from "@/lib/data-points";
import { PANEL_ID, type DashboardConfig, type MonitorProfile, type Placement, type ProfileView } from "@/lib/layout";
import { allPlacements, mapPlacements } from "@/lib/pages";
import type { Widget } from "@/lib/panel-model";
import type { DashboardModule, ModuleSetting } from "@/modules/types";

/**
 * Which zones use which data points ("Used by" in the Data Explorer, "Bound
 * data" in the inspector), derived from the config, plus the writes behind
 * Bind / Unbind. Nothing here stores a new field: binding writes the
 * settings and widget fields the zones already read.
 *
 * How a zone claims keys:
 * - Panel zone: each panel widget claims its `sensor` and `subSensor`.
 * - Widget zone: the module's owned `prefixes` — narrowed to one container
 *   when the module's `optionsFrom: "sources"` setting for that plugin is
 *   set (e.g. the audio meter's `source`). A set source setting on a plugin
 *   the module only `reads` (the media widget's `liveSource`) claims that
 *   container too. `reads` alone claim nothing, and a module with no
 *   prefixes (Wave Link, web page) claims nothing.
 * - The generic "cards" zone renders whatever no module owns; that is not a
 *   binding, so it claims nothing.
 */

export type ModuleInfo = Pick<DashboardModule, "id" | "title" | "prefixes" | "settings">;

export interface Usage {
  zoneId: string;
  /** Set when the claim comes from one widget of a panel zone. */
  panelWidgetId?: string;
  /** "Panel › Widget" for panels, the module's title for widget zones. */
  label: string;
}

export interface UsageIndex {
  byKey: Map<string, Usage[]>;
  /** Zone → the keys it uses (the inspector's "Bound data"). */
  byZone: Map<string, string[]>;
}

/** Settings that pick a container of a plugin (`optionsFrom: "sources"`). */
const sourceSettings = (mod: ModuleInfo): ModuleSetting[] =>
  (mod.settings ?? []).filter((d) => d.optionsFrom === "sources" && d.sourcePlugin);

const splitList = (value: unknown): string[] =>
  typeof value === "string" ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];

/** The key prefixes a widget zone claims (see the module comment). */
export function claimedPrefixes(pl: Placement, mod: ModuleInfo): string[] {
  const narrowed = (plugin: string): string[] =>
    sourceSettings(mod)
      .filter((d) => d.sourcePlugin === plugin)
      .flatMap((d) => splitList(pl.settings?.[d.key] ?? d.default))
      .map((container) => `${plugin}${container}.`);

  const owned = mod.prefixes.flatMap((prefix) => {
    const containers = narrowed(prefix);
    return containers.length > 0 ? containers : [prefix];
  });
  const read = [...new Set(sourceSettings(mod).map((d) => d.sourcePlugin as string))]
    .filter((plugin) => !mod.prefixes.includes(plugin))
    .flatMap(narrowed);
  return [...owned, ...read];
}

const widgetLabel = (w: Widget): string => w.label?.trim() || w.kind;

/**
 * Index the profile's zones (every page of a stored profile, or the one page
 * of a view) by the keys they use. Only keys in `keys` (the
 * explorer's points) are indexed; a zone hidden in the profile still counts.
 */
export function computeUsage(
  profile: MonitorProfile | ProfileView,
  keys: readonly string[],
  mods: readonly ModuleInfo[]
): UsageIndex {
  const byKey = new Map<string, Usage[]>();
  const zoneKeys = new Map<string, Set<string>>();
  const add = (key: string, usage: Usage) => {
    byKey.set(key, [...(byKey.get(key) ?? []), usage]);
    const set = zoneKeys.get(usage.zoneId) ?? new Set<string>();
    set.add(key);
    zoneKeys.set(usage.zoneId, set);
  };
  const keySet = new Set(keys);

  for (const pl of "pages" in profile ? allPlacements(profile) : profile.placements) {
    if (pl.module === PANEL_ID && pl.panel) {
      for (const w of pl.panel.widgets) {
        const label = `${pl.panel.title} › ${widgetLabel(w)}`;
        const bound = new Set([w.sensor, w.subSensor].filter((k): k is string => !!k));
        for (const key of bound) {
          if (keySet.has(key)) add(key, { zoneId: pl.id, panelWidgetId: w.id, label });
        }
      }
      continue;
    }
    const mod = mods.find((m) => m.id === pl.module);
    if (!mod) continue;
    const prefixes = claimedPrefixes(pl, mod);
    if (prefixes.length === 0) continue;
    for (const key of keys) {
      if (prefixes.some((p) => key.startsWith(p))) add(key, { zoneId: pl.id, label: mod.title });
    }
  }
  return { byKey, byZone: new Map([...zoneKeys].map(([zone, set]) => [zone, [...set]])) };
}

/** Rewrite one zone of the config; the same config comes back if `fn` changes nothing. */
function updateZone(
  config: DashboardConfig,
  zoneId: string,
  fn: (pl: Placement) => Placement
): DashboardConfig {
  let changed = false;
  const profiles = config.profiles.map((profile) => {
    const next = mapPlacements(profile, (pl) => (pl.id === zoneId ? fn(pl) : pl));
    if (next !== profile) changed = true;
    return next;
  });
  return changed ? { ...config, profiles } : config;
}

/** The `sensor`-bearing kinds; a clock or shape reads no data point. */
const bindable = (w: Widget): boolean => w.kind !== "clock" && w.kind !== "shape";

function mapWidget(pl: Placement, widgetId: string, fn: (w: Widget) => Widget): Placement {
  if (!pl.panel) return pl;
  const widgets = pl.panel.widgets.map((w) => (w.id === widgetId ? fn(w) : w));
  const changed = widgets.some((w, i) => w !== pl.panel!.widgets[i]);
  return changed ? { ...pl, panel: { ...pl.panel, widgets } } : pl;
}

/** The source setting a widget zone binds `key` through, and the container it names. */
function sourceBinding(
  mod: ModuleInfo,
  key: string,
  model?: DataModel
): { def: ModuleSetting; container: string } | null {
  const def = sourceSettings(mod).find((d) => key.startsWith(d.sourcePlugin as string));
  if (!def) return null;
  // Container ids may contain dots, so prefer the catalog's own id over splitting the key.
  const container =
    model?.byKey.get(key)?.containerRawId ?? key.slice((def.sourcePlugin as string).length).split(".")[0];
  return container ? { def, container } : null;
}

/**
 * Bind a data point to a zone by writing the field the zone already reads.
 *
 * - Panel zone: sets the chosen panel widget's `sensor`. `panelWidgetId` is
 *   required; clocks and shapes read no data and are left alone.
 * - Widget zone: a module can only be bound to a *container*, never to a
 *   single key. When the module has a source select for the key's plugin
 *   (`optionsFrom: "sources"`), the setting is set to the key's container (a
 *   `multiple` one gains it in its comma-separated list). Any other module
 *   has no per-key binding and the config comes back unchanged.
 */
export function bindPoint(
  config: DashboardConfig,
  zoneId: string,
  panelWidgetId: string | undefined,
  key: string,
  mods: readonly ModuleInfo[] = [],
  model?: DataModel
): DashboardConfig {
  return updateZone(config, zoneId, (pl) => {
    if (pl.module === PANEL_ID) {
      if (!panelWidgetId) return pl;
      return mapWidget(pl, panelWidgetId, (w) =>
        bindable(w) && w.sensor !== key ? { ...w, sensor: key } : w
      );
    }
    const mod = mods.find((m) => m.id === pl.module);
    const binding = mod && sourceBinding(mod, key, model);
    if (!binding) return pl;
    const { def, container } = binding;
    const current = splitList(pl.settings?.[def.key] ?? def.default);
    const next = def.multiple ? [...new Set([...current, container])].join(",") : container;
    if (pl.settings?.[def.key] === next) return pl;
    return { ...pl, settings: { ...pl.settings, [def.key]: next } };
  });
}

/**
 * Undo `bindPoint`: clears the panel widget's `sensor` / `subSensor` when it
 * holds `key`, or resets a widget zone's source setting (a `multiple` one
 * drops just that container). Unrelated bindings are left as they are.
 */
export function unbindPoint(
  config: DashboardConfig,
  zoneId: string,
  panelWidgetId: string | undefined,
  key: string,
  mods: readonly ModuleInfo[] = [],
  model?: DataModel
): DashboardConfig {
  return updateZone(config, zoneId, (pl) => {
    if (pl.module === PANEL_ID) {
      if (!panelWidgetId) return pl;
      return mapWidget(pl, panelWidgetId, (w) => {
        if (w.sensor !== key && w.subSensor !== key) return w;
        const { sensor, subSensor, ...rest } = w;
        return {
          ...rest,
          ...(sensor !== key && { sensor }),
          ...(subSensor !== key && { subSensor }),
        };
      });
    }
    const mod = mods.find((m) => m.id === pl.module);
    const binding = mod && sourceBinding(mod, key, model);
    if (!binding) return pl;
    const { def, container } = binding;
    const current = splitList(pl.settings?.[def.key] ?? def.default);
    if (!current.includes(container)) return pl;
    const next = current.filter((c) => c !== container).join(",");
    return { ...pl, settings: { ...pl.settings, [def.key]: next } };
  });
}

/**
 * The screens that use each of `keys`: name per profile, in the config's order. A point nothing
 * uses has no entry. Pages count as part of their screen.
 */
export function screensUsing(profiles: readonly MonitorProfile[], keys: readonly string[], mods: readonly ModuleInfo[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const profile of profiles) {
    for (const key of computeUsage(profile, keys, mods).byKey.keys()) out.set(key, [...(out.get(key) ?? []), profile.name]);
  }
  return out;
}
