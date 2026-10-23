/**
 * One requestAnimationFrame loop for every animation on the page, capped at the
 * Max FPS setting. It runs only while a subscriber still has something to draw
 * and the tab is visible, so an idle page costs no frames: a subscriber that has
 * reached its target returns `SETTLED` (or the time it next needs a frame) and
 * is skipped until it is woken.
 */

/** Max FPS choices; 0 is unlimited (every display frame). */
export const FPS_CHOICES = [5, 15, 30, 60, 0] as const;
export type MaxFps = (typeof FPS_CHOICES)[number];

/** A frame this far (ms) before the interval counts as due, so a 60 Hz display holds a 60 fps cap. */
const SLACK_MS = 1;

/**
 * Whether a frame at `now` is due after the last tick at `last`, and the time to
 * count the next interval from. Steps by whole intervals from `last` (no drift);
 * after a stall longer than two intervals it restarts from `now`. null: not due.
 */
export function nextTick(now: number, last: number, maxFps: number): number | null {
  if (!(maxFps > 0)) return now;
  const interval = 1000 / maxFps;
  const elapsed = now - last;
  if (elapsed < interval - SLACK_MS) return null;
  return elapsed < interval * 2 ? last + interval : now;
}

/**
 * How long (ms) to sleep before asking for the next animation frame: the time left to the next
 * due tick, less slack for timer jitter. 0 when uncapped or already due, so the caller asks at once.
 */
export function wakeDelay(now: number, last: number, maxFps: number): number {
  if (!(maxFps > 0)) return 0;
  return Math.max(0, last + 1000 / maxFps - now - 2 * SLACK_MS);
}

/** Returned by a tick callback that has nothing more to draw until it is woken. */
export const SETTLED = "settled";
/**
 * What a tick callback returns: nothing to keep going, `SETTLED` to sleep until woken, or a number of ms to sleep
 * for (a clock that next changes at the top of the second).
 */
export type TickResult = void | typeof SETTLED | number;
type Tick = (now: number) => TickResult;

/** Unsubscribes; `wake` brings a settled subscriber back on the next frame. */
export type TickSubscription = (() => void) & { wake: () => void };

/**
 * Debug builds (the dev server, Vitest, or a build with VITE_TICKER_STATS=1) record who is subscribed and how often
 * the loop runs, read with `window.__tickerStats()`. Release builds drop all of it.
 */
const STATS = import.meta.env.DEV || import.meta.env.VITE_TICKER_STATS === "1";

interface Subscriber {
  cb: Tick;
  /** Its own cap (0: Max FPS only) and the time its last tick counted from. */
  cap: number;
  at: number;
  /** Asleep until this time: Infinity when settled until woken, -Infinity when awake. */
  sleepUntil: number;
}

/**
 * How the loop runs: `run` as usual; `slow` (an unfocused studio, src/lib/studio-focus.ts) at most `THROTTLED_FPS`,
 * with ambient subscribers (capped at `AMBIENT_FPS`) paused; `stop` asks for no frames at all.
 */
export type TickerThrottle = "run" | "slow" | "stop";
export const THROTTLED_FPS = 5;

const subscribers = new Set<Subscriber>();
let maxFps: number = 60;
let throttle: TickerThrottle = "run";
let frame = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let last = -Infinity;

const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
const now = () => performance.now();
/** Max FPS under the throttle. */
const fps = () => (throttle === "slow" ? (maxFps > 0 ? Math.min(maxFps, THROTTLED_FPS) : THROTTLED_FPS) : maxFps);
const paused = (s: Subscriber) => throttle === "slow" && s.cap === AMBIENT_FPS;

function due(s: Subscriber, t: number): boolean {
  if (paused(s) || t < s.sleepUntil - SLACK_MS) return false;
  if (!(s.cap > 0)) return true;
  const next = nextTick(t, s.at, s.cap);
  if (next === null) return false;
  s.at = next;
  return true;
}

/** When `s` next wants a frame: its wake-up time when asleep, else its next capped tick (`t` when uncapped). */
function wantsAt(s: Subscriber, t: number): number {
  if (paused(s)) return Infinity;
  if (s.sleepUntil > t) return s.sleepUntil;
  return s.cap > 0 ? s.at + 1000 / s.cap : t;
}

function request() {
  if (STATS) counts.requested++;
  frame = requestAnimationFrame(loop);
}

function cancel() {
  if (frame !== 0) cancelAnimationFrame(frame);
  if (timer !== undefined) clearTimeout(timer);
  frame = 0;
  timer = undefined;
}

/**
 * Ask for the frame the earliest subscriber wants, no sooner than Max FPS allows; sleep (a timer, not vsyncs)
 * until then, and ask for nothing when every subscriber is settled.
 */
function schedule(t: number) {
  cancel();
  if (subscribers.size === 0 || hidden() || throttle === "stop") return;
  let at = Infinity;
  for (const s of subscribers) at = Math.min(at, wantsAt(s, t));
  if (at === Infinity) return;
  const cap = fps();
  if (cap > 0) at = Math.max(at, last + 1000 / cap);
  const wait = at - t - 2 * SLACK_MS;
  if (wait > 0)
    timer = setTimeout(() => {
      timer = undefined;
      request();
    }, wait);
  else request();
}

function loop(t: number) {
  frame = 0;
  const next = nextTick(t, last, fps());
  if (next !== null) {
    let ran = false;
    // A callback unsubscribed earlier in this tick doesn't run.
    for (const s of [...subscribers]) {
      if (!subscribers.has(s) || !due(s, t)) continue;
      ran = true;
      const r = s.cb(t);
      s.sleepUntil = r === SETTLED ? Infinity : typeof r === "number" ? t + Math.max(0, r) : -Infinity;
    }
    if (ran) last = next;
    if (STATS && ran) counts.ran++;
  }
  // A callback may have scheduled already (a subscribe or wake inside a tick).
  if (frame === 0 && timer === undefined) schedule(t);
}

if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => schedule(now()));
if (typeof window !== "undefined") window.addEventListener("resize", () => wakeTicker());

/** Sets the cap for every subscriber (5, 15, 30, 60; 0 = unlimited). */
export function setTickerMaxFps(cap: number): void {
  maxFps = cap;
}

/** Slows or stops the loop (see `TickerThrottle`); back to `run`, paused subscribers tick on the next frame. */
export function setTickerThrottle(next: TickerThrottle): void {
  if (next === throttle) return;
  throttle = next;
  schedule(now());
}

/**
 * Wakes every settled subscriber (new data, a config change, a resize): each ticks again on the next frame. One
 * asleep for a set time (a clock) keeps its time; it knows when it next changes.
 */
export function wakeTicker(): void {
  let woke = false;
  for (const s of subscribers)
    if (s.sleepUntil === Infinity) {
      s.sleepUntil = -Infinity;
      woke = true;
    }
  if (woke) schedule(now());
}

/**
 * The cap for ambient motion (weather effects, art drift, animated icons, visualizers), below a
 * higher Max FPS: it drifts slowly, so 30 frames look the same as 60 at half the drawing.
 */
export const AMBIENT_FPS = 30;

/** `cb` called at most `fps` times a second however often it is ticked (0 = every tick). `label` names it in the stats. */
export function capTick(cb: Tick, fps: number, label?: string): Tick {
  const run: Tick = fps > 0 ? capped(cb, fps) : cb;
  if (STATS) described.set(run, { label: label ?? described.get(cb)?.label ?? callerLabel(), cap: fps > 0 ? fps : (described.get(cb)?.cap ?? 0) });
  return run;
}

function capped(cb: Tick, fps: number): Tick {
  let at = -Infinity;
  return (t) => {
    const next = nextTick(t, at, fps);
    if (next === null) return;
    at = next;
    return cb(t);
  };
}

/**
 * Calls `cb` on each tick, at most Max FPS times a second, and at most `capFps` when given (lower
 * of the two), until `cb` settles; the returned function unsubscribes, and its `wake` wakes it. `label` names the
 * subscriber in the stats.
 */
export function subscribeTick(cb: Tick, capFps = 0, label?: string): TickSubscription {
  const s: Subscriber = { cb, cap: capFps > 0 ? capFps : 0, at: -Infinity, sleepUntil: -Infinity };
  subscribers.add(s);
  const untrack = STATS ? trackTick(capTick(cb, capFps, label)) : undefined;
  // A new subscriber is due now: ask at once rather than wait out a sleeping loop's timer.
  if (frame === 0) schedule(now());
  const stop = () => {
    if (!subscribers.delete(s)) return;
    untrack?.();
    if (subscribers.size === 0) cancel();
  };
  return Object.assign(stop, {
    wake: () => {
      if (!subscribers.has(s) || s.sleepUntil === -Infinity) return;
      s.sleepUntil = -Infinity;
      if (frame === 0) schedule(now());
    },
  });
}

// ── debug stats ──

/** A subscriber as the stats show it: who (label), its own cap, and the loop it rides on when not the ticker itself. */
interface Described {
  label: string;
  cap: number;
  via?: string;
}

const described = new WeakMap<Tick, Described>();
const tracked = new Map<object, Described>();
const counts = { requested: 0, ran: 0, since: 0 };

/** The first stack frame outside the ticker and its hooks, for a subscriber that gave no label. */
function callerLabel(): string {
  const frames = (new Error().stack ?? "").split("\n").slice(1).map((l) => l.trim());
  const outside = frames.find((l) => !/\b(callerLabel|capTick|subscribeTick|trackTick|subscribeFrame|useTick|useAnimationFrame)\b|ticker\.ts|frame-loop\.ts|use-tick\.ts/.test(l));
  return (outside ?? "?").replace(/^at /, "").replace(/\?[^:)]*/, "").replace(/https?:\/\/[^/]+/, "");
}

/**
 * Lists `cb` in the stats until the returned function runs; `via` names the loop it rides on (the audio frame loop
 * registers its own listeners this way). A no-op in release builds.
 */
export function trackTick(cb: Tick, via?: string): () => void {
  if (!STATS) return () => {};
  const token = {};
  const d = described.get(cb);
  tracked.set(token, { label: d?.label ?? callerLabel(), cap: d?.cap ?? 0, via });
  return () => void tracked.delete(token);
}

export interface TickerStats {
  /** Subscribers grouped by label, cap and loop, with how many of each. */
  subscribers: (Described & { count: number })[];
  /** How many of the ticker's own subscribers are asleep (settled or waiting for their time). */
  settled: number;
  /** Animation frames the ticker asked for, per second since the previous call (or the page's start). */
  requestedPerS: number;
  /** Frames that ran at least one subscriber, per second over the same span. */
  ranPerS: number;
  /** No frame and no wake-up timer pending: the loop asks for nothing. */
  idle: boolean;
  maxFps: number;
  throttle: TickerThrottle;
}

/** The stats since the previous call (or the page's start); debug builds only. */
export function tickerStats(t = now()): TickerStats {
  const groups = new Map<string, Described & { count: number }>();
  for (const d of tracked.values()) {
    const key = `${d.label}\u0000${d.cap}\u0000${d.via ?? ""}`;
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { ...d, count: 1 });
  }
  const s = Math.max(1e-3, (t - counts.since) / 1000);
  const out: TickerStats = {
    subscribers: [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    settled: [...subscribers].filter((x) => x.sleepUntil > t).length,
    requestedPerS: counts.requested / s,
    ranPerS: counts.ran / s,
    idle: frame === 0 && timer === undefined,
    maxFps,
    throttle,
  };
  counts.requested = 0;
  counts.ran = 0;
  counts.since = t;
  return out;
}

if (STATS && typeof window !== "undefined") (window as unknown as { __tickerStats: () => TickerStats }).__tickerStats = () => tickerStats();
