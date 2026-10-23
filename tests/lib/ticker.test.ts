import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, type TickResult, wakeDelay } from "@/lib/ticker";

type Ticker = typeof import("@/lib/ticker");

// The loop's state is module-wide: each case gets a fresh module on fake time, with a 60 Hz display
// (fake-timers fires requestAnimationFrame every 16 ms).
let T: Ticker;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  const vsync = 1000 / 60;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), vsync - (performance.now() % vsync)));
  vi.stubGlobal("cancelAnimationFrame", (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
  vi.resetModules();
  T = await import("@/lib/ticker");
  T.tickerStats();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the loop", () => {
  it("goes idle once every subscriber settles, and asks for nothing more", () => {
    const cb = vi.fn((): TickResult => T.SETTLED);
    T.subscribeTick(cb, 0, "glide");
    vi.advanceTimersByTime(100);
    expect(cb).toHaveBeenCalledTimes(1);
    T.tickerStats();
    vi.advanceTimersByTime(1000);
    const stats = T.tickerStats();
    expect(stats).toMatchObject({ idle: true, requestedPerS: 0, settled: 1 });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("wakes settled subscribers on wakeTicker (new data, config, resize) and on their own wake", () => {
    const cb = vi.fn((): TickResult => T.SETTLED);
    const sub = T.subscribeTick(cb);
    vi.advanceTimersByTime(100);
    T.wakeTicker();
    vi.advanceTimersByTime(100);
    expect(cb).toHaveBeenCalledTimes(2);
    sub.wake();
    vi.advanceTimersByTime(100);
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it("keeps running while one subscriber has not settled", () => {
    const settled = vi.fn((): TickResult => T.SETTLED);
    const moving = vi.fn();
    T.subscribeTick(settled);
    T.subscribeTick(moving);
    vi.advanceTimersByTime(1000);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(moving.mock.calls.length).toBeGreaterThan(50);
    expect(T.tickerStats().idle).toBe(false);
  });

  it("sleeps a set time when the callback returns ms, and wakeTicker leaves it be", () => {
    const at: number[] = [];
    T.subscribeTick((now) => {
      at.push(now);
      return 500;
    });
    vi.advanceTimersByTime(100);
    T.wakeTicker();
    vi.advanceTimersByTime(1000);
    expect(at).toHaveLength(3);
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(499);
    expect(at[1] - at[0]).toBeLessThan(500 + 20);
  });

  it("respects a subscriber's cap, sleeping between ticks instead of asking every frame", () => {
    const cb = vi.fn();
    T.subscribeTick(cb, 10);
    vi.advanceTimersByTime(2000);
    T.tickerStats();
    cb.mockClear();
    vi.advanceTimersByTime(1000);
    expect(Math.abs(cb.mock.calls.length - 10)).toBeLessThanOrEqual(1);
    expect(T.tickerStats().requestedPerS).toBeLessThanOrEqual(12);
  });

  it("respects Max FPS over an uncapped subscriber", () => {
    T.setTickerMaxFps(15);
    const cb = vi.fn();
    T.subscribeTick(cb);
    vi.advanceTimersByTime(2000);
    cb.mockClear();
    vi.advanceTimersByTime(1000);
    expect(Math.abs(cb.mock.calls.length - 15)).toBeLessThanOrEqual(1);
  });

  it("slows to 5 fps and pauses ambient subscribers when throttled, and stops on stop", () => {
    const canvas = vi.fn();
    const weather = vi.fn();
    T.subscribeTick(canvas);
    T.subscribeTick(weather, T.AMBIENT_FPS);
    T.setTickerThrottle("slow");
    vi.advanceTimersByTime(1000);
    canvas.mockClear();
    weather.mockClear();
    vi.advanceTimersByTime(1000);
    expect(Math.abs(canvas.mock.calls.length - T.THROTTLED_FPS)).toBeLessThanOrEqual(1);
    expect(weather).not.toHaveBeenCalled();
    T.setTickerThrottle("stop");
    canvas.mockClear();
    vi.advanceTimersByTime(1000);
    expect(canvas).not.toHaveBeenCalled();
    expect(T.tickerStats().idle).toBe(true);
    T.setTickerThrottle("run");
    vi.advanceTimersByTime(100);
    expect(canvas.mock.calls.length).toBeGreaterThanOrEqual(5);
    expect(weather).toHaveBeenCalled();
  });

  it("stops and forgets a subscriber on unsubscribe", () => {
    const cb = vi.fn();
    const stop = T.subscribeTick(cb, 0, "gone");
    vi.advanceTimersByTime(100);
    stop();
    const n = cb.mock.calls.length;
    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(n);
    expect(T.tickerStats()).toMatchObject({ idle: true, subscribers: [] });
  });
});

describe("tickerStats", () => {
  it("groups subscribers by label and cap, and counts the frames asked for and run", () => {
    T.subscribeTick(() => {}, 0, "marquee");
    T.subscribeTick(() => {}, 0, "marquee");
    T.subscribeTick(() => {}, T.AMBIENT_FPS, "weather-fx");
    vi.advanceTimersByTime(1000);
    const stats = T.tickerStats();
    expect(stats.subscribers).toEqual([
      { label: "marquee", cap: 0, count: 2 },
      { label: "weather-fx", cap: 30, count: 1 },
    ]);
    expect(stats.ranPerS).toBeGreaterThan(55);
    expect(stats.requestedPerS).toBeGreaterThanOrEqual(stats.ranPerS);
  });

  it("labels an unlabelled subscriber from its caller", () => {
    T.subscribeTick(() => {});
    expect(T.tickerStats().subscribers[0].label).toMatch(/ticker\.test\.ts/);
  });
});

describe("the audio frame loop", () => {
  it("rides the ticker at its listeners' cap, and lists them in the stats", async () => {
    const { subscribeFrame } = await import("@/lib/audio/frame-loop");
    const paint = vi.fn();
    const stop = subscribeFrame(paint, "paint", "viz:paint", 30);
    vi.advanceTimersByTime(2000);
    T.tickerStats();
    paint.mockClear();
    vi.advanceTimersByTime(1000);
    const stats = T.tickerStats();
    expect(Math.abs(paint.mock.calls.length - 30)).toBeLessThanOrEqual(1);
    expect(stats.requestedPerS).toBeLessThanOrEqual(32);
    expect(stats.subscribers).toEqual(
      expect.arrayContaining([
        { label: "frame-loop", cap: 30, count: 1 },
        { label: "viz:paint", cap: 30, via: "frame-loop", count: 1 },
      ])
    );
    stop();
    expect(T.tickerStats().subscribers).toEqual([]);
  });
});

/** The ticks a display of `hz` frames a second lets through in `seconds`, under a cap. */
function ticks(hz: number, maxFps: number, seconds = 1): number[] {
  const out: number[] = [];
  let last = -Infinity;
  const frame = 1000 / hz;
  for (let t = 0; t < seconds * 1000; t += frame) {
    const next = nextTick(t, last, maxFps);
    if (next !== null) {
      last = next;
      out.push(t);
    }
  }
  return out;
}

describe("nextTick", () => {
  it.each([5, 15, 30, 60])("lets %i ticks through in a second at 240 Hz (±1)", (fps) => {
    expect(Math.abs(ticks(240, fps).length - fps)).toBeLessThanOrEqual(1);
  });

  it("ticks every frame when unlimited", () => {
    expect(ticks(240, 0)).toEqual(ticks(240, 1e9));
  });

  it("holds the rate on a display slower than the cap grid (144 Hz, 60 fps)", () => {
    expect(Math.abs(ticks(144, 60).length - 60)).toBeLessThanOrEqual(1);
  });

  it("does not drift over a minute", () => {
    const n = ticks(240, 30, 60).length;
    expect(Math.abs(n - 30 * 60)).toBeLessThanOrEqual(1);
  });

  it("restarts from now after a stall instead of bursting", () => {
    expect(nextTick(5000, 0, 30)).toBe(5000);
    expect(nextTick(5010, 5000, 30)).toBeNull();
  });
});

describe("wakeDelay", () => {
  it("sleeps until the next tick is due, less slack", () => {
    expect(wakeDelay(1000, 1000, 30)).toBeCloseTo(1000 / 30 - 2);
    expect(wakeDelay(1020, 1000, 30)).toBeCloseTo(1000 / 30 - 20 - 2);
  });

  it("asks at once when due, uncapped or before the first tick", () => {
    expect(wakeDelay(1040, 1000, 30)).toBe(0);
    expect(wakeDelay(1000, 1000, 0)).toBe(0);
    expect(wakeDelay(1000, -Infinity, 30)).toBe(0);
  });
});
