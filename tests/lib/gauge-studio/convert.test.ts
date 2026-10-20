import { describe, expect, it } from "vitest";
import { STARTERS } from "@/lib/infopanel/gauges/presets";
import { convertSpec } from "@/lib/gauge-studio/convert";

describe("convertSpec", () => {
  it("takes a wide frame as a bar and a tall one as the vertical bar, at the frame's size", () => {
    const wide = convertSpec({ width: 600, height: 50 });
    expect(wide).toMatchObject({ shape: "bar", orientation: "horizontal", width: 600, height: 50 });
    const tall = convertSpec({ width: 40, height: 260 });
    expect(tall).toMatchObject({ shape: "bar", orientation: "vertical", width: 40, height: 260 });
  });

  it("takes a square frame as a dial and never the template preset", () => {
    for (const size of [{ width: 256, height: 256 }, { width: 200, height: 200 }, { width: 4, height: 4 }]) {
      const g = convertSpec(size);
      expect(g.shape).toBe("arc");
      expect(g.template).toBeUndefined();
      expect([g.width, g.height]).toEqual([size.width, size.height]);
    }
  });

  it("rounds a fractional size to whole pixels and keeps an empty one at the spec minimum", () => {
    expect(convertSpec({ width: 99.6, height: 0 })).toMatchObject({ width: 100, height: 4 });
  });

  it("starts from a preset's other fields", () => {
    const g = convertSpec({ width: 300, height: 24 });
    const bar = STARTERS.find((s) => s.name === "Bar")!.gauge;
    expect(g.thickness).toBe(bar.thickness);
  });
});

describe("scaled starting spec", () => {
  it("scales the ring and text with a small frame", () => {
    const dial = convertSpec({ width: 60, height: 60 });
    const big = convertSpec({ width: 200, height: 200 });
    expect(dial.thickness).toBeLessThan(big.thickness);
    expect(dial.thickness).toBeGreaterThanOrEqual(1);
    if (dial.ticks && big.ticks) expect(dial.ticks.length).toBeLessThanOrEqual(big.ticks.length);
  });
});
