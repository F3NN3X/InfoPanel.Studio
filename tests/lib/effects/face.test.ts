import { describe, expect, it } from "vitest";
import { DEFAULT_FACE, FACE_PATTERNS, faceTile, normalizeFace } from "@/lib/effects/face";
import { DEFAULT_GAUGE, normalizeGauge } from "@/lib/infopanel/gauges/vector";
import { gaugeSvg } from "@/lib/infopanel/gauges/vector-svg";

const hex = (v: unknown, def: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : def);
const ring = { ...DEFAULT_GAUGE, start: 0, sweep: 360 };

describe("ring face", () => {
  it("reads a face from untrusted data: a known pattern, numbers in range, colours checked", () => {
    expect(normalizeFace(undefined, hex)).toBeNull();
    expect(normalizeFace("hex", hex)).toBeNull();
    expect(normalizeFace({ pattern: "wood", color: "red", opacity: 9, size: 1, fill: 5 }, hex)).toEqual({ ...DEFAULT_FACE, opacity: 1, size: 4 });
    expect(normalizeFace({ pattern: "carbon", color: "#abcdef", fill: null }, hex)).toMatchObject({ pattern: "carbon", color: "#ABCDEF", fill: null });
  });

  it("tiles every pattern with markup that repeats", () => {
    for (const p of FACE_PATTERNS) {
      const t = faceTile(p, 14, "#FFF");
      expect(t.w).toBeGreaterThan(0);
      expect(t.h).toBeGreaterThan(0);
      expect(t.markup).toContain("#FFF");
    }
    // A hexagon lattice: one hexagon wide, three radii tall.
    expect(faceTile("hex", 20, "#FFF")).toMatchObject({ w: expect.closeTo(Math.sqrt(3) * 10, 5), h: 30 });
  });

  it("a gauge keeps its face through normalizeGauge and drops a broken one", () => {
    expect(normalizeGauge({ ...ring, face: { pattern: "dots" } }).face).toMatchObject({ pattern: "dots" });
    expect(normalizeGauge({ ...ring, face: 3 })).not.toHaveProperty("face");
    expect(normalizeGauge(ring)).not.toHaveProperty("face");
  });

  it("draws the face under the arc, in a layer of its own that does not depend on the value", () => {
    const g = normalizeGauge({ ...ring, face: DEFAULT_FACE });
    const whole = gaugeSvg(g, 0.4);
    expect(whole).toContain("<pattern");
    expect(whole.indexOf("<pattern")).toBeLessThan(whole.indexOf("stroke-linecap"));
    // The static layer: only the face, identical at any value; the body: no face, so the moving arc never repaints it.
    expect(gaugeSvg(g, 0.1, { layer: "face" })).toBe(gaugeSvg(g, 0.9, { layer: "face" }));
    expect(gaugeSvg(g, 0.5, { layer: "face" })).not.toContain("stroke-linecap");
    expect(gaugeSvg(g, 0.5, { layer: "body" })).not.toContain("<pattern");
    expect(gaugeSvg(g, 0.5, { layer: "body" })).toContain("stroke-linecap");
  });

  it("a face sits inside the ring's stroke, and a gauge without one draws as before", () => {
    const svg = gaugeSvg(normalizeGauge({ ...ring, width: 200, height: 200, thickness: 20, face: DEFAULT_FACE }), 0.5, { layer: "face" });
    const radius = Number(/<circle[^>]*r="([\d.]+)"/.exec(svg)![1]);
    // The arc's radius is 200/2 - 20/2 - 1 = 89; its inner edge is 79; the face stops a pixel short of it.
    expect(radius).toBe(78);
    expect(gaugeSvg(normalizeGauge(ring), 0.5)).not.toContain("<pattern");
  });
});
