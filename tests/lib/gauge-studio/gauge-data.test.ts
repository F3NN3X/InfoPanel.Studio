import { describe, expect, it } from "vitest";
import { DEFAULT_GAUGE } from "@/lib/infopanel/gauges/vector";
import { frameFiles, gaugeDataFor } from "@/lib/gauge-studio/gauge-data";
import type { LibraryFrame } from "@/lib/gauge-studio/model";

const frame = (n: number): LibraryFrame => ({ id: `${String(n).repeat(64)}.png`, name: `f${n}.png` });

describe("gaugeDataFor", () => {
  it("stores a spec alone with the default range and no frame rate", () => {
    expect(gaugeDataFor({ gauge: DEFAULT_GAUGE })).toEqual({ vector: DEFAULT_GAUGE, min: 0, max: 100, animationSpeed: 0 });
  });

  it("stores frames alone with the range and frame rate given", () => {
    expect(gaugeDataFor({ gauge: null, frames: [frame(1), frame(2)], min: 20, max: 80, animationSpeed: 12 })).toEqual({
      frames: [frame(1), frame(2)], min: 20, max: 80, animationSpeed: 12,
    });
  });

  it("takes the spec's own scale before the given range", () => {
    const scaled = { ...DEFAULT_GAUGE, scale: { min: 5, max: 50, unit: "", decimals: 0 } };
    expect(gaugeDataFor({ gauge: scaled, min: 1, max: 2 })).toMatchObject({ min: 5, max: 50 });
  });

  it("leaves what it is not given as the item had it", () => {
    const prev = { frames: [frame(7)], min: 10, max: 90, animationSpeed: 3, source: "Rig" };
    expect(gaugeDataFor({ gauge: DEFAULT_GAUGE, prev })).toMatchObject({ frames: [frame(7)], min: 10, max: 90, animationSpeed: 3, source: "Rig" });
    expect(gaugeDataFor({ gauge: null, frames: [frame(1)], animationSpeed: 0, prev })).toMatchObject({ frames: [frame(1)], animationSpeed: 0, source: "Rig" });
  });

  it("leaves empty frames out, and takes a new source over the old", () => {
    expect(gaugeDataFor({ gauge: DEFAULT_GAUGE, frames: [] })).not.toHaveProperty("frames");
    expect(gaugeDataFor({ gauge: DEFAULT_GAUGE, source: "Home", prev: { source: "Rig" } }).source).toBe("Home");
  });
});

describe("frameFiles", () => {
  it("lists each asset once, in order", () => {
    expect(frameFiles([frame(2), frame(1), frame(2)])).toEqual([frame(2).id, frame(1).id]);
    expect(frameFiles(undefined)).toEqual([]);
  });
});
