/** "Convert to vector" on an image sequence (spec §6): the starting spec for a gauge with these frames. */
import { STARTERS } from "@/lib/infopanel/gauges/presets";
import { normalizeGauge, type VectorGauge } from "@/lib/infopanel/gauges/vector";

type Size = { width: number; height: number };

/** How far apart two shapes are: the log of the ratio of their aspect ratios. */
const shapeGap = (a: Size, b: Size) => Math.abs(Math.log(a.width / a.height) - Math.log(b.width / b.height));

/** A spec with its stroke, text and decoration sizes scaled by `k` (whole pixels, at least 1). */
export function scaleSpec(g: VectorGauge, k: number): VectorGauge {
  const px = (v: number) => Math.max(1, Math.round(v * k));
  return {
    ...g,
    thickness: px(g.thickness),
    ...(g.shape === "bar" ? { gap: Math.round(g.gap * k) } : {}),
    ...(g.radius !== undefined ? { radius: Math.round(g.radius * k) } : {}),
    needle: g.needle && { ...g.needle, width: px(g.needle.width) },
    ticks: g.ticks && {
      ...g.ticks,
      length: px(g.ticks.length),
      width: px(g.ticks.width),
      ...(g.ticks.minor ? { minor: { ...g.ticks.minor, length: px(g.ticks.minor.length), width: px(g.ticks.minor.width) } } : {}),
      ...(g.ticks.labels ? { labels: { ...g.ticks.labels, size: px(g.ticks.labels.size) } } : {}),
    },
    ...(g.text ? { text: { ...g.text, size: px(g.text.size) } } : {}),
    ...(g.title ? { title: { ...g.title, size: px(g.title.size) } } : {}),
    ...(g.icon ? { icon: { ...g.icon, size: px(g.icon.size) } } : {}),
    ...(g.glow !== undefined ? { glow: Math.round(g.glow * k) } : {}),
  };
}

/**
 * The preset closest in shape to a frame of `size` (the template preset has no shape of its own, so it
 * is left out), drawn at that size so a bake gives frames the same size as these, its strokes and
 * text scaled with it (a 60 px frame doesn't get a 200 px dial's 16 px ring).
 */
export function convertSpec(size: Size): VectorGauge {
  const frame = { width: Math.max(1, Math.round(size.width)), height: Math.max(1, Math.round(size.height)) };
  const specs = STARTERS.filter((s) => s.gauge.shape !== "svg");
  const best = specs.reduce((a, s) => (shapeGap(frame, s.gauge) < shapeGap(frame, a.gauge) ? s : a));
  const k = Math.min(frame.width / best.gauge.width, frame.height / best.gauge.height);
  return normalizeGauge(scaleSpec({ ...best.gauge, ...frame }, k));
}
