/**
 * The one gesture recogniser (decision 3, pinned layer P2): tap, hold and double tap, fed by pointer events and by raw-USB
 * `tp-gesture` messages. Beside `swipe.ts` (the page's swipe and drag-follow) rather than in it: only the rail's chunk reads
 * it, and a module the kiosk entry shares with a widget's chunk becomes a chunk of its own.
 */

/** A press held this long, without moving, is a hold (as the page dots' long press). */
export const HOLD_MS = 600;
/** A second tap within this time is a double tap. */
export const DOUBLE_TAP_MS = 300;
/** A press that moves farther than this, px, is a drag: no tap and no hold. */
export const TAP_SLOP_PX = 10;
/** A raw-USB gesture this soon after a pointer press is the same touch, already told by pointer events. */
export const RAW_ECHO_MS = 1000;

/** What a press does: unset gestures do nothing. */
export interface GestureHandlers {
  tap?: () => void;
  hold?: () => void;
  doubleTap?: () => void;
}

export interface GestureTimers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (id: unknown) => void;
  now: () => number;
}

const SYSTEM_TIMERS: GestureTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

export interface Recogniser {
  down: (x: number, y: number) => void;
  move: (x: number, y: number) => void;
  up: () => void;
  cancel: () => void;
  /** A raw-USB gesture (`tp-gesture`: Tap, DoubleTap, LongPress); ignored as an echo of a pointer press it already told. */
  gesture: (type: string) => void;
  /** Stops a waiting tap or hold (the element went away). */
  dispose: () => void;
}

/**
 * One recogniser for tap, hold (600 ms) and double tap, fed by pointer events and by raw-USB `tp-gesture` messages. A hold
 * fires while the finger is still down, and its lift is no tap. With a double tap to tell apart, a tap waits
 * `DOUBLE_TAP_MS` for a second one; without, it fires on the lift. `on` is read at each gesture, so it may change.
 */
export function createRecogniser(on: () => GestureHandlers, timers: GestureTimers = SYSTEM_TIMERS): Recogniser {
  let press: { x: number; y: number; moved: boolean; held: boolean } | null = null;
  let holdTimer: unknown = null;
  let tapTimer: unknown = null;
  let lastPress = -Infinity;
  const stopHold = () => {
    if (holdTimer !== null) timers.clear(holdTimer);
    holdTimer = null;
  };
  const tapped = () => {
    const h = on();
    if (!h.doubleTap) return h.tap?.();
    if (tapTimer !== null) {
      timers.clear(tapTimer);
      tapTimer = null;
      return h.doubleTap();
    }
    tapTimer = timers.set(() => {
      tapTimer = null;
      on().tap?.();
    }, DOUBLE_TAP_MS);
  };
  return {
    down(x, y) {
      if (press) return;
      lastPress = timers.now();
      press = { x, y, moved: false, held: false };
      if (!on().hold) return;
      holdTimer = timers.set(() => {
        holdTimer = null;
        if (!press) return;
        press.held = true;
        on().hold?.();
      }, HOLD_MS);
    },
    move(x, y) {
      if (!press || press.moved || Math.hypot(x - press.x, y - press.y) <= TAP_SLOP_PX) return;
      press.moved = true;
      stopHold();
    },
    up() {
      const p = press;
      press = null;
      stopHold();
      if (p && !p.moved && !p.held) tapped();
    },
    cancel() {
      press = null;
      stopHold();
    },
    gesture(type) {
      if (press || timers.now() - lastPress < RAW_ECHO_MS) return;
      const h = on();
      if (type === "Tap") tapped();
      else if (type === "DoubleTap") {
        // the panel may tell the first tap on its own first: the double tap replaces it
        if (tapTimer !== null) timers.clear(tapTimer);
        tapTimer = null;
        (h.doubleTap ?? h.tap)?.();
      }
      else if (type === "LongPress") h.hold?.();
    },
    dispose() {
      press = null;
      stopHold();
      if (tapTimer !== null) timers.clear(tapTimer);
      tapTimer = null;
    },
  };
}
