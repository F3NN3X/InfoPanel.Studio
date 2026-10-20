import { describe, expect, it } from "vitest";
import { cssColor } from "@/lib/infopanel/render/color.ts";
import {
  barLength,
  donutParts,
  donutPercent,
  gaugeFrame,
  gradientPaint,
  graphParts,
  piePath,
  roundAway,
  roundHalfEven,
  shapeGeometry,
  toInt,
  type GraphInput,
} from "@/lib/infopanel/render/geometry.ts";

describe("C# numerics", () => {
  it("rounds half to even and away from zero", () => {
    expect([0.5, 1.5, 2.5, -0.5, -1.5, 2.4999].map(roundHalfEven)).toEqual([0, 2, 2, 0, -2, 2]);
    expect([0.5, 1.5, 2.5, -0.5, -2.5].map(roundAway)).toEqual([1, 2, 3, -1, -3]);
  });
  it("casts NaN, infinities and out-of-range values to int.MinValue (.NET 8 x64)", () => {
    expect([1.9, -1.9, NaN, Infinity, 2 ** 40].map(toInt)).toEqual([1, -1, -(2 ** 31), -(2 ** 31), -(2 ** 31)]);
  });
});

describe("cssColor", () => {
  it("reads Skia's #ARGB forms, alpha first", () => {
    expect(cssColor("#FF112233")).toBe("rgb(17 34 51)");
    expect(cssColor("#80112233")).toBe("rgb(17 34 51 / 0.502)");
    expect(cssColor("112233")).toBe("rgb(17 34 51)");
    expect(cssColor("#8abc")).toBe("rgb(170 187 204 / 0.5333)");
    expect(cssColor("red")).toBeNull();
  });
});

describe("bar", () => {
  it("fills round(norm × the longer side), clamped", () => {
    expect(barLength(50, 0, 100, 201, 10)).toBe(101); // 100.5 rounds away from zero
    expect(barLength(150, 0, 100, 200, 10)).toBe(200);
    expect(barLength(5, 10, 10, 200, 10)).toBe(0); // empty range
  });

});

describe("graph", () => {
  const g: GraphInput = { type: "LINE", width: 10, height: 12, samples: [], min: 0, max: 100, auto: false, thickness: 2, step: 4,
    fill: false, fillColor: "", color: "#FF00FF00", frame: false, frameColor: "", background: false, backgroundColor: "" };

  it("puts the window's oldest sample at the right edge", () => {
    // size = 10/4 = 2, +2 since 2×4 ≠ 10 → 4 samples: the last four, oldest first.
    const [line] = graphParts({ ...g, samples: [99, 0, 50, 100, 25] });
    // v = round(norm × (12 − 2)); y = (int)(12 − (v + 1))
    expect(line.d).toBe("M12 14L10 11L6 6L2 1L-2 8L-4 14");
  });

});

describe("donut", () => {
  it("truncates the percentage", () => {
    expect(donutPercent(33.99, 0, 100)).toBe(33);
    expect(donutPercent(150, 0, 100)).toBe(100);
  });

  it("is a full ring at 100% of 360°, a pie otherwise, starting at 3 o'clock", () => {
    const base = { width: 42, min: 0, max: 100, thickness: 5, span: 360, color: "c", background: false, backgroundColor: "b", frame: false, frameColor: "f" };
    // radius = 42/2 − 1 = 20, centre 21.
    expect(donutParts({ ...base, value: 100 })[0].d).toBe(
      "M41 21A20 20 0 1 1 1 21A20 20 0 1 1 41 21ZM36 21A15 15 0 1 0 6 21A15 15 0 1 0 36 21Z",
    );
    expect(donutParts({ ...base, value: 25 })[0].d).toBe(piePath(21, 21, 20, 15, 0, 90));
    expect(piePath(21, 21, 20, 15, 0, 90)).toBe("M41 21A20 20 0 0 1 21 41L21 36A15 15 0 0 0 36 21Z");
  });

});

describe("gauge frame", () => {
  it("clamps, and an empty range or a missing reading shows the first frame", () => {
    expect(gaugeFrame(5, 500, 0, 100)).toBe(4);
    expect(gaugeFrame(5, -5, 0, 100)).toBe(0);
    expect(gaugeFrame(5, 50, 50, 50)).toBe(0);
    expect(gaugeFrame(5, null, 0, 100)).toBe(0);
  });
});

describe("shapes", () => {
  it("uses integer centres", () => {
    const tri = shapeGeometry("Triangle", 0, 0, 5, 5, 0);
    expect(tri).toMatchObject({ cx: 2, cy: 2, d: "M2 0L0 5L5 5Z" });
  });
});

describe("shape gradients", () => {
  const b = { left: 0, top: 0, right: 40, bottom: 30 };
  it("runs a Linear gradient along 90° − angle through the centre, over the half diagonal", () => {
    const p = gradientPaint(b, "a", "b", "c", 90, "Linear");
    expect(p).toMatchObject({ kind: "linear", stops: [{ color: "a", offset: 0 }, { color: "b", offset: 0.5 }, { color: "c", offset: 1 }] });
    if (p.kind !== "linear") throw new Error();
    expect([p.x1, p.y1, p.x2, p.y2].map((v) => +v.toFixed(6))).toEqual([-5, 15, 45, 15]);
  });
});
