import { describe, expect, it } from "vitest";
import { presetsThatFit, runningClockPx } from "@/widgets/Timer";

describe("presetsThatFit", () => {
  it("shows all before the box is measured", () => {
    expect(presetsThatFit(5, 0, 0)).toBe(5);
  });

  it("counts whole 40px chip rows: one row fits from 40px tall, two from 86px", () => {
    expect(presetsThatFit(9, 300, 40)).toBe(5);
    expect(presetsThatFit(9, 300, 85)).toBe(5);
    expect(presetsThatFit(9, 300, 86)).toBe(9);
  });

  it("keeps one chip per row in a narrow box", () => {
    expect(presetsThatFit(4, 40, 100)).toBe(2);
  });
});

describe("runningClockPx", () => {
  it("leaves the 40px Pause / Stop row and its gap under the clock in a short box", () => {
    for (const h of [60, 64, 70, 100, 140]) {
      const px = runningClockPx("md", 300, h);
      if (px > 18) expect(px + 46).toBeLessThanOrEqual(h);
    }
  });

  it("is capped by the width", () => {
    expect(runningClockPx("md", 100, 400)).toBeCloseTo(92 / 4.2);
  });
});
