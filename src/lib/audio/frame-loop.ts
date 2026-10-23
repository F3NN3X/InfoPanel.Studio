import { capTick, subscribeTick, trackTick } from "@/lib/ticker";

type FrameListener = (nowMs: number) => void;
type FramePhase = "update" | "paint";

const listeners = {
  paint: new Set<FrameListener>(),
  update: new Set<FrameListener>(),
};
/** Each listener's own cap (0: every frame the ticker gives). */
const caps = new Map<FrameListener, number>();
let unsubscribeTick: (() => void) | null = null;
let tickCap = 0;
let ticking = false;

const hasListeners = () => listeners.update.size + listeners.paint.size > 0;

/** The loop's own cap: every frame while any listener is uncapped, else the fastest listener's cap. */
const loopCap = () => {
  let cap = 0;
  for (const c of caps.values()) {
    if (!(c > 0)) return 0;
    cap = Math.max(cap, c);
  }
  return cap;
};

const reportError = (error: unknown) => {
  queueMicrotask(() => {
    throw error;
  });
};

const tick = (nowMs: number) => {
  ticking = true;
  for (const phase of [listeners.update, listeners.paint]) {
    for (const listener of phase) {
      try {
        listener(nowMs);
      } catch (error) {
        reportError(error);
      }
    }
  }
  ticking = false;
  syncTick();
};

const stopTick = () => {
  unsubscribeTick?.();
  unsubscribeTick = null;
};

/** Subscribe to the ticker at the listeners' cap (re-subscribing when it changes); unsubscribe when none are left. */
const syncTick = () => {
  if (!hasListeners()) return stopTick();
  const cap = loopCap();
  if (unsubscribeTick !== null && cap === tickCap) return;
  stopTick();
  tickCap = cap;
  unsubscribeTick = subscribeTick(tick, cap, "frame-loop");
};

/**
 * Runs sources in the update phase, then renderers in the default paint phase.
 * One subscription to the shared ticker serves the whole page (so it follows
 * Max FPS) and ends when nothing is subscribed. The ticker pauses while the
 * tab is hidden. `capFps` caps the listener (the loop then sleeps between
 * frames when every listener is capped); `label` names it in the ticker's
 * debug stats.
 */
export const subscribeFrame = (
  listener: FrameListener,
  phase: FramePhase = "paint",
  label?: string,
  capFps = 0
): (() => void) => {
  const run: FrameListener = capFps > 0 ? capTick(listener, capFps, label) : listener;
  listeners[phase].add(run);
  caps.set(run, capFps > 0 ? capFps : 0);
  const untrack = trackTick(label === undefined || capFps > 0 ? run : capTick(run, 0, label), "frame-loop");
  if (!ticking) syncTick();
  return () => {
    untrack();
    listeners[phase].delete(run);
    caps.delete(run);
    if (!ticking) syncTick();
  };
};

/** One frame of a task. Return true while the task needs another frame. */
export type FrameTaskStep = (nowMs: number) => boolean;

export interface FrameTask {
  /** Runs the step again from the next frame, if the task is asleep. */
  wake: () => void;
  /** Stops the task for good. A stopped task ignores `wake`. */
  stop: () => void;
}

/**
 * Runs `step` on the shared loop for as long as it returns true. When it
 * returns false the task sleeps and requests no frames until `wake()`, so a
 * settled, silent or hidden painter costs nothing. The task starts awake.
 */
export const createFrameTask = (step: FrameTaskStep): FrameTask => {
  let stopped = false;
  let unsubscribe: (() => void) | null = null;

  const sleep = () => {
    unsubscribe?.();
    unsubscribe = null;
  };

  const run = (nowMs: number) => {
    if (!step(nowMs)) {
      sleep();
    }
  };

  const wake = () => {
    if (!stopped && unsubscribe === null) {
      unsubscribe = subscribeFrame(run);
    }
  };

  wake();

  return {
    stop: () => {
      stopped = true;
      sleep();
    },
    wake,
  };
};

/**
 * The longest step a painter clock takes, so waking never jumps. Above one
 * interval of the slowest Max FPS (5 fps = 200 ms) to keep real-time speed.
 */
export const MAX_FRAME_GAP_MS = 250;

/**
 * A clock that follows the frames but never advances more than
 * `MAX_FRAME_GAP_MS` at once. A painter that slept, or ran in a hidden tab,
 * resumes its ballistics where they were instead of jumping to the end.
 */
export const createPainterClock = (): ((nowMs: number) => number) => {
  let lastMs: number | null = null;
  let clockMs = 0;
  return (nowMs) => {
    if (lastMs !== null) {
      clockMs += Math.min(Math.max(0, nowMs - lastMs), MAX_FRAME_GAP_MS);
    }
    lastMs = nowMs;
    return clockMs;
  };
};
