// Design preview data (Settings › Studio, and Settings › General › Window in the app): the Design canvas shows live
// sensor values, or a snapshot of them with continuous effects stopped. A frozen canvas opens no Data API stream of
// its own; the store's reference counting closes the page's streams once nothing live (the Data view, a sensor
// picker, an alert preview) is open. Kiosks, and the studio's Kiosk view, are always live.
import { getApiBase } from "@/lib/data-api";
import { sensorStore } from "@/lib/sensor-store";
import type { SensorMap } from "@/modules/types";

import type { SessionOverride } from "@/lib/preview-data-pref";

export * from "@/lib/preview-data-pref";

/** How long to wait for the first complete sample before showing "No data yet". */
export const SNAPSHOT_TIMEOUT_MS = 5000;

export interface SnapshotState {
  /** The values the canvas renders (empty until taken). */
  values: SensorMap;
  /** When the snapshot was taken (epoch ms), null before. */
  takenAt: number | null;
  status: "idle" | "loading" | "ready" | "empty";
}

export interface SnapshotDeps {
  /** The page's current live values (the sensor store's). */
  current: () => SensorMap;
  /** The Data API's complete map (`GET /api/sensors`), or null when it can't be read in time. */
  fetchAll: () => Promise<SensorMap | null>;
  now: () => number;
}

async function fetchAllSensors(): Promise<SensorMap | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), SNAPSHOT_TIMEOUT_MS);
  try {
    const res = await fetch(`${getApiBase()}/api/sensors`, { cache: "no-store", signal: ctl.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { sensors?: SensorMap };
    return data.sensors ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const DEFAULT_DEPS: SnapshotDeps = { current: () => sensorStore.getValues(), fetchAll: fetchAllSensors, now: () => Date.now() };

/**
 * The frozen canvas's values. `take()` snapshots the page's current values merged over one complete read of the
 * Data API (so a zone the streams never carried still has its value); `ensure(keys)` adds sensors a newly bound zone
 * reads, once each, without moving the others.
 */
export class PreviewSnapshot {
  private state: SnapshotState = { values: {}, takenAt: null, status: "idle" };
  private readonly listeners = new Set<() => void>();
  private taking: Promise<void> | null = null;
  private readonly asked = new Set<string>();
  private filling: Promise<void> | null = null;

  constructor(private readonly deps: SnapshotDeps = DEFAULT_DEPS) {}

  getState = (): SnapshotState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  private set(next: SnapshotState): void {
    this.state = next;
    for (const l of this.listeners) l();
  }

  /** A new snapshot (entering frozen, or Refresh). */
  take(): Promise<void> {
    if (this.taking) return this.taking;
    this.set({ ...this.state, status: "loading" });
    this.taking = (async () => {
      const fetched = await this.deps.fetchAll();
      const values = { ...(fetched ?? {}), ...this.deps.current() };
      this.asked.clear();
      this.set({ values, takenAt: this.deps.now(), status: Object.keys(values).length > 0 ? "ready" : "empty" });
    })().finally(() => {
      this.taking = null;
    });
    return this.taking;
  }

  /** Whether the snapshot has `prefix`: the key itself, or any key under it (`useSensors` reads by prefix). */
  private has(prefix: string): boolean {
    return prefix in this.state.values || Object.keys(this.state.values).some((k) => k.startsWith(prefix));
  }

  /**
   * Adds what the snapshot lacks for `prefixes` (keys or namespaces; one Data API read for all of them), each asked
   * for once per snapshot.
   */
  ensure(prefixes: readonly string[]): void {
    const missing = prefixes.filter((p) => !this.asked.has(p) && !this.has(p));
    if (missing.length === 0 || this.state.takenAt === null) return;
    for (const k of missing) this.asked.add(k);
    if (this.filling) return;
    this.filling = (async () => {
      // Let a batch of zones mounting together ask in one read.
      await Promise.resolve();
      const fetched = await this.deps.fetchAll();
      const add: SensorMap = {};
      for (const [k, v] of Object.entries(fetched ?? {})) if (!(k in this.state.values)) add[k] = v;
      if (Object.keys(add).length > 0) this.set({ ...this.state, values: { ...this.state.values, ...add }, status: "ready" });
    })().finally(() => {
      this.filling = null;
    });
  }
}

/** The page's one snapshot (the Design canvas). */
export const previewSnapshot = new PreviewSnapshot();

/** The session override, shared by the zoom bar's chip, the shortcut and the command palette. */
let session: SessionOverride = null;
const sessionListeners = new Set<() => void>();
export const getSessionOverride = (): SessionOverride => session;
export function setSessionOverride(next: SessionOverride): void {
  if (next === session) return;
  session = next;
  for (const l of sessionListeners) l();
}
export function subscribeSessionOverride(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => void sessionListeners.delete(listener);
}
