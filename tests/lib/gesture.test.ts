import { afterEach, describe, expect, it, vi } from "vitest";
import { createRecogniser, DOUBLE_TAP_MS, HOLD_MS, RAW_ECHO_MS, TAP_SLOP_PX, type GestureHandlers } from "@/lib/gesture";

describe("the gesture recogniser", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = (handlers: (keyof GestureHandlers)[]) => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const h = Object.fromEntries(handlers.map((k) => [k, () => calls.push(k)])) as GestureHandlers;
    const timers = { set: (fn: () => void, ms: number) => setTimeout(fn, ms), clear: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>), now: () => Date.now() };
    return { rec: createRecogniser(() => h, timers), calls };
  };
  const press = (rec: ReturnType<typeof createRecogniser>, ms = 50) => {
    rec.down(10, 10);
    vi.advanceTimersByTime(ms);
    rec.up();
  };

  it("taps on the lift when there is no double tap to wait for", () => {
    const { rec, calls } = setup(["tap", "hold"]);
    press(rec);
    expect(calls).toEqual(["tap"]);
  });

  it("holds after 600 ms with the finger still down, and the lift is no tap", () => {
    const { rec, calls } = setup(["tap", "hold"]);
    rec.down(10, 10);
    vi.advanceTimersByTime(HOLD_MS - 1);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(["hold"]);
    rec.up();
    expect(calls).toEqual(["hold"]);
  });

  it("tells a double tap from two taps, and a single tap after the wait", () => {
    const { rec, calls } = setup(["tap", "doubleTap"]);
    press(rec);
    press(rec);
    expect(calls).toEqual(["doubleTap"]);
    vi.advanceTimersByTime(DOUBLE_TAP_MS);
    expect(calls).toEqual(["doubleTap"]);
    press(rec);
    expect(calls).toEqual(["doubleTap"]);
    vi.advanceTimersByTime(DOUBLE_TAP_MS);
    expect(calls).toEqual(["doubleTap", "tap"]);
  });

  it("gives a press that moves past the slop neither a tap nor a hold", () => {
    const { rec, calls } = setup(["tap", "hold"]);
    rec.down(10, 10);
    rec.move(10 + TAP_SLOP_PX + 1, 10);
    vi.advanceTimersByTime(HOLD_MS);
    rec.up();
    expect(calls).toEqual([]);
  });

  it("takes raw-USB gestures, but not as an echo of a pointer press it already told", () => {
    const { rec, calls } = setup(["tap", "hold", "doubleTap"]);
    rec.gesture("LongPress");
    rec.gesture("DoubleTap");
    expect(calls).toEqual(["hold", "doubleTap"]);
    press(rec);
    rec.gesture("Tap");
    vi.advanceTimersByTime(DOUBLE_TAP_MS);
    // the pointer's tap only
    expect(calls).toEqual(["hold", "doubleTap", "tap"]);
    vi.advanceTimersByTime(RAW_ECHO_MS);
    rec.gesture("Tap");
    rec.gesture("DoubleTap");
    vi.advanceTimersByTime(DOUBLE_TAP_MS);
    // a raw tap the panel follows with its double tap is the double tap alone
    expect(calls).toEqual(["hold", "doubleTap", "tap", "doubleTap"]);
  });

  it("drops a waiting tap when its element goes away", () => {
    const { rec, calls } = setup(["tap", "doubleTap"]);
    press(rec);
    rec.dispose();
    vi.advanceTimersByTime(DOUBLE_TAP_MS);
    expect(calls).toEqual([]);
  });
});
