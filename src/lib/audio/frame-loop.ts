import { subscribeTick } from "@/lib/ticker";

type FrameListener = (nowMs: number) => void;
type FramePhase = "update" | "paint";

const listeners = {
  paint: new Set<FrameListener>(),
  update: new Set<FrameListener>(),
};
let unsubscribeTick: (() => void) | null = null;
let ticking = false;

const hasListeners = () => listeners.update.size + listeners.paint.size > 0;

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
  if (!hasListeners()) stopTick();
};

const stopTick = () => {
  unsubscribeTick?.();
  unsubscribeTick = null;
};

/**
 * Runs sources in the update phase, then renderers in the default paint phase.
 * One subscription to the shared ticker serves the whole page (so it follows
 * Max FPS) and ends when nothing is subscribed. The ticker pauses while the
 * tab is hidden.
 */
export const subscribeFrame = (
  listener: FrameListener,
  phase: FramePhase = "paint"
): (() => void) => {
  listeners[phase].add(listener);
  if (unsubscribeTick === null) {
    unsubscribeTick = subscribeTick(tick);
  }
  return () => {
    listeners[phase].delete(listener);
    if (!hasListeners() && !ticking) stopTick();
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
