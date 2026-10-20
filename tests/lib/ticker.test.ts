import { describe, expect, it } from "vitest";
import { nextTick } from "@/lib/ticker";

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
