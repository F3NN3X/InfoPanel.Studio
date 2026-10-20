import { describe, expect, it } from "vitest";
import { WIDGET_ICONS } from "@/lib/widget-icons";
import { STARTERS } from "@/lib/infopanel/gauges/presets.ts";
import { DEFAULT_GRID, DEFAULT_LIQUID, DEFAULT_PATTERN, DEFAULT_RINGS } from "@/lib/infopanel/gauges/shapes.ts";
import { containerPath } from "@/lib/infopanel/gauges/geom.ts";
import { arcGeometry, DEFAULT_GAUGE, GAUGE_ICONS, gaugePrims, normalizeGauge, type Liquid, type Prim, type VectorGauge } from "@/lib/infopanel/gauges/vector.ts";
import { gaugeSvg } from "@/lib/infopanel/gauges/vector-svg.ts";

const base = (over: Partial<VectorGauge> = {}): VectorGauge => ({ ...DEFAULT_GAUGE, track: null, ...over });
const of = <K extends Prim["kind"]>(prims: Prim[], kind: K) => prims.filter((p): p is Extract<Prim, { kind: K }> => p.kind === kind);
const firstPath = (prim: Prim) => (prim.kind === "group" && prim.children[0].kind === "path" ? prim.children[0].d : "");

describe("liquid", () => {
  const liquid = (over: Partial<VectorGauge> = {}) => base({ shape: "liquid", width: 100, height: 100, liquid: { ...DEFAULT_LIQUID, amplitude: 0, inset: 0 }, ...over });

  it("fills the container to the value, clipped to it, over the track", () => {
    const [track, group] = gaugePrims(liquid({ track: "#111111" }), 0.5);
    expect(track).toMatchObject({ kind: "path", fill: "#111111" });
    // Container 1..99: half full is a flat surface at 50.
    expect(firstPath(group)).toMatch(/^M-?[\d.]+ 50H/);
    expect(gaugePrims(liquid({ track: "#111111" }), 0)).toHaveLength(1);
  });

});

describe("grid", () => {
  // Cells of 19 px, centred: x from 2.5, the bottom row at y 20.
  const grid = (over: Partial<VectorGauge> = {}) => base({ shape: "grid", width: 100, height: 40, gap: 0, track: "#222222", grid: { ...DEFAULT_GRID, rows: 2, cols: 5, cell: "square" }, ...over });
  const lit = (prims: Prim[]) => of(prims, "rect").filter((r) => r.fill !== "#222222").map((r) => [r.x, r.y]);

  it("lights cells from the bottom left along the rows, or up the columns", () => {
    expect(lit(gaugePrims(grid(), 0.3))).toEqual([[2.5, 20], [21.5, 20], [40.5, 20]]);
    expect(lit(gaugePrims(grid({ grid: { ...DEFAULT_GRID, rows: 2, cols: 5, order: "columns", cell: "square" } }), 0.3))).toEqual([[2.5, 20], [2.5, 1], [21.5, 20]]);
    expect(lit(gaugePrims(grid({ reverse: true }), 0.3))).toEqual([[40.5, 1], [59.5, 1], [78.5, 1]]);
    expect(of(gaugePrims(grid(), 0.3), "rect")).toHaveLength(10);
  });

});

describe("liquid extras", () => {
  const tank = (over: Partial<Liquid> = {}) => base({ shape: "liquid", width: 100, height: 100, liquid: { ...DEFAULT_LIQUID, ...over } });

  it("draws diamond and point-up hexagon containers, and the background in their shape", () => {
    expect(containerPath("diamond", { x: 0, y: 0, w: 100, h: 100 }, 0)).toBe("M50 0L100 50L50 100L0 50Z");
    expect(containerPath("hexagon", { x: 0, y: 0, w: 100, h: 100 }, 0).match(/L/g)).toHaveLength(5);
    expect(containerPath("hexagon", { x: 0, y: 0, w: 100, h: 100 }, 10)).toMatch(/^M50 10L/);
    const [bg] = gaugePrims({ ...tank({ container: "hexagon" }), background: { color: "#0B1120", border: null, radius: 0 } }, 0);
    expect(bg).toMatchObject({ kind: "path", fill: "#0B1120", d: containerPath("hexagon", { x: 0, y: 0, w: 100, h: 100 }, 0) });
  });

});

describe("rings, patterns and icons", () => {
  it("draws fading rings outside the arc and its ticks, shrinking the arc to fit", () => {
    const g = base({ rings: DEFAULT_RINGS, ticks: { count: 3, length: 5, width: 1, color: "#AAAAAA" } });
    const rings = gaugePrims(g, 0).filter((p) => p.kind === "path" && p.stroke === DEFAULT_RINGS.color);
    expect(rings.map((r) => r.opacity?.toFixed(2))).toEqual(["0.50", "0.33", "0.17"]);
    expect(arcGeometry(g).r).toBe(arcGeometry(base({ ticks: g.ticks })).r - (3 * 6 + 1));
  });

  it("lays a pattern over a bar's fill, moving along it live only", () => {
    const g = base({ shape: "bar", width: 102, height: 20, thickness: 10, rounded: false, pattern: { ...DEFAULT_PATTERN, speed: 2 } });
    const [fill, pattern] = gaugePrims(g, 0.5);
    expect(pattern).toMatchObject({ kind: "rect", x: fill.kind === "rect" ? fill.x : -1, w: 50, opacity: DEFAULT_PATTERN.opacity, fill: { pattern: "stripes", along: "right" } });
    expect(gaugeSvg(g, 0.5, { mode: "live" })).toMatch(/<pattern id="p\d+" patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate\(45\)">.*attributeName="patternTransform"/);
    expect(gaugeSvg(g, 0.5)).not.toContain("animateTransform");
    expect(gaugePrims({ ...g, orientation: "vertical", width: 20, height: 102 }, 0.5)[1]).toMatchObject({ fill: { along: "up" } });
  });

  it("names the same icons the app's widgets offer, each with markup", () => {
    expect([...GAUGE_ICONS].sort()).toEqual(Object.keys(WIDGET_ICONS).sort());
  });
});

describe("normalizing the shape parts", () => {
  it("keeps valid parts, clamps numbers and refuses unknown names", () => {
    const g = normalizeGauge({
      shape: "grid",
      grid: { rows: 99, cols: 0, order: "diagonal", cell: "circle" },
      liquid: { container: "star", amplitude: -3, waves: 100, speed: 1 },
      rings: { count: 3, color: "url(x)" },
      pattern: { style: "plaid", size: 2 },
      icons: { name: "<script>", count: 50, progressive: "yes" },
      icon: { name: "cpu", size: 40, color: "accent", y: 9 },
    });
    expect(g.shape).toBe("grid");
    expect(g.grid).toEqual({ rows: 32, cols: 1, order: "rows", cell: "circle" });
    expect(g.liquid).toMatchObject({ container: "circle", amplitude: 0, waves: 8, speed: 1 });
    expect(g.rings!.color).toBe(DEFAULT_RINGS.color);
    expect(g.pattern).toMatchObject({ style: "stripes", size: 4 });
    expect(g.icons).toEqual({ name: "heart", count: 20, progressive: true });
    expect(g.icon).toEqual({ name: "cpu", size: 40, color: "accent", y: 1 });
    expect("liquid" in normalizeGauge(DEFAULT_GAUGE)).toBe(false);
    const extras = normalizeGauge({
      shape: "liquid",
      liquid: { container: "diamond", bubbles: { count: 99, size: 6, speed: -1 }, shine: 3 },
      grid: { lights: "spiral", border: { color: "red", width: 99 } },
    });
    expect(extras.liquid).toMatchObject({ container: "diamond", bubbles: { count: 40, size: 6, speed: 0 }, shine: 1 });
    expect(extras.grid).toMatchObject({ border: { color: "muted", width: 16 } });
    expect("lights" in extras.grid!).toBe(false);
    expect("bubbles" in normalizeGauge({ liquid: {} }).liquid!).toBe(false);
  });

  it("keeps every preset as it is", () => {
    for (const s of STARTERS) expect(normalizeGauge(s.gauge), s.name).toEqual(s.gauge);
  });
});
