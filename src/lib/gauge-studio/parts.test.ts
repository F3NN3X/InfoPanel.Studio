import { describe, expect, it } from "vitest";
import { STARTERS } from "@/lib/infopanel/gauges/presets";
import { DEFAULT_GAUGE, gaugePrims, normalizeGauge, type VectorGauge } from "@/lib/infopanel/gauges/vector";
import { addPart, groupedParts, hasPart, partsFor, removePart, selectable, togglePart, withShape, ALWAYS_ON, PARTS, type PartId } from "./parts";

const bare = (over: Partial<VectorGauge> = {}): VectorGauge => ({ ...DEFAULT_GAUGE, ...over });
const ids = (shape: VectorGauge["shape"]) => partsFor(shape).map((p) => p.id);

describe("which parts a shape has", () => {
  it("hides parts that do not apply: needle is arc only, wave/shine/bubbles liquid only, icon row bar only", () => {
    expect(ids("arc")).toContain("needle");
    expect(ids("arc")).not.toContain("marker");
    expect(ids("bar")).toContain("marker");
    expect(ids("bar")).toContain("icons");
    expect(ids("bar")).not.toContain("icon");
    expect(ids("arc")).not.toContain("wave");
    expect(["wave", "shine", "bubbles"].every((p) => ids("liquid").includes(p as PartId))).toBe(true);
    expect(ids("grid")).not.toContain("needle");
  });

  it("gives an SVG template only its shape and scale, and groups the rest in the spec order", () => {
    expect(ids("svg")).toEqual(["shape", "scale"]);
    expect(groupedParts("liquid").map((g) => g.group)).toEqual(["Core", "Text", "Decor", "Effects", "Liquid"]);
    expect(groupedParts("arc")[0].parts.map((p) => p.id)).toEqual(["shape", "fill", "track"]);
  });

  it("falls back to Shape when the selected part is gone", () => {
    expect(selectable(bare({ shape: "bar" }), "needle")).toBe("shape");
    expect(selectable(bare(), "needle")).toBe("needle");
  });
});

describe("adding and removing parts", () => {
  const optional = PARTS.map((p) => p.id).filter((id) => !ALWAYS_ON.includes(id));
  const shapeOf = (id: PartId): VectorGauge["shape"] =>
    id === "marker" || id === "pattern" || id === "icons" ? "bar" : id === "wave" || id === "shine" || id === "bubbles" ? "liquid" : "arc";

  it("adds each part with defaults the renderer accepts, and removing it takes it off again", () => {
    for (const id of optional) {
      const shape = shapeOf(id);
      const base = bare({ shape, track: null, needle: null, ...(shape === "liquid" ? { liquid: { container: "circle", radius: 16, inset: 4, amplitude: 0, waves: 2, speed: 3 } } : {}) });
      const on = addPart(base, id);
      expect(hasPart(on, id), id).toBe(true);
      expect(normalizeGauge(on), id).toEqual(on);
      expect(() => gaugePrims(on, 0.5), id).not.toThrow();
      expect(hasPart(removePart(on, id), id), id).toBe(false);
    }
  });

  it("is a no-op for a part already there or one that is always on", () => {
    const g = bare({ glow: 4 });
    expect(addPart(g, "glow")).toBe(g);
    expect(removePart(g, "shape")).toBe(g);
    expect(removePart(g, "fill")).toBe(g);
    expect(removePart(bare(), "text")).toEqual(bare());
  });

  it("toggles, never mutating the spec it was given", () => {
    const g = bare();
    const frozen = structuredClone(g);
    expect(hasPart(togglePart(g, "title"), "title")).toBe(true);
    expect(togglePart(togglePart(g, "title"), "title")).toEqual(g);
    expect(g).toEqual(frozen);
  });

  it("adds labels along with the ticks they sit on, and removes them leaving the ticks", () => {
    const withLabels = addPart(bare(), "labels");
    expect(withLabels.ticks?.count).toBe(11);
    expect(hasPart(withLabels, "labels")).toBe(true);
    const noLabels = removePart(withLabels, "labels");
    expect(hasPart(noLabels, "ticks")).toBe(true);
    expect(hasPart(noLabels, "labels")).toBe(false);
    expect(hasPart(removePart(withLabels, "ticks"), "labels")).toBe(false);
  });

  it("treats the marker as the bar needle field, and track off as null", () => {
    const bar = addPart(bare({ shape: "bar" }), "marker");
    expect(bar.needle).not.toBeNull();
    expect(removePart(bar, "marker").needle).toBeNull();
    expect(removePart(bare(), "track").track).toBeNull();
    expect(addPart(removePart(bare(), "track"), "track").track).toBe(DEFAULT_GAUGE.track);
  });

  it("turns the wave off as a flat surface and keeps the other liquid fields", () => {
    const tank = STARTERS.find((s) => s.gauge.shape === "liquid")!.gauge;
    const flat = removePart(tank, "wave");
    expect(flat.liquid!.amplitude).toBe(0);
    expect(flat.liquid!.container).toBe(tank.liquid!.container);
    expect(hasPart(flat, "wave")).toBe(false);
    expect(hasPart(addPart(flat, "wave"), "wave")).toBe(true);
  });
});

describe("changing the shape", () => {
  it("starts liquid and grid with their defaults, keeping their own settings when they come back", () => {
    const liquid = withShape(bare(), "liquid");
    expect(liquid.liquid).toBeDefined();
    const grid = withShape(liquid, "grid");
    expect(grid.grid).toBeDefined();
    expect(withShape(grid, "liquid").liquid).toBe(liquid.liquid);
  });

  it("starts an SVG template from the sample and drops it on leaving", () => {
    const svg = withShape(bare(), "svg");
    expect(svg.template).toMatch(/^<svg/);
    expect([svg.width, svg.height]).toEqual([200, 200]);
    expect("template" in withShape(svg, "arc")).toBe(false);
    expect(normalizeGauge(svg).shape).toBe("svg");
  });
});
