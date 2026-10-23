import type { SensorMap } from "@/modules/types";
import { getApiBase, subscribeApiBase } from "@/lib/data-api";
import { wakeTicker } from "@/lib/ticker";
import {
  mergeEvent,
  namespaceOf,
  planStreams,
  type StreamEvent,
} from "@/lib/sensor-stream";

/**
 * The page's one connection to the Data API's sensor values.
 *
 * Instead of the 1 s full snapshot (`/events`, ~130 KB a message), it opens
 * a filtered change stream (`/events?prefix=…`) per namespace the mounted
 * widgets read, merges the deltas into one map, and tells subscribers which
 * keys changed — so a widget only re-renders when its own data moves.
 * Namespaces are reference-counted: a stream opens with its first reader and
 * closes shortly after its last one goes.
 */

let openSources = 0;

/** Count an EventSource until it is closed (the studio's leak check reads the total). */
export function trackEventSource<T extends { close(): void }>(source: T): T {
  openSources += 1;
  const close = source.close.bind(source);
  let closed = false;
  source.close = () => {
    if (!closed) {
      closed = true;
      openSources -= 1;
    }
    close();
  };
  return source;
}

/** EventSources currently open across the sensor, config, control and extras streams. */
export const openEventSourceCount = (): number => openSources;

/** Change-stream cadence; the plugins themselves update about once a second. */
export const STREAM_INTERVAL_MS = 1000;
/** Fast-stream cadence: the audio meter updates every 50 ms; the Data API's minimum is 100 ms. */
export const FAST_INTERVAL_MS = 100;
/**
 * Sensor streams per page; Wave Link holds one more of the six per origin. A fast stream takes one of
 * these, so a connection always stays free for `/api/sensors`.
 */
export const MAX_STREAMS = 4;
/** A released namespace stays open this long, so a re-mount reuses it. */
const CLOSE_DELAY_MS = 2000;
/** Retry delay after the server refused a stream (EventSource gave up). */
const RETRY_MS = 5000;
/** "Every sensor" re-lists the sources this often, catching late starters. */
const REDISCOVER_MS = 30_000;
/** Namespaces "every sensor" opens before `/api/sensors` lists the rest. */
const BASE_NAMESPACES = ["plugins.", "libre.", "system."];

/** Map-key marker of a fast stream (a prefix never starts with it). */
const FAST = "fast:";
const fastKey = (prefix: string) => FAST + prefix;

const OPEN = 1;
const CLOSED = 2;

/** The slice of EventSource the store uses (a fake in tests). */
export interface StreamLike {
  readyState: number;
  onopen: ((ev: Event) => unknown) | null;
  onmessage: ((ev: MessageEvent<string>) => unknown) | null;
  onerror: ((ev: Event) => unknown) | null;
  close(): void;
}

export type StreamFactory = (url: string) => StreamLike;
export type ChangeListener = (changed: readonly string[]) => void;

interface Stream {
  prefix: string;
  interval: number;
  source: StreamLike;
  /** The next message is the full set under `prefix`. */
  fresh: boolean;
  retry?: ReturnType<typeof setTimeout>;
}

export class SensorStore {
  private values: SensorMap = {};
  private timestamp = 0;
  /** True while every wanted stream is open (vacuously so with none). */
  private connected = true;
  private readonly refs = new Map<string, number>();
  /** Prefixes streamed at `FAST_INTERVAL_MS` (the visualiser's audio levels and spectrum). */
  private readonly fastRefs = new Map<string, number>();
  private allRefs = 0;
  private discovered: string[] = [];
  private readonly streams = new Map<string, Stream>();
  private readonly listeners = new Set<ChangeListener>();
  private readonly statusListeners = new Set<() => void>();
  private readonly tickListeners = new Set<() => void>();
  private closeTimer: ReturnType<typeof setTimeout> | undefined;
  private syncQueued = false;
  private discoverTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private base: string,
    private readonly connect: StreamFactory = (url) => trackEventSource(new EventSource(url)),
    private readonly load: typeof fetch = (...args) => fetch(...args)
  ) {}

  getValues = (): SensorMap => this.values;
  getTimestamp = (): number => this.timestamp;
  isConnected = (): boolean => this.connected;
  /** Open stream prefixes (diagnostics and tests). */
  openStreams = (): string[] => [...this.streams.keys()].sort();

  subscribe = (listener: ChangeListener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  subscribeStatus = (listener: () => void): (() => void) => {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  };

  /** Called on every message, changed or not (the header's last-update time). */
  subscribeTick = (listener: () => void): (() => void) => {
    this.tickListeners.add(listener);
    return () => {
      this.tickListeners.delete(listener);
    };
  };

  /**
   * Keep the streams for these key prefixes open until the returned
   * release is called. `null` means every sensor.
   */
  retain(prefixes: readonly string[] | null): () => void {
    const namespaces = prefixes === null ? null : [...new Set(prefixes.map(namespaceOf))];
    if (namespaces === null) {
      if (++this.allRefs === 1) void this.discover();
    } else {
      for (const ns of namespaces) this.refs.set(ns, (this.refs.get(ns) ?? 0) + 1);
    }
    this.queueSync();

    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (namespaces === null) {
        if (--this.allRefs === 0) clearTimeout(this.discoverTimer);
      } else {
        for (const ns of namespaces) {
          const n = (this.refs.get(ns) ?? 0) - 1;
          if (n > 0) this.refs.set(ns, n);
          else this.refs.delete(ns);
        }
      }
      this.queueSync();
    };
  }

  /**
   * Keep a dedicated `FAST_INTERVAL_MS` stream open for this prefix until the returned release is
   * called. Its values land in the same map, so `useSensors` readers see them at the faster rate.
   */
  retainFast(prefix: string): () => void {
    this.fastRefs.set(prefix, (this.fastRefs.get(prefix) ?? 0) + 1);
    this.queueSync();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const n = (this.fastRefs.get(prefix) ?? 0) - 1;
      if (n > 0) this.fastRefs.set(prefix, n);
      else this.fastRefs.delete(prefix);
      this.queueSync();
    };
  }

  /** Point every stream at a new Data API base, dropping the old values. */
  setBase(base: string): void {
    if (base === this.base) return;
    this.base = base;
    for (const stream of this.streams.values()) this.dispose(stream);
    this.streams.clear();
    const old = Object.keys(this.values);
    this.values = {};
    this.timestamp = 0;
    this.discovered = [];
    clearTimeout(this.discoverTimer);
    this.emit(old);
    this.updateStatus();
    if (this.allRefs > 0) void this.discover();
    this.sync();
  }

  /** Stream keys: a planned prefix as is, a fast one as `fastKey(prefix)`. */
  private wantedPlan(): string[] {
    const wanted = new Set(this.refs.keys());
    if (this.allRefs > 0) {
      for (const ns of BASE_NAMESPACES) wanted.add(ns);
      for (const ns of this.discovered) wanted.add(ns);
    }
    const fast = [...this.fastRefs.keys()];
    // a namespace the fast stream already covers needs no slow stream
    for (const prefix of fast) wanted.delete(prefix);
    return [...planStreams(wanted, Math.max(1, MAX_STREAMS - fast.length)), ...fast.map(fastKey)];
  }

  /**
   * Plan once per batch of retains: a grid mounts all its zones in one
   * commit, and planning per zone would open streams it then folds away.
   */
  private queueSync(): void {
    if (this.syncQueued) return;
    this.syncQueued = true;
    queueMicrotask(() => {
      this.syncQueued = false;
      this.sync();
    });
  }

  /** Open newly wanted streams now; close unwanted ones after a grace delay. */
  private sync(): void {
    const plan = this.wantedPlan();
    for (const key of plan) {
      if (!this.streams.has(key)) this.open(key);
    }
    if (plan.length < this.streams.size) {
      // Every release gets the full grace period.
      clearTimeout(this.closeTimer);
      this.closeTimer = setTimeout(() => {
        this.closeTimer = undefined;
        this.closeUnwanted();
      }, CLOSE_DELAY_MS);
    }
  }

  private closeUnwanted(): void {
    const plan = new Set(this.wantedPlan());
    const closed: string[] = [];
    for (const [key, stream] of this.streams) {
      if (plan.has(key)) continue;
      this.dispose(stream);
      this.streams.delete(key);
      closed.push(stream.prefix);
    }
    if (closed.length === 0) return;
    // Drop the values only the closed streams were keeping current.
    const open = [...this.streams.values()].map((s) => s.prefix);
    const stale = Object.keys(this.values).filter(
      (key) => closed.some((p) => key.startsWith(p)) && !open.some((p) => key.startsWith(p))
    );
    if (stale.length > 0) {
      const next = { ...this.values };
      for (const key of stale) delete next[key];
      this.values = next;
      this.emit(stale);
    }
    this.updateStatus();
  }

  private open(key: string): void {
    const fast = key.startsWith(FAST);
    const prefix = fast ? key.slice(FAST.length) : key;
    const interval = fast ? FAST_INTERVAL_MS : STREAM_INTERVAL_MS;
    // "" is the unfiltered stream: a full snapshot every second.
    const unfiltered = prefix === "";
    const url = unfiltered
      ? `${this.base}/events`
      : `${this.base}/events?prefix=${encodeURIComponent(prefix)}&interval=${interval}`;
    const source = this.connect(url);
    const stream: Stream = { prefix, interval, source, fresh: true };
    this.streams.set(key, stream);

    // EventSource reconnects on its own after a dropped connection; the
    // first message after each (re)connect is the full set again.
    source.onopen = () => {
      stream.fresh = true;
      this.updateStatus();
    };
    source.onmessage = (event) => {
      let parsed: StreamEvent;
      try {
        parsed = JSON.parse(event.data) as StreamEvent;
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== "object") return;
      const reset = stream.fresh || unfiltered ? prefix : null;
      const { values, changed } = mergeEvent(this.values, parsed, reset);
      stream.fresh = false;
      this.values = values;
      if (typeof parsed.timestamp === "number") this.timestamp = parsed.timestamp;
      if (changed.length > 0) this.emit(changed);
      for (const listener of this.tickListeners) listener();
    };
    source.onerror = () => {
      this.updateStatus();
      // A refused or failed response closes the EventSource for good;
      // reopen it later while it is still wanted. Its last values stay
      // on screen meanwhile; the header badge shows the outage.
      if (source.readyState !== CLOSED || stream.retry !== undefined) return;
      stream.retry = setTimeout(() => {
        stream.retry = undefined;
        if (this.streams.get(key) !== stream) return;
        this.streams.delete(key);
        this.dispose(stream);
        this.open(key);
      }, RETRY_MS);
    };
    this.updateStatus();
  }

  private dispose(stream: Stream): void {
    if (stream.retry !== undefined) clearTimeout(stream.retry);
    stream.source.onopen = null;
    stream.source.onmessage = null;
    stream.source.onerror = null;
    stream.source.close();
  }

  /** "Every sensor": list the top-level sources `/api/sensors` carries. */
  private async discover(): Promise<void> {
    clearTimeout(this.discoverTimer);
    const base = this.base;
    try {
      const res = await this.load(`${base}/api/sensors`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { sensors?: SensorMap };
      if (base !== this.base) return;
      this.discovered = [
        ...new Set(
          Object.keys(data.sensors ?? {}).map((key) =>
            key.startsWith("plugins.") ? "plugins." : namespaceOf(key)
          )
        ),
      ];
      if (this.allRefs === 0) return;
      this.sync();
      this.discoverTimer = setTimeout(() => void this.discover(), REDISCOVER_MS);
    } catch {
      if (base !== this.base || this.allRefs === 0) return;
      this.discoverTimer = setTimeout(() => void this.discover(), RETRY_MS);
    }
  }

  private emit(changed: readonly string[]): void {
    for (const listener of this.listeners) listener(changed);
    // An animation that settled on the old values moves again.
    wakeTicker();
  }

  private updateStatus(): void {
    const connected = [...this.streams.values()].every((s) => s.source.readyState === OPEN);
    if (connected === this.connected) return;
    this.connected = connected;
    for (const listener of this.statusListeners) listener();
  }
}

/** The page's shared store; follows the Data API URL setting. */
export const sensorStore = new SensorStore(getApiBase());
subscribeApiBase((base) => sensorStore.setBase(base));
