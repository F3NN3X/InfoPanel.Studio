// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VizInput } from "@/widgets/core/viz/types";
import { DEFAULT_LOOK } from "@/widgets/core/viz/types";

type Listener = (nowMs: number) => void;
const loop = vi.hoisted(() => ({ update: new Set<(t: number) => void>(), paint: new Set<(t: number) => void>() }));
const drawn = vi.hoisted(() => ({ first: [] as number[] }));

vi.mock("@/lib/audio/frame-loop", () => ({
  MAX_FRAME_GAP_MS: 250,
  subscribeFrame: (l: Listener, phase: "update" | "paint" = "paint") => {
    loop[phase].add(l);
    return () => void loop[phase].delete(l);
  },
}));
vi.mock("@/widgets/core/viz/palette", () => ({
  createCssResolver: () => ({ resolve: () => "#fff", dispose: () => {} }),
  paletteSpec: () => ({}),
  resolvePalette: () => ({ stops: [[255, 255, 255]], opacity: 1, glow: false }),
  css: () => "#fff",
}));
vi.mock("@/widgets/core/viz/draw", async (orig) => {
  const real = await orig<typeof import("@/widgets/core/viz/draw")>();
  const bars = (_c: unknown, _w: number, _h: number, input: VizInput) => void drawn.first.push(input.bands[0]);
  return { ...real, DRAW: new Proxy(real.DRAW, { get: () => bars }) };
});

import { createVizEngine } from "@/widgets/core/viz/engine";

const tick = (t: number) => {
  for (const phase of [loop.update, loop.paint]) for (const l of [...phase]) l(t);
};

beforeEach(() => {
  loop.update.clear();
  loop.paint.clear();
  drawn.first = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    setTransform() {},
    clearRect() {},
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 100, height: 40 } as DOMRect);
});
afterEach(() => vi.restoreAllMocks());

describe("viz engine under reduced motion", () => {
  it("repaints the still frame once the input has stepped, then sleeps", () => {
    const host = document.createElement("div");
    const canvas = document.createElement("canvas");
    host.append(canvas);
    document.body.append(host);
    // Like the hook's getter: the first read returns the unstepped (silent) input and starts an update that fills it.
    const input: VizInput = { bands: new Float32Array(32), wave: null, history: { buf: new Float32Array(4), start: 0, length: 0 }, level: 0, source: "none" };
    let reading = false;
    const getter = () => {
      if (!reading) {
        reading = true;
        loop.update.add(() => input.bands.fill(1));
      }
      return input;
    };
    const engine = createVizEngine(canvas);
    engine.setLook({ style: "bars", look: { ...DEFAULT_LOOK, peaks: false, fade: 0 }, skin: { meter: "bars", glow: false } as never, reduced: true });
    engine.setInput(getter);
    expect(drawn.first).toEqual([0]);

    tick(100);
    expect(drawn.first).toEqual([0, 1]);
    expect(loop.paint.size).toBe(0);
    tick(200);
    expect(drawn.first).toEqual([0, 1]);
    engine.dispose();
    host.remove();
  });

  it("paints the still frame again on screen when its repaint frame came while off screen", () => {
    let report: (entries: { isIntersecting: boolean }[]) => void = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: typeof report) {
          report = cb;
        }
        observe() {}
        disconnect() {}
      }
    );
    const host = document.createElement("div");
    const canvas = document.createElement("canvas");
    host.append(canvas);
    document.body.append(host);
    const input: VizInput = { bands: new Float32Array(32), wave: null, history: { buf: new Float32Array(4), start: 0, length: 0 }, level: 0, source: "none" };
    let reading = false;
    const getter = () => {
      if (!reading) {
        reading = true;
        loop.update.add(() => input.bands.fill(1));
      }
      return input;
    };
    const engine = createVizEngine(canvas);
    engine.setLook({ style: "bars", look: { ...DEFAULT_LOOK, peaks: false, fade: 0 }, skin: { meter: "bars", glow: false } as never, reduced: true });
    engine.setInput(getter);
    expect(drawn.first).toEqual([0]);

    // Scrolled away before the next frame (a long page mounting every widget at once).
    report([{ isIntersecting: false }]);
    tick(100);
    expect(drawn.first).toEqual([0]);
    report([{ isIntersecting: true }]);
    expect(drawn.first).toEqual([0, 1]);
    engine.dispose();
    host.remove();
  });
});
