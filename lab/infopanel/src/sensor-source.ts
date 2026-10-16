/**
 * Where the lab's sensor values come from: InfoPanel's unbound output (what the
 * corpus screenshots show), mock values, or the live Data API.
 */
import { useEffect, useRef, useState } from "react";
import { tableOf, type SensorState } from "@/lib/infopanel/render/scene.ts";
import { groupId } from "@/lib/infopanel/remap/remap.ts";
import { buildCatalog, toReading, type BoundItem, type Catalog, type DataApiValue, type Match } from "@/lib/infopanel/sensors.ts";

export const DATA_API = "http://127.0.0.1:3921";
export type SensorMode = "unbound" | "mock" | "live";

const EMPTY = buildCatalog({});
/** InfoPanel keeps 4096 samples per graph. */
const HISTORY = 4096;
const ZEROS: readonly number[] = new Array(HISTORY).fill(0);

export interface Live {
  catalog: Catalog;
  error: string | null;
  /** Numeric samples per Data API key, oldest first, one per poll. */
  history: ReadonlyMap<string, readonly number[]>;
}

export function useLiveCatalog(enabled: boolean): Live {
  const [catalog, setCatalog] = useState<Catalog>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const history = useRef(new Map<string, number[]>());
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const tick = () =>
      fetch(`${DATA_API}/api/sensors`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((s: { sensors: Record<string, DataApiValue> }) => {
          if (stop) return;
          for (const [key, v] of Object.entries(s.sensors)) {
            if (typeof v.value !== "number") continue;
            const list = history.current.get(key) ?? [];
            list.push(v.value);
            if (list.length > HISTORY) list.shift();
            history.current.set(key, list);
          }
          setCatalog(buildCatalog(s.sensors));
          setError(null);
        })
        .catch((e: Error) => !stop && setError(`${DATA_API}: ${e.message}`));
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [enabled]);
  return { catalog, error, history: history.current };
}

export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export interface SourceInput {
  mode: SensorMode;
  live: Live;
  /** Mock value per item. */
  mock: ReadonlyMap<BoundItem, number>;
  /** The live key per binding group (remap.ts `resolveAll`). */
  resolved: ReadonlyMap<string, Match | null>;
}

/** The binding's match in the live catalog, when in live mode. */
export const liveMatch = (item: BoundItem, s: SourceInput): Match | null =>
  s.mode === "live" ? (s.resolved.get(groupId(item)) ?? null) : null;

/** What InfoPanel would read for an item. Unbound: no reading; HWiNFO and Libre graphs still fill with zeros. */
export function sensorState(item: BoundItem, s: SourceInput): SensorState {
  if (s.mode === "mock") {
    const v = s.mock.get(item) ?? 0;
    return { reading: { now: v, min: v, max: v, avg: v, unit: "" }, history: new Array(600).fill(v) };
  }
  const match = liveMatch(item, s);
  if (!match) return { reading: null, history: item.SensorType === "Plugin" ? [] : ZEROS };
  const value = s.live.catalog.sensors[match.key];
  const reading = toReading(value);
  const table = item.kind === "TableSensor" && value ? tableOf(value) : null;
  return { reading, history: s.live.history.get(match.key) ?? [], table };
}
