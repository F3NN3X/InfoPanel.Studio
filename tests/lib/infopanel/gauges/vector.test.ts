import { describe, expect, it } from "vitest";
import { SAMPLE_TEMPLATE, STARTERS } from "@/lib/infopanel/gauges/presets.ts";
import { arcPath, colorAt, DEFAULT_GAUGE, gaugePrims, MAX_TEMPLATE, normalizeGauge, zoneAt, type VectorGauge } from "@/lib/infopanel/gauges/vector.ts";
import { gaugeSvg } from "@/lib/infopanel/gauges/vector-svg.ts";

const stops = [{ at: 0, color: "#000000" }, { at: 100, color: "#FFFFFF" }];
const arc = (over: Partial<VectorGauge> = {}): VectorGauge => ({ ...DEFAULT_GAUGE, track: null, ...over });

describe("colours", () => {
  it("interpolates gradient stops and picks zones by their start", () => {
    expect(colorAt(stops, 50)).toBe("#808080");
    expect(colorAt(stops, -5)).toBe("#000000");
    expect(colorAt([{ at: 50, color: "#ff0000" }], 80)).toBe("#FF0000");
    const zones = [{ at: 0, color: "#00FF00" }, { at: 80, color: "#FF0000" }];
    expect([zoneAt(zones, 79), zoneAt(zones, 80)]).toEqual(["#00FF00", "#FF0000"]);
  });

});

describe("arc", () => {
  it("draws clockwise from 12 o'clock, a full turn as two halves", () => {
    expect(arcPath(50, 50, 40, 0, 90)).toBe("M50 10A40 40 0 0 1 90 50");
    expect(arcPath(50, 50, 40, -90, 180)).toBe("M10 50A40 40 0 1 1 50 90");
    expect(arcPath(50, 50, 40, 0, 360).match(/A/g)).toHaveLength(2);
    expect(arcPath(50, 50, 40, 10, 10)).toBe("");
  });

  it("fills to the value over the track, from the end when reversed", () => {
    const [track, fill] = gaugePrims(arc({ track: "#111111", start: 0, sweep: 360, width: 100, height: 100, thickness: 10 }), 0.25);
    expect(track).toMatchObject({ kind: "path", stroke: "#111111", width: 10, cap: "round" });
    // r = 50 - 5 - 1 = 44: a quarter turn from the top ends at the right.
    expect(fill).toMatchObject({ d: "M50 6A44 44 0 0 1 94 50", stroke: DEFAULT_GAUGE.fill.color });
    const [rev] = gaugePrims(arc({ start: 0, sweep: 360, width: 100, height: 100, thickness: 10, reverse: true }), 0.25);
    expect(rev.kind === "path" && rev.d.startsWith("M6 50")).toBe(true);
    expect(gaugePrims(arc(), 0)).toEqual([]);
  });

});

describe("svg and specs", () => {
  it("serializes to a standalone SVG with gradient defs", () => {
    const svg = gaugeSvg(arc({ shape: "bar", width: 102, height: 20, fill: { mode: "gradient", color: "#000000", stops } }), 1);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="102" height="20"/);
    expect(svg).toContain('<linearGradient id="g0" gradientUnits="userSpaceOnUse"');
    expect(svg).toContain('style="fill:url(#g0)"');
  });

  it("normalizes untrusted specs: known fields, clamped numbers, hex colours", () => {
    const g = normalizeGauge({ shape: "bar", width: 99999, track: null, fill: { mode: "evil", color: "red", stops: [{ at: 500, color: "#00ff00" }, { at: 1, color: "url(x)" }] }, needle: {}, extra: 1 });
    expect(g).toMatchObject({ shape: "bar", width: 2048, track: null, fill: { mode: "solid", color: DEFAULT_GAUGE.fill.color, stops: [{ at: 100, color: "#00FF00" }] } });
    expect(g.needle).toEqual({ color: "#F1F5F9", length: 0.85, width: 6 });
    expect("extra" in g).toBe(false);
    for (const s of STARTERS) expect(normalizeGauge(s.gauge)).toEqual(s.gauge);
  });
});

describe("svg templates", () => {
  const svg = (over: Partial<VectorGauge> = {}) => arc({ shape: "svg", template: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect/></svg>', ...over });

  it("keeps a template only on shape svg, when it is an <svg> within the size limit", () => {
    expect(normalizeGauge(svg())).toEqual(svg());
    expect(normalizeGauge({ ...svg(), template: "<html/>" })).toMatchObject({ shape: "arc" });
    expect("template" in normalizeGauge({ ...svg(), template: "<html/>" })).toBe(false);
    expect("template" in normalizeGauge({ ...svg(), shape: "bar" })).toBe(false);
    expect(normalizeGauge({ ...svg(), template: `<svg>${" ".repeat(MAX_TEMPLATE)}</svg>` }).shape).toBe("arc");
    expect(SAMPLE_TEMPLATE).toMatch(/var\(--value\)/);
  });
});
