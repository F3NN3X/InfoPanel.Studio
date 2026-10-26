// Time-stamped, bounded in-memory series for the widgets that look back (frame-time bins, lanes over minutes).
// Memory is bounded per key by `maxCount` (and by `maxAgeMs`), so a store holds at most keys × maxCount samples.
// Samples are taken when the sensor data changes (`useOnData`), never on a timer, so a still dashboard costs nothing.
import { useEffect, useRef, useState } from "react";

export interface Sample {
  /** `Date.now()` of the reading, ms. */
  t: number;
  v: number;
}

export interface SeriesLimits {
  /** Samples older than this are dropped on the next push. */
  maxAgeMs: number;
  /** The most samples one key keeps; the oldest go first. */
  maxCount: number;
  /** A reading closer than this to the key's last one is skipped (a fast feed does not fill the count). */
  minGapMs: number;
}

/** Ten minutes at one reading per second (600 samples a key: about 25 KB). */
export const DEFAULT_LIMITS: SeriesLimits = { maxAgeMs: 10 * 60_000, maxCount: 600, minGapMs: 1000 };

/** Bounded series per key. Mutates in place on push: it is a buffer, and a render reads it, never holds it. */
export class SeriesStore {
  private readonly series = new Map<string, Sample[]>();

  constructor(public limits: SeriesLimits = DEFAULT_LIMITS) {}

  /** Record `v` for `key` at `t`; false when it was skipped (not finite, out of order, or inside the minimum gap). */
  push(key: string, v: number, t: number): boolean {
    if (!Number.isFinite(v)) return false;
    const list = this.series.get(key) ?? [];
    const last = list[list.length - 1];
    if (last && t - last.t < this.limits.minGapMs) return false;
    list.push({ t, v });
    const cut = list.findIndex((s) => t - s.t <= this.limits.maxAgeMs);
    const drop = Math.max(cut === -1 ? list.length : cut, list.length - this.limits.maxCount);
    if (drop > 0) list.splice(0, drop);
    this.series.set(key, list);
    return true;
  }

  /** The key's samples, oldest first; empty when there are none. */
  read(key: string): readonly Sample[] {
    return this.series.get(key) ?? [];
  }

  /** Free every series whose key is not in `keep` (a sensor the user unpicked). */
  retain(keep: readonly string[]): void {
    for (const k of [...this.series.keys()]) if (!keep.includes(k)) this.series.delete(k);
  }

  /** Samples held across all keys. */
  get size(): number {
    let n = 0;
    for (const l of this.series.values()) n += l.length;
    return n;
  }

  clear(): void {
    this.series.clear();
  }
}

/**
 * Run `fn(now)` once for each new `data` object (the sensors changed), during render like `useHistory`:
 * a re-render for another reason (a resize, a setting) does not record again.
 */
export function useOnData(data: object, fn: (now: number) => void): void {
  const last = useRef<object | null>(null);
  if (last.current !== data) {
    last.current = data;
    fn(Date.now());
  }
}

/**
 * One bounded store for the zone, filled with `values` (a reading per key) whenever the sensors change and
 * freed when the zone unmounts. It keeps no timer, and survives neither a reload nor an unmount.
 */
export function useSeries(data: object, values: Readonly<Record<string, number>>, limits: SeriesLimits = DEFAULT_LIMITS): SeriesStore {
  const [store] = useState(() => new SeriesStore(limits));
  store.limits = limits;
  useOnData(data, (now) => {
    for (const [k, v] of Object.entries(values)) store.push(k, v, now);
  });
  useEffect(() => () => store.clear(), [store]);
  return store;
}
