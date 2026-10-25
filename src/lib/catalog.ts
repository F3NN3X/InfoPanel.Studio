import { useEffect, useSyncExternalStore } from "react";
import { getApiBase, subscribeApiBase } from "@/lib/data-api";
import type { SensorMap } from "@/modules/types";

/**
 * What the Data API currently offers, for the studio's pickers: the plugin
 * tree from `/api/sources` (plugin, container and entry names, entry types)
 * plus one `/api/sensors` snapshot for the values shown beside them.
 * Fetched on demand instead of streamed — the studio's live canvas already
 * streams what it renders.
 */

export interface ApiEntry {
  id: string;
  name: string;
  /** "sensor" | "text" | "table" | "image" (open for future types). */
  type: string;
  key: string;
}

export interface ApiContainer {
  id: string;
  name: string;
  entries: ApiEntry[];
}

export interface ApiPlugin {
  id: string;
  name: string;
  containers: ApiContainer[];
}

/** One HWiNFO device (a sensor group such as "CPU [#0]: AMD Ryzen" or "S.M.A.R.T.: KINGSTON") with its readings. */
export interface ApiHwinfoDevice {
  /** `{remote}/{sensorId}/{instance}`. */
  id: string;
  name: string;
  sensorId: number;
  instance: number;
  remote: number;
  entries: (ApiEntry & { ref: string })[];
}

export interface ApiSources {
  plugins: ApiPlugin[];
  /** HWiNFO's devices; absent from InfoPanel builds that predate it, then HWiNFO is one flat list. */
  hwinfo?: ApiHwinfoDevice[];
}

export interface SensorCatalog {
  sources: ApiSources | null;
  sensors: SensorMap;
  status: "idle" | "loading" | "ready" | "error";
  /** When the last successful fetch finished (ms epoch, 0 = never). */
  fetchedAt: number;
}

const EMPTY: SensorCatalog = { sources: null, sensors: {}, status: "idle", fetchedAt: 0 };
/** A catalog younger than this is reused when a picker mounts. */
const FRESH_MS = 10_000;

let catalog = EMPTY;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: SensorCatalog): void {
  catalog = next;
  for (const listener of listeners) listener();
}

async function load(base: string): Promise<void> {
  set({ ...catalog, status: "loading" });
  try {
    const [sourcesRes, sensorsRes] = await Promise.all([
      fetch(`${base}/api/sources`, { cache: "no-store" }),
      fetch(`${base}/api/sensors`, { cache: "no-store" }),
    ]);
    if (!sourcesRes.ok || !sensorsRes.ok) throw new Error("catalog fetch failed");
    const sources = (await sourcesRes.json()) as ApiSources;
    const snapshot = (await sensorsRes.json()) as { sensors?: SensorMap };
    if (base !== getApiBase()) return; // the URL setting moved on
    set({
      sources: { plugins: sources.plugins ?? [], ...(Array.isArray(sources.hwinfo) ? { hwinfo: sources.hwinfo } : {}) },
      sensors: snapshot.sensors ?? {},
      status: "ready",
      fetchedAt: Date.now(),
    });
  } catch {
    if (base === getApiBase()) set({ ...catalog, status: "error" });
  }
}

/** Re-fetch the catalog (deduplicated while a fetch is running). */
export function refreshCatalog(): Promise<void> {
  if (!inflight) {
    const run: Promise<void> = load(getApiBase()).finally(() => {
      if (inflight === run) inflight = null;
    });
    inflight = run;
  }
  return inflight;
}

subscribeApiBase(() => {
  catalog = EMPTY;
  inflight = null;
  if (listeners.size > 0) void refreshCatalog();
});

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
/** The current catalog (outside React). */
export const getCatalog = (): SensorCatalog => catalog;

/** The catalog, fetched on mount unless a recent copy exists. */
export function useSensorCatalog(): SensorCatalog {
  useEffect(() => {
    if (Date.now() - catalog.fetchedAt > FRESH_MS) void refreshCatalog();
  }, []);
  return useSyncExternalStore(subscribe, getCatalog);
}
