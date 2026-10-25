import { describe, expect, it } from "vitest";
import { backdropFilter, backdropMargin, clampBlur } from "@/lib/effects/blur";

describe("blur", () => {
  it("is zero (no blur) for anything that is not a positive number, else a whole radius up to 64", () => {
    expect([clampBlur(undefined), clampBlur("8"), clampBlur(NaN), clampBlur(0), clampBlur(0.2), clampBlur(-4)]).toEqual([0, 0, 0, 0, 0, 0]);
    expect([clampBlur(0.6), clampBlur(11.4), clampBlur(500)]).toEqual([1, 11, 64]);
  });

  it("is one CSS filter for the live backdrop and the baked canvas, and a margin for the bake", () => {
    expect(backdropFilter(12)).toBe("blur(12px) saturate(1.25)");
    expect(backdropMargin(10)).toBe(30);
  });
});
