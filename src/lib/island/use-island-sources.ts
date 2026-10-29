import { useEffect, useMemo, useRef } from "react";
import { useSensors, useSensorsConnected } from "@/hooks/useSensors";
import { withHwinfoAliases } from "@/lib/hwinfo-aliases";
import { toFlat } from "@/widgets/data-adapter";
import type { Data } from "@/widgets/core/types";
import type { BusClock, IslandBus } from "./bus";
import { applyUpdate, feedReads, runDataFeeds, type IslandFeed } from "./sources";
import { createConnectionWatch } from "./system";

const realClock: BusClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

const NO_PREFIXES: readonly string[] = [];

/**
 * Runs the widgets' island sources on the kiosk: one `useSensors` over the prefixes of every data
 * source (the shared streams; no stream per widget) and a watch per store source. `feeds` empty or
 * `enabled` false runs nothing and opens nothing.
 */
export function useIslandSources(bus: IslandBus, feeds: readonly IslandFeed[], enabled: boolean): void {
  const data = enabled ? feeds.filter((f) => f.module.island.from === "data") : [];
  // A source naming no prefixes reads every stream; else only the union of theirs.
  const prefixes = useMemo(
    () => (data.some((f) => feedReads(f).length === 0) ? null : [...new Set(data.flatMap(feedReads))].sort()),
    // Keyed by the widget ids: a new feeds array with the same widgets keeps the subscription.
    [data.map((f) => f.module.id).join()]
  );
  const sensors = useSensors(prefixes === null ? null : prefixes.length > 0 ? prefixes : NO_PREFIXES);
  const prev = useRef(new Map<string, Data>());

  // Once per new reading, not per render: a source that repeats a notice while a condition holds (low
  // FPS) would otherwise re-render the island, and so run itself again, without end.
  const dataFeeds = useRef(data);
  dataFeeds.current = data;
  const ids = data.map((f) => f.module.id).join();
  useEffect(() => runDataFeeds(bus, dataFeeds.current, toFlat(withHwinfoAliases(sensors)), prev.current), [bus, sensors, ids]);

  useEffect(() => {
    const seen = prev.current;
    return () => {
      for (const id of ids.split(",").filter(Boolean)) {
        bus.clearActivity(id);
        seen.delete(id);
      }
    };
  }, [bus, ids]);

  // Store sources (Wave Link, the timer, the server extras): one watch each, restarted only when the
  // set of widgets changes; their settings are read through the ref so an edit needs no restart.
  const stores = enabled ? feeds.filter((f) => f.module.island.from === "store") : [];
  const storeSettings = useRef(new Map<string, IslandFeed["settings"]>());
  storeSettings.current = new Map(stores.map((f) => [f.module.id, f.settings]));
  const storeIds = stores.map((f) => f.module.id).join();
  const storeFeeds = useRef(stores);
  storeFeeds.current = stores;
  useEffect(() => {
    const stops = storeFeeds.current.flatMap((f) => {
      const def = f.module.island;
      if (def.from !== "store") return [];
      const id = f.module.id;
      const stop = def.watch(
        () => storeSettings.current.get(id) ?? {},
        (update) => applyUpdate(bus, id, update)
      );
      return [
        () => {
          stop();
          bus.clearActivity(id);
        },
      ];
    });
    return () => stops.forEach((stop) => stop());
  }, [bus, storeIds]);
}

/** The Data API disconnect warning on the island (`system.ts`), while `enabled`. */
export function useConnectionNotice(bus: IslandBus, enabled: boolean): void {
  const connected = useSensorsConnected();
  const watch = useRef<ReturnType<typeof createConnectionWatch> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const w = createConnectionWatch(bus, realClock);
    watch.current = w;
    return () => {
      w.stop();
      watch.current = null;
    };
  }, [bus, enabled]);
  useEffect(() => watch.current?.update(connected), [connected, enabled]);
}
