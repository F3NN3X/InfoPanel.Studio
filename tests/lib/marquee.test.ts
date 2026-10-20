import { describe, expect, it } from "vitest";
import { marqueeOffset } from "@/lib/marquee";

describe("marqueeOffset", () => {
  it("moves left at speed px per second", () => {
    expect(marqueeOffset(0, 50, 200, 40)).toBe(0);
    expect(marqueeOffset(1000, 50, 200, 40)).toBe(-50);
    expect(marqueeOffset(2500, 30, 200, 40)).toBe(-75);
  });

  it("wraps after the content plus its spacing", () => {
    // One loop is 200 + 40 = 240 px: 4.8 s at 50 px/s.
    expect(marqueeOffset(4800, 50, 200, 40)).toBe(0);
    expect(marqueeOffset(5800, 50, 200, 40)).toBe(-50);
  });

  it("depends on elapsed time only, not on how many frames drew it", () => {
    // Ticking at 5 or at 30 fps, the last tick of the first second lands where 1 s of elapsed time does.
    const last = (fps: number) => marqueeOffset(((fps - 1) * 1000) / fps + 1000 / fps, 80, 300, 20);
    expect(last(5)).toBe(last(30));
    expect(last(30)).toBe(-80);
  });

  it("stays still with nothing to scroll or no speed", () => {
    expect(marqueeOffset(1000, 50, 0, 0)).toBe(0);
    expect(marqueeOffset(1000, 0, 200, 40)).toBe(0);
    expect(marqueeOffset(-5, 50, 200, 40)).toBe(0);
  });
});
