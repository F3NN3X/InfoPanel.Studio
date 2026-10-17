import { describe, expect, it } from "vitest";
import { formatNumber, formatValue } from "./parts.ts";
import { STARTERS } from "./presets.ts";
import { DEFAULT_GAUGE, gaugePrims, normalizeGauge, resolvePaint, thresholdPaint, type Prim, type VectorGauge } from "./vector.ts";
import { gaugeSvg } from "./vector-svg.ts";

const arc = (over: Partial<VectorGauge> = {}): VectorGauge => ({ ...DEFAULT_GAUGE, track: null, ...over });
const texts = (prims: Prim[]) => prims.flatMap((p) => (p.kind === "text" ? [p.text] : []));
const paths = (prims: Prim[], stroke: string) => prims.filter((p) => p.kind === "path" && p.stroke === stroke) as Extract<Prim, { kind: "path" }>[];

describe("scale and value text", () => {
  it("formats like the widgets: grouping, automatic decimals below 10", () => {
    expect([formatNumber(1234.5, 0), formatNumber(3.14159, null), formatNumber(42, null), formatNumber(NaN, 1)]).toEqual(["1,235", "3.1", "42", "–"]);
  });

  it("fills the format with the scale value and unit", () => {
    const g = arc({ scale: { min: 0, max: 240, unit: " km/h", decimals: 0 }, text: { size: 20, color: "fg", font: "", weight: 700, y: 0.5, format: "{value}{unit}" } });
    expect(formatValue(g, 0.5)).toBe("120 km/h");
    expect(texts(gaugePrims(g, 0.25))).toEqual(["60 km/h"]);
    expect(formatValue({ ...g, text: { ...g.text!, format: "{value} of 240" } }, 1)).toBe("240 of 240");
  });
});

describe("colours", () => {
  it("resolves theme colours to the widget variables live and to fixed colours when baking", () => {
    expect(resolvePaint("accent", "live")).toBe("var(--accent, #34D399)");
    expect(resolvePaint("accent", "bake")).toBe("#34D399");
    expect(resolvePaint("#123456", "live")).toBe("#123456");
    expect(resolvePaint("red;background:url(x)", "bake")).toBe("#000000");
  });

  it("colours a threshold fill by the value, or each segment by its place", () => {
    const g = arc({ fill: { ...DEFAULT_GAUGE.fill, mode: "thresholds", color: "accent", warn: 70, crit: 90 } });
    expect([thresholdPaint(g, 50), thresholdPaint(g, 70), thresholdPaint(g, 95)]).toEqual(["accent", "warn", "crit"]);
    expect(gaugePrims(g, 0.8).map((p) => p.kind === "path" && p.stroke)).toEqual(["warn"]);
    const segs = gaugePrims({ ...g, segments: 10, gap: 0 }, 1).map((p) => p.kind === "path" && p.stroke);
    expect(segs).toEqual([...Array(7).fill("accent"), "warn", "warn", "crit"]);
  });
});

describe("ticks, needles and background", () => {
  const ticked = arc({ ticks: { count: 5, length: 6, width: 2, color: "#AAAAAA", minor: { count: 3, length: 3, width: 1, color: "#555555" }, labels: { size: 10, color: "muted", font: "" } } });

  it("draws minor ticks between majors and a label per major", () => {
    const prims = gaugePrims({ ...ticked, scale: { min: 0, max: 200, unit: "", decimals: null } }, 0);
    expect(paths(prims, "#AAAAAA")[0].d.match(/M/g)).toHaveLength(5);
    expect(paths(prims, "#555555")[0].d.match(/M/g)).toHaveLength(12);
    expect(texts(prims)).toEqual(["0", "50", "100", "150", "200"]);
    // Reversed, the labels run the other way round.
    expect(texts(gaugePrims({ ...ticked, reverse: true }, 0))).toEqual(["100", "75", "50", "25", "0"]);
  });

  it("aligns a bar's end labels inward", () => {
    const bar = { ...ticked, shape: "bar" as const, width: 300, height: 40 };
    const labels = gaugePrims(bar, 0).filter((p) => p.kind === "text");
    expect(labels.map((l) => l.kind === "text" && l.anchor)).toEqual(["start", "middle", "middle", "middle", "end"]);
  });

  it("draws each needle style with a cap", () => {
    for (const style of ["taper", "line", "arrow", "blade"] as const) {
      // At 0 the arc draws no fill, so only the needle is left.
      const prims = gaugePrims(arc({ needle: { color: "#FFFFFF", length: 0.9, width: 6, style } }), 0);
      expect(prims.length, style).toBeGreaterThanOrEqual(2);
      expect(prims.every((p) => p.kind === "path" && (p.fill === "#FFFFFF" || p.stroke === "#FFFFFF")), style).toBe(true);
    }
  });

  it("puts a disc behind an arc and a rounded rect behind a bar", () => {
    const background = { color: "#0B1120", border: { color: "muted", width: 2 }, radius: 6 };
    const [disc, ring] = gaugePrims(arc({ background }), 0);
    expect(disc).toMatchObject({ kind: "path", fill: "#0B1120" });
    expect(ring).toMatchObject({ kind: "path", stroke: "muted", width: 2 });
    expect(gaugePrims(arc({ shape: "bar", width: 100, height: 20, background }), 0)[0]).toMatchObject({ kind: "rect", x: 1, y: 1, w: 98, h: 18, r: 6, fill: "#0B1120", stroke: "muted" });
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

  it("stretches to a drawn size", () => {
    expect(gaugeSvg(arc(), 0, { width: 100, height: 50 })).toMatch(/^<svg [^>]*width="100" height="50" viewBox="0 0 200 200" preserveAspectRatio="none">/);
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

describe("title", () => {
  const title = { text: "CPU", size: 14, color: "muted", y: 0.2 };

  it("draws the caption at its row, before the value text, and escapes it in the markup", () => {
    const g = arc({ title: { ...title, text: "<b>CPU" }, text: { size: 20, color: "fg", font: "", weight: 700, y: 0.5, format: "{value}" } });
    const prims = gaugePrims(g, 0.5);
    expect(texts(prims)).toEqual(["<b>CPU", "50"]);
    expect(prims.find((p) => p.kind === "text")).toMatchObject({ x: 100, y: 40, size: 14, weight: 600 });
    expect(gaugeSvg(g, 0.5)).toContain("&#60;b&#62;CPU");
  });

  it("draws nothing for an empty caption, and normalizes a bad one", () => {
    expect(texts(gaugePrims(arc({ title: { ...title, text: "" } }), 0.5))).toEqual([]);
    expect(normalizeGauge({ ...DEFAULT_GAUGE, title: { text: "x".repeat(99), size: 9999, color: "url(x)", y: -1 } }).title).toEqual({ text: "x".repeat(60), size: 400, color: "muted", y: 0 });
    expect(normalizeGauge(DEFAULT_GAUGE).title).toBeUndefined();
  });
});
