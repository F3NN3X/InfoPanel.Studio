import { describe, expect, it } from "vitest";
import { DEFAULT_GAUGE } from "@/lib/infopanel/gauges/vector";
import { editFrames, framesData, openFramesCopy, withSpeed, withVectorSpec } from "./frames-copy";
import type { LibraryFrame } from "./model";

const frame = (n: number): LibraryFrame => ({ id: `${String(n).repeat(64)}.png`, name: `f${n}.png` });
const origin = { kind: "library", itemId: "a" } as const;
const open = () => openFramesCopy("Sprites", origin, [frame(1), frame(2), frame(3)], 5);

describe("what saving stores", () => {
  it("is the frames and frame rate, the item's range and source kept", () => {
    const fc = editFrames(open(), withSpeed(open().state, 0), undefined, 0);
    const prev = { frames: [frame(7)], min: 10, max: 90, animationSpeed: 5, source: "Rig" };
    expect(framesData(fc, prev)).toEqual({ frames: [frame(1), frame(2), frame(3)], min: 10, max: 90, animationSpeed: 0, source: "Rig" });
  });

  it("adds the spec once converted, and its scale sets the range", () => {
    const scaled = { ...DEFAULT_GAUGE, scale: { min: 5, max: 50, unit: "", decimals: 0 } };
    const fc = editFrames(open(), withVectorSpec(open().state, scaled), undefined, 0);
    expect(framesData(fc, { min: 10, max: 90, animationSpeed: 5 })).toMatchObject({ vector: scaled, min: 5, max: 50, animationSpeed: 5 });
    expect(framesData(fc).frames).toHaveLength(3);
  });
});
