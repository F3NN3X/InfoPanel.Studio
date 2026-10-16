import { describe, expect, it } from "vitest";
import { cssColor } from "./color.ts";
import {
  barLength,
  barParts,
  donutParts,
  donutPercent,
  gaugeFrame,
  gradientAngle,
  gradientPaint,
  graphParts,
  piePath,
  rotatePoints,
  roundAway,
  roundHalfEven,
  roundRectPath,
  shapeGeometry,
  toInt,
  type GraphInput,
} from "./geometry.ts";

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

  const bar = { width: 100, height: 20, value: 50, min: 0, max: 100, cornerRadius: 0, frame: true, frameColor: "#FF000000",
    background: true, backgroundColor: "#FF111111", color: "#FFFF0000", gradient: false, gradientColor: "#FF0000FF" };

  it("insets fill and background by 1 px inside a frame, and strokes the frame on half pixels", () => {
    const [bg, fill, frame] = barParts(bar);
    expect(bg.d).toBe("M1 1L99 1L99 19L1 19Z");
    expect(fill.d).toBe("M1 1L51 1L51 19L1 19Z");
    expect(frame).toMatchObject({ op: "stroke", d: "M0.5 0.5L99.5 0.5L99.5 19.5L0.5 19.5Z", width: 1 });
  });

  it("fills vertical bars from the bottom and skips an empty fill", () => {
    const parts = barParts({ ...bar, width: 20, height: 100, frame: false, background: false, value: 25 });
    expect(parts).toEqual([{ op: "fill", d: "M0 75L20 75L20 100L0 100Z", paint: { kind: "solid", color: "#FFFF0000" } }]);
    expect(barParts({ ...bar, value: 0, background: false, frame: false })).toEqual([]);
  });

  it("shades the gradient across the filled part's diagonal: solid first half, then to GradientColor", () => {
    const fill = barParts({ ...bar, frame: false, background: false, gradient: true, value: 30 })[0];
    expect(fill.paint).toMatchObject({ kind: "linear", y1: 10, y2: 10, stops: [{ color: "#FFFF0000" }, { color: "#FFFF0000", offset: 0.5 }, { color: "#FF0000FF" }] });
    const p = fill.paint as Extract<typeof fill.paint, { kind: "linear" }>;
    expect(p.x1).toBeCloseTo(15 - Math.hypot(30, 20) / 2);
    expect(p.x2).toBeCloseTo(15 + Math.hypot(30, 20) / 2);
  });

  it("clamps oversized corner radii like SKRoundRect", () => {
    expect(roundRectPath(0, 0, 10, 4, 50)).toBe("M2 0H8A2 2 0 0 1 10 2V2A2 2 0 0 1 8 4H2A2 2 0 0 1 0 2V2A2 2 0 0 1 2 0Z");
  });
});

describe("graph", () => {
  const g: GraphInput = { type: "LINE", width: 10, height: 12, samples: [], min: 0, max: 100, auto: false, thickness: 2, step: 4,
    fill: false, fillColor: "", color: "#FF00FF00", frame: false, frameColor: "", background: false, backgroundColor: "" };

  it("draws nothing at all without samples, not even the frame", () => {
    expect(graphParts({ ...g, frame: true, background: true })).toEqual([]);
  });

  it("puts the window's oldest sample at the right edge", () => {
    // size = 10/4 = 2, +2 since 2×4 ≠ 10 → 4 samples: the last four, oldest first.
    const [line] = graphParts({ ...g, samples: [99, 0, 50, 100, 25] });
    // v = round(norm × (12 − 2)); y = (int)(12 − (v + 1))
    expect(line.d).toBe("M12 14L10 11L6 6L2 1L-2 8L-4 14");
  });

  it("clamps against MaxValue, not the span, so a raised MinValue overshoots the top", () => {
    // min(200 − 50, 60) / 10 × 10 = 60 → y = (int)(12 − 61)
    const [line] = graphParts({ ...g, min: 50, max: 60, samples: [200] });
    expect(line.d).toBe("M12 14L10 -49L8 14");
  });

  it("lays histogram bars from the right, step apart", () => {
    const parts = graphParts({ ...g, type: "HISTOGRAM", width: 20, samples: [50, 100] });
    // offset = 2 + 4 + 2; first bar spans x 16..18; maxHeight = 9.
    expect(parts.map((p) => p.d)).toEqual(["M16 6L18 6L18 11L16 11Z", "M8 2L10 2L10 11L8 11Z"]);
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

  it("frames a full ring as two 1 px annuli", () => {
    const parts = donutParts({ width: 42, value: 0, min: 0, max: 100, thickness: 5, span: 360, color: "c", background: true, backgroundColor: "b", frame: true, frameColor: "f" });
    expect(parts.map((p) => p.op)).toEqual(["fill", "fill", "fill"]);
  });
});

describe("gauge frame", () => {
  it("rounds half to even", () => {
    // 5 frames: step 25; 37.5 / 25 = 1.5 → 2; 62.5 / 25 = 2.5 → 2.
    expect(gaugeFrame(5, 37.5, 0, 100)).toBe(2);
    expect(gaugeFrame(5, 62.5, 0, 100)).toBe(2);
    expect(gaugeFrame(5, 87.5, 0, 100)).toBe(4);
  });
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
  it("builds the plus from int thirds", () => {
    expect(shapeGeometry("Plus", 0, 0, 9, 9, 0).d).toBe("M3 0L6 0L6 3L9 3L9 6L6 6L6 9L3 9L3 6L0 6L0 3L3 3Z");
  });
  it("stretches the star to the box with 0.382 inner points", () => {
    const star = shapeGeometry("Star", 0, 0, 100, 50, 0);
    expect(star.points[0]).toEqual([50, 0]);
    expect(star.points[1][0]).toBeCloseTo(50 + 0.382 * 50 * Math.cos((-54 * Math.PI) / 180));
  });
  it("rotates about the centre", () => {
    const [p] = rotatePoints([[10, 0]], 90, 0, 0);
    expect(p[0]).toBeCloseTo(0);
    expect(p[1]).toBeCloseTo(10);
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
  it("starts a sweep at the angle measured from 12 o'clock", () => {
    expect(gradientPaint(b, "a", "b", "c", 30, "Sweep")).toMatchObject({ kind: "conic", cx: 20, cy: 15, from: 30 });
    expect(gradientPaint(b, "a", "b", "c", 30, "Spiral")).toMatchObject({ kind: "conic", from: 120 });
  });
  it("animates by speed from zero, ignoring the base angle, and turns backwards for a negative angle", () => {
    expect(gradientAngle(45, 0, 10)).toBe(45);
    expect(gradientAngle(45, 300, 1.5)).toBe(90); // 450 % 360
    expect(gradientAngle(-45, 300, 0.5)).toBe(210); // -150 + 360
  });
});
