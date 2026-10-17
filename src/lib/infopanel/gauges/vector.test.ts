import { describe, expect, it } from "vitest";
import { SAMPLE_TEMPLATE, STARTERS } from "./presets.ts";
import { arcPath, colorAt, DEFAULT_GAUGE, fraction, gaugePrims, MAX_TEMPLATE, normalizeGauge, templateVars, withValue, zoneAt, type VectorGauge } from "./vector.ts";
import { gaugeSvg } from "./vector-svg.ts";

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

  it("maps a value over Min..Max, clamped", () => {
    expect([fraction(50, 0, 200), fraction(-1, 0, 100), fraction(500, 0, 100), fraction(null, 0, 100), fraction(5, 5, 5)]).toEqual([0.25, 0, 1, 0, 0]);
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

  it("lights segments by value, each in its zone; unlit ones in the track colour", () => {
    const g = arc({ segments: 4, gap: 0, track: "#222222", fill: { mode: "zones", color: "#000000", stops: [{ at: 0, color: "#00FF00" }, { at: 50, color: "#FF0000" }] } });
    expect(gaugePrims(g, 0.75).map((p) => p.kind === "path" && p.stroke)).toEqual(["#00FF00", "#00FF00", "#FF0000", "#222222"]);
  });

  it("colours a gradient by place in the whole range, not in the filled part", () => {
    const g = arc({ fill: { mode: "gradient", color: "#000000", stops }, rounded: false });
    const half = gaugePrims(g, 0.5);
    const last = half.at(-1);
    // 45 pieces of 3°; the last one's middle is 133.5° of 270°, so mid-grey, not the end colour.
    expect(last?.kind === "path" && last.stroke).toBe(colorAt(stops, (133.5 / 270) * 100));
  });

  it("adds ticks outside the arc and a needle at the value", () => {
    const prims = gaugePrims(arc({ ticks: { count: 3, length: 5, width: 1, color: "#AAAAAA" }, needle: { color: "#FFFFFF", length: 1, width: 4 } }), 1);
    expect(prims.filter((p) => p.kind === "path" && p.stroke === "#AAAAAA")).toHaveLength(1);
    expect(prims.filter((p) => p.kind === "path" && p.fill === "#FFFFFF")).toHaveLength(2);
  });
});

describe("bar", () => {
  const bar = (over: Partial<VectorGauge> = {}) => arc({ shape: "bar", width: 102, height: 20, thickness: 10, rounded: false, ...over });

  it("fills along the bar, bottom up when vertical", () => {
    expect(gaugePrims(bar(), 0.5)).toEqual([{ kind: "rect", x: 1, y: 5, w: 50, h: 10, r: 0, fill: DEFAULT_GAUGE.fill.color }]);
    expect(gaugePrims(bar({ orientation: "vertical", width: 20, height: 102 }), 0.5)).toEqual([{ kind: "rect", x: 5, y: 51, w: 10, h: 50, r: 0, fill: DEFAULT_GAUGE.fill.color }]);
    expect(gaugePrims(bar({ reverse: true }), 0.5)[0]).toMatchObject({ x: 51, w: 50 });
  });

  it("spans a gradient over the whole bar", () => {
    const [r] = gaugePrims(bar({ fill: { mode: "gradient", color: "#000000", stops } }), 0.3);
    expect(r).toMatchObject({ kind: "rect", w: 30, fill: { x1: 1, x2: 101, stops } });
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

  it("sets the value inline on the root, keeping an existing style", () => {
    expect(gaugeSvg(svg(), 0.25)).toBe('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" style="--value:0.25;--percent:25;"><rect/></svg>');
    expect(withValue('<svg style="fill:red">x</svg>', { value: 1, percent: 100 })).toBe('<svg style="--value:1;--percent:100;fill:red">x</svg>');
    expect(withValue("<svg/>", { value: 0, percent: 0 })).toBe('<svg style="--value:0;--percent:0;"/>');
    // Only the root: a later style attribute is left alone.
    expect(withValue('<svg a="1"><g style="x"/></svg>', { value: 0, percent: 0 })).toBe('<svg a="1" style="--value:0;--percent:0;"><g style="x"/></svg>');
  });

  it("reverses, clamps and rounds the value it passes", () => {
    expect(templateVars(svg(), 0.123456)).toEqual({ value: 0.1235, percent: 12 });
    expect(templateVars(svg({ reverse: true }), 0.25)).toEqual({ value: 0.75, percent: 75 });
    expect(templateVars(svg(), 7)).toEqual({ value: 1, percent: 100 });
    expect(templateVars(svg(), NaN)).toEqual({ value: 0, percent: 0 });
    expect(gaugePrims(svg(), 0.5)).toEqual([]);
  });

  it("keeps a template only on shape svg, when it is an <svg> within the size limit", () => {
    expect(normalizeGauge(svg())).toEqual(svg());
    expect(normalizeGauge({ ...svg(), template: "<html/>" })).toMatchObject({ shape: "arc" });
    expect("template" in normalizeGauge({ ...svg(), template: "<html/>" })).toBe(false);
    expect("template" in normalizeGauge({ ...svg(), shape: "bar" })).toBe(false);
    expect(normalizeGauge({ ...svg(), template: `<svg>${" ".repeat(MAX_TEMPLATE)}</svg>` }).shape).toBe("arc");
    expect(SAMPLE_TEMPLATE).toMatch(/var\(--value\)/);
  });
});
