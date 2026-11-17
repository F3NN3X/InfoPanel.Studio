import { describe, expect, it } from "vitest";
import { idleHeroPx, presetsThatFit, runningClockPx } from "@/widgets/timer/Timer";

describe("presetsThatFit", () => {
  it("shows all before the box is measured", () => {
    expect(presetsThatFit(5, 0, 0)).toBe(5);
  });

  it("counts whole 44px chip rows: one row fits from 44px tall, two from 94px", () => {
    expect(presetsThatFit(9, 300, 44)).toBe(5);
    expect(presetsThatFit(9, 300, 93)).toBe(5);
    expect(presetsThatFit(9, 300, 94)).toBe(9);
  });

  it("keeps one chip per row in a narrow box", () => {
    expect(presetsThatFit(4, 40, 100)).toBe(2);
  });
});

describe("runningClockPx", () => {
  it("leaves the 44px Pause / Stop row and its gap under the clock in a short box", () => {
    for (const h of [60, 64, 70, 100, 140]) {
      const px = runningClockPx("md", 300, h);
      if (px > 18) expect(px + 50).toBeLessThanOrEqual(h);
    }
  });

  it("is capped by the width", () => {
    expect(runningClockPx("md", 100, 400)).toBeCloseTo(92 / 4.2);
  });
});

describe("idleHeroPx", () => {
  it("is 48px for 05:00 and shrinks for an hour-long 01:30:00 so it fits a 2x2", () => {
    expect(idleHeroPx("05:00", 196)).toBe(48);
    expect(idleHeroPx("01:30:00", 196) * 8 * 0.62).toBeLessThanOrEqual(196 - 16);
    expect(idleHeroPx("01:30:00", 196)).toBeLessThan(48);
    expect(idleHeroPx("05:00", 0)).toBe(48);
  });
});
