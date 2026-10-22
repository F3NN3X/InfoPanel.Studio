import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPainterClock, MAX_FRAME_GAP_MS, subscribeFrame } from "@/lib/audio/frame-loop";
import { setTickerMaxFps } from "@/lib/ticker";

/** A manual rAF: `step` runs the queued callbacks at one 60 Hz display frame; fake timers cover the ticker's sleep between capped frames. */
let queue = new Map<number, FrameRequestCallback>();
let next = 1;
let now = 0; // never reset: the ticker keeps its last tick time between tests
const step = () => {
  now += 1000 / 60;
  vi.advanceTimersByTime(1000 / 60);
  const run = [...queue.values()];
  queue = new Map();
  for (const cb of run) cb(now);
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  queue = new Map();
  next = 1;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    queue.set(next, cb);
    return next++;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => queue.delete(id));
});

afterEach(() => {
  setTickerMaxFps(60);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("frame loop", () => {
  it("follows the shared ticker's Max FPS, update phase before paint", () => {
    setTickerMaxFps(15);
    const calls: string[] = [];
    const offPaint = subscribeFrame(() => calls.push("paint"));
    const offUpdate = subscribeFrame(() => calls.push("update"), "update");
    for (let i = 0; i < 60; i++) step();
    expect(calls.filter((c) => c === "paint").length).toBeGreaterThanOrEqual(14);
    expect(calls.filter((c) => c === "paint").length).toBeLessThanOrEqual(16);
    expect(calls.slice(0, 2)).toEqual(["update", "paint"]);
    offPaint();
    offUpdate();
  });

  it("requests no frames once nothing is subscribed", () => {
    const off = subscribeFrame(() => undefined);
    expect(queue.size).toBe(1);
    off();
    expect(queue.size).toBe(0);
  });

  it("lets a listener unsubscribe itself mid-tick and ends the loop", () => {
    const calls = vi.fn();
    const off = subscribeFrame(() => {
      calls();
      off();
    });
    step();
    step();
    expect(calls).toHaveBeenCalledTimes(1);
    expect(queue.size).toBe(0);
  });
});

describe("painter clock", () => {
  it("steps a 5 fps frame in real time but never jumps past the gap", () => {
    const clock = createPainterClock();
    clock(0);
    expect(clock(200)).toBe(200);
    expect(clock(200 + 5000)).toBe(200 + MAX_FRAME_GAP_MS);
  });
});
