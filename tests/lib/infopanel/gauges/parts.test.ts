import { describe, expect, it } from "vitest";
import { formatNumber, formatValue } from "@/lib/infopanel/gauges/parts.ts";
import { STARTERS } from "@/lib/infopanel/gauges/presets.ts";
import { DEFAULT_GAUGE, gaugePrims, normalizeGauge, type Prim, type VectorGauge } from "@/lib/infopanel/gauges/vector.ts";
import { gaugeSvg } from "@/lib/infopanel/gauges/vector-svg.ts";

const arc = (over: Partial<VectorGauge> = {}): VectorGauge => ({ ...DEFAULT_GAUGE, track: null, ...over });
const texts = (prims: Prim[]) => prims.flatMap((p) => (p.kind === "text" ? [p.text] : []));

describe("scale and value text", () => {
  it("formats like the widgets: grouping, automatic decimals below 10", () => {
    // biome-ignore lint/suspicious/noApproximativeNumericConstant: a plain decimal input, not π.
    expect([formatNumber(1234.5, 0), formatNumber(3.14159, null), formatNumber(42, null), formatNumber(NaN, 1)]).toEqual(["1,235", "3.1", "42", "–"]);
  });

  it("fills the format with the scale value and unit", () => {
    const g = arc({ scale: { min: 0, max: 240, unit: " km/h", decimals: 0 }, text: { size: 20, color: "fg", font: "", weight: 700, y: 0.5, format: "{value}{unit}" } });
    expect(formatValue(g, 0.5)).toBe("120 km/h");
    expect(texts(gaugePrims(g, 0.25))).toEqual(["60 km/h"]);
    expect(formatValue({ ...g, text: { ...g.text!, format: "{value} of 240" } }, 1)).toBe("240 of 240");
  });
});

describe("renderer", () => {
  it("glows only the fill, wraps everything in the shadow and escapes text", () => {
    const g = arc({ track: "#111111", glow: 4, shadow: { blur: 4, dx: 0, dy: 2, color: "#000000", opacity: 0.5 }, scale: { min: 0, max: 100, unit: "<b>", decimals: 0 }, text: { size: 20, color: "fg", font: "Bahnschrift", weight: 700, y: 0.5, format: "{value}{unit}" } });
    const svg = gaugeSvg(g, 0.5, { id: "x" });
    expect(svg.match(/filter="url\(#xglow\)"/g)).toHaveLength(1);
    expect(svg).toContain('<g filter="url(#xshadow)">');
    expect(svg).toContain(">50&#60;b&#62;</text>");
    expect(svg).toContain("font-family:Bahnschrift");
    expect(gaugeSvg(g, 0.5, { mode: "live" })).toContain("fill:var(--w-fg, #F4F4F5)");
    expect(gaugeSvg(g, 0.5, { id: 'a"b' })).toContain('id="a_bglow"');
  });

});

describe("normalizing the new parts", () => {
  it("leaves older specs as they were", () => {
    const old = { ...DEFAULT_GAUGE, needle: { color: "#FFFFFF", length: 0.8, width: 4 }, ticks: { count: 5, length: 4, width: 1, color: "#AAAAAA" } };
    expect(normalizeGauge(old)).toEqual(old);
  });

  it("keeps valid parts and refuses fonts and colours that could break out", () => {
    const g = normalizeGauge({
      ...DEFAULT_GAUGE,
      track: "track",
      fill: { mode: "thresholds", color: "accent", stops: [], warn: 70, crit: "x" },
      needle: { color: "warn", length: 1, width: 4, style: "spear" },
      ticks: { count: 5, length: 4, width: 1, color: "#aaaaaa", labels: { size: 1000, color: "url(x)", font: "Arial;}*{x" } },
      scale: { min: 0, max: 10, unit: "x".repeat(40), decimals: 9 },
      text: { size: 20, color: "#ffffff", font: "Segoe UI", weight: 650, y: 2, format: "{value}" },
      glow: 999,
    });
    expect(g.track).toBe("track");
    expect(g.fill).toMatchObject({ mode: "thresholds", color: "accent", warn: 70 });
    expect(g.fill.crit).toBeUndefined();
    expect(g.needle).toEqual({ color: "warn", length: 1, width: 4 });
    expect(g.ticks!.labels).toEqual({ size: 200, color: "muted", font: "" });
    expect(g.scale).toEqual({ min: 0, max: 10, unit: "x".repeat(16), decimals: 4 });
    expect(g.text).toMatchObject({ color: "#FFFFFF", font: "Segoe UI", weight: 700, y: 1 });
    expect(g.glow).toBe(64);
  });

  it("keeps every preset as it is", () => {
    for (const s of STARTERS) expect(normalizeGauge(s.gauge), s.name).toEqual(s.gauge);
  });
});

