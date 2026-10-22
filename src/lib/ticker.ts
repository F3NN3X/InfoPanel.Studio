/**
 * One requestAnimationFrame loop for every animation on the page, capped at the
 * Max FPS setting. It runs only while something is subscribed and the tab is
 * visible, so an idle kiosk costs no frames.
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

type Tick = (now: number) => void;

const subscribers = new Set<Tick>();
let maxFps: number = 60;
let frame = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let last = -Infinity;

const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

// Under a Max FPS cap most display frames do nothing, so sleep until the next tick is due
// instead of waking on every vsync.
function schedule(now: number) {
  const wait = wakeDelay(now, last, maxFps);
  if (wait > 0)
    timer = setTimeout(() => {
      timer = undefined;
      frame = requestAnimationFrame(loop);
    }, wait);
  else frame = requestAnimationFrame(loop);
}

function loop(now: number) {
  frame = 0;
  const next = nextTick(now, last, maxFps);
  if (next !== null) {
    last = next;
    // A callback unsubscribed earlier in this tick doesn't run.
    for (const cb of [...subscribers]) if (subscribers.has(cb)) cb(now);
  }
  // A callback may have unsubscribed the last subscriber; sync() then already stopped the loop.
  if (subscribers.size > 0 && !hidden() && frame === 0 && timer === undefined) schedule(now);
}

function sync() {
  const run = subscribers.size > 0 && !hidden();
  if (run && frame === 0 && timer === undefined) frame = requestAnimationFrame(loop);
  else if (!run) {
    if (frame !== 0) cancelAnimationFrame(frame);
    if (timer !== undefined) clearTimeout(timer);
    frame = 0;
    timer = undefined;
  }
}

if (typeof document !== "undefined") document.addEventListener("visibilitychange", sync);

/** Sets the cap for every subscriber (5, 15, 30, 60; 0 = unlimited). */
export function setTickerMaxFps(fps: number): void {
  maxFps = fps;
}

/** Calls `cb` on each tick, at most Max FPS times a second; the returned function unsubscribes. */
export function subscribeTick(cb: Tick): () => void {
  subscribers.add(cb);
  sync();
  return () => {
    subscribers.delete(cb);
    sync();
  };
}
