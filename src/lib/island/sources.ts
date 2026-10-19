import type { DashboardModule, ModuleSetting, ModuleSettings } from "@/modules/types";
import { effectiveSettings } from "@/modules/types";
import type { Placement } from "@/lib/layout";
import type { Data } from "@/widgets/core/types";
import type { IslandBus } from "./bus";
import type { IslandActivity, IslandNotice } from "./types";

/**
 * Widgets as island sources. A template opts in with `island` (`TemplateOptions`): it gets a "Send
 * to island" setting (and its own island options), and while a zone of it has that on, the kiosk
 * runs its `derive` on what the widget reads. `derive` is pure: the previous and the new state in,
 * the notices to raise and the current activity out. The first state is a baseline (`prev` null):
 * it may set the activity but raises no notice, so nothing fires on load.
 */

export type SourceNotice = Omit<IslandNotice, "source">;
export type SourceActivity = Omit<IslandActivity, "source">;

export interface IslandUpdate {
  notices?: SourceNotice[];
  /** The activity now (unset or null = none). */
  activity?: SourceActivity | null;
}

export interface SourceBase {
  /** The setting's hint: what reaches the island. */
  hint: string;
  defaultOn: boolean;
  /** The widget's own settings group the "Send to island" toggle joins. */
  group: string;
  /**
   * The source's own options (which notices, a threshold), shown under "Send to island" while it is
   * on. Their keys start with "island" (`isIslandKey`); `derive` reads them from `settings`.
   */
  options?: ModuleSetting[];
}

/** From the sensor map, flattened as the template gets it (`toFlat`). */
export interface DataSourceDef extends SourceBase {
  from: "data";
  /** The key prefixes it reads, when the widget names none of its own (it reads every stream). */
  reads?: string[];
  derive(prev: Data | null, next: Data, settings: ModuleSettings): IslandUpdate;
}

/** A client-side state the source watches (the Wave Link client, the timer, the server extras). */
export interface IslandStore<T> {
  getState(): T;
  /** Calls `fn` with each new state; returns the unsubscribe. */
  subscribe(fn: (state: T) => void): () => void;
}

/** From a client-side store; `watch` runs `derive` over its states (`storeSource`). */
export interface StoreSourceDef extends SourceBase {
  from: "store";
  /** Feeds each update to `emit` until the returned stop is called; `settings` reads the zone's current ones. */
  watch(settings: () => ModuleSettings, emit: (update: IslandUpdate) => void): () => void;
}

export type IslandSourceDef = DataSourceDef | StoreSourceDef;

/** A store source with its `derive` kept (the tests call it). */
export interface StoreSourceOf<T> extends StoreSourceDef {
  derive(prev: T | null, next: T, settings: ModuleSettings): IslandUpdate;
}

/** A store source: `derive` over the store's states, the current one first (the baseline). */
export function storeSource<T>(def: SourceBase & { store: IslandStore<T>; derive(prev: T | null, next: T, settings: ModuleSettings): IslandUpdate }): StoreSourceOf<T> {
  const { store, derive, ...base } = def;
  return {
    ...base,
    derive,
    from: "store",
    watch(settings, emit) {
      let before: T | null = null;
      const run = (state: T) => {
        emit(derive(before, state, settings()));
        before = state;
      };
      const stop = store.subscribe(run);
      run(store.getState());
      return stop;
    },
  };
}

/** The zone setting that sends a widget to the island. */
export const ISLAND_SETTING = "island";

/** Whether a setting key is the island toggle or one of a source's options ("islandApps"). */
export const isIslandKey = (key: string): boolean => key === ISLAND_SETTING || /^island[A-Z]/.test(key);

/** "Send to island" and the source's options, which show only while it is on. */
export function islandSettings(def: IslandSourceDef): ModuleSetting[] {
  const toggle: ModuleSetting = {
    key: ISLAND_SETTING,
    label: "Send to island",
    type: "boolean",
    default: def.defaultOn,
    hint: def.hint,
    group: def.group,
    keywords: ["island", "notch", "notify", "notification"],
  };
  const options = (def.options ?? []).map((o): ModuleSetting => {
    const own = o.visibleIf;
    return { ...o, group: def.group, visibleIf: (v) => v[ISLAND_SETTING] === true && (own?.(v) ?? true) };
  });
  return [toggle, ...options];
}

/** A widget feeding the island: its module (with `island`) and the zone's resolved settings. */
export interface IslandFeed {
  module: DashboardModule & { island: IslandSourceDef };
  settings: ModuleSettings;
}

/**
 * The widgets that feed the island from these zones (every page of the profile): visible zones whose
 * template has a source and whose "Send to island" is on. One per template, the first zone, so two
 * Now Playing zones raise each track once. `resolved` gives a zone's settings under its theme
 * (`resolveWith`; not imported, the registry imports this file); unset: its own.
 */
export function islandFeeds(
  placements: readonly Placement[],
  modules: readonly DashboardModule[],
  resolved: (p: Placement) => ModuleSettings | undefined = (p) => p.settings
): IslandFeed[] {
  const byId = new Map(modules.map((m) => [m.id, m]));
  const feeds = new Map<string, IslandFeed>();
  for (const p of placements) {
    const mod = byId.get(p.module);
    if (!p.visible || !mod?.island || feeds.has(mod.id)) continue;
    const settings = effectiveSettings(mod, resolved(p));
    if (settings[ISLAND_SETTING] !== true) continue;
    feeds.set(mod.id, { module: mod as IslandFeed["module"], settings });
  }
  return [...feeds.values()];
}

/** Hand one update to the bus as `source`: its notices raised, its activity set or cleared. */
export function applyUpdate(bus: IslandBus, source: string, update: IslandUpdate): void {
  for (const n of update.notices ?? []) bus.notify({ ...n, source });
  if (update.activity) bus.setActivity({ ...update.activity, source });
  else bus.clearActivity(source);
}

/** Every prefix a widget reads (`moduleReads`; not imported, the registry imports this file). */
export const readsOf = (mod: DashboardModule): string[] => [...mod.prefixes, ...(mod.reads ?? [])];

/** The prefixes a feed's source reads: its own `reads`, else its widget's. */
export const feedReads = (f: IslandFeed): string[] => (f.module.island.from === "data" && f.module.island.reads?.length ? f.module.island.reads : readsOf(f.module));

/** Whether the data holds a key under any of the prefixes (no prefixes: any key). */
export function hasData(data: Data, prefixes: readonly string[]): boolean {
  const keys = Object.keys(data);
  return prefixes.length === 0 ? keys.length > 0 : keys.some((k) => prefixes.some((p) => k.startsWith(p)));
}

/**
 * One pass of the data sources over the current flat data. `prev` keeps each source's last data (the
 * caller's ref): a source whose keys have not arrived yet is skipped, so its first data is the
 * baseline, not a change from nothing.
 */
export function runDataFeeds(bus: IslandBus, feeds: readonly IslandFeed[], flat: Data, prev: Map<string, Data>): void {
  for (const f of feeds) {
    const def = f.module.island;
    if (def.from !== "data" || !hasData(flat, feedReads(f))) continue;
    applyUpdate(bus, f.module.id, def.derive(prev.get(f.module.id) ?? null, flat, f.settings));
    prev.set(f.module.id, flat);
  }
}
