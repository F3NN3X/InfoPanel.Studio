/**
 * Orbit: a pill with a load ring at each end, the CPU and GPU temperature and power beside them, and
 * FPS with its 1% low in the middle. Rings and a few values, so it stays readable from across a
 * room. On a canvas that isn't long the three parts stack, each laid out the same way.
 */
import type { Slot } from "../../elements/palette.ts";
import type { DisplayItem } from "../../schema.ts";
import { ink, ring, text, type Kit, type Template } from "../kit.ts";
import { inset, split, type Box } from "../layout.ts";
import { DARK, DEGREES, reading, shadowed, surface, variantsOf } from "../looks.ts";
import { lineOf } from "../parts.ts";
import type { Role } from "../roles.ts";

const MARGIN = 10;

/** A load ring with its value, no unit, in the middle. */
function loadRing(k: Kit, sq: Box, role: Role, accent: Slot): DisplayItem[] {
  const px = Math.round(sq.width * 0.3);
  return [
    ring(k, role, sq, { start: 0, sweep: 360, thickness: Math.max(3, Math.round(sq.width * 0.08)), fill: [ink(k, accent)], rounded: true, dot: false }),
    shadowed(k, reading(k, role, { x: sq.x, y: Math.round(sq.y + (sq.height - lineOf(px)) / 2), px, width: sq.width, align: "center", weight: "strong", unit: false })),
  ];
}

interface Side {
  label: string;
  accent: Slot;
  load: Role;
  temp: Role;
  power: Role;
  /** The ring at the right end, the text at its left. */
  mirror: boolean;
}

/** One end of the pill: the ring, and the label with the temperature big and the power small. */
function side(k: Kit, b: Box, o: Side): DisplayItem[] {
  const stacked = b.width < b.height * 1.15;
  const s = Math.round(stacked ? Math.min(b.height * 0.5, b.width * 0.5) : Math.min(b.height * 0.74, b.width * 0.42));
  const pad = Math.round(stacked ? (b.width - s) / 2 : Math.max((b.height - s) / 2, b.height * 0.2));
  const ringBox = stacked ? { x: b.x + pad, y: b.y + Math.round(b.height * 0.06), width: s, height: s } : { x: o.mirror ? b.x + b.width - pad - s : b.x + pad, y: b.y + pad, width: s, height: s };
  const area: Box = stacked
    ? { x: b.x, y: ringBox.y + s, width: b.width, height: b.y + b.height - ringBox.y - s }
    : { x: o.mirror ? b.x + pad : ringBox.x + s + pad * 0.5, y: b.y, width: b.width - s - pad * 2.5, height: b.height };
  const big = Math.max(10, Math.floor(Math.min(area.height * (stacked ? 0.4 : 0.34), area.width / (stacked ? 3.2 : 3.4))));
  const label = Math.max(8, Math.round(big * 0.55));
  const small = Math.max(8, Math.round(big * 0.45));
  const total = lineOf(label) + lineOf(big) * 0.95 + lineOf(small);
  const y = Math.round(area.y + (area.height - total) / 2);
  const [x, width, align] = stacked ? [area.x, area.width, "center" as const] : [area.x, area.width, "left" as const];
  return [
    ...loadRing(k, ringBox, o.load, o.accent),
    shadowed(k, text(k, o.label, { x, y, px: label, width, align, slot: o.accent, weight: "strong" })),
    shadowed(k, reading(k, o.temp, { x, y: y + lineOf(label), px: big, width, align, weight: "strong" }, DEGREES)),
    shadowed(k, reading(k, o.power, { x, y: Math.round(y + lineOf(label) + lineOf(big) * 0.95), px: small, width, align, slot: "text", weight: "strong" })),
  ];
}

/** A caption over a big value, centred in the box. */
function stat(k: Kit, b: Box, label: string, slot: Slot, role: Role, px: number): DisplayItem[] {
  const cap = Math.max(8, Math.round(px * 0.42));
  const y = Math.round(b.y + (b.height - lineOf(cap) - lineOf(px) * 0.95) / 2);
  return [
    shadowed(k, text(k, label.toUpperCase(), { x: b.x, y, px: cap, width: b.width, align: "center", slot, weight: "strong" })),
    shadowed(k, reading(k, role, { x: b.x, y: y + lineOf(cap), px, width: b.width, align: "center", weight: "strong", unit: false })),
  ];
}

/** FPS in the middle, with the 1% low beside it when there is room. */
function frames(k: Kit, b: Box): DisplayItem[] {
  const two = b.width >= b.height * 1.5;
  const parts = two ? split(inset(b, Math.round(b.height * 0.04)), [1, 1], 0, true) : [b];
  const px = Math.max(10, Math.floor(Math.min(b.height * (two ? 0.46 : 0.4), parts[0].width / 2.2)));
  return [...stat(k, parts[0], "FPS", "accent3", "fps", px), ...(two ? stat(k, parts[1], "1% low", "subtext", "fps.low1", px) : [])];
}

export const ORBIT: Template = {
  id: "orbit",
  name: "Orbit",
  blurb: "A pill with a load ring at each end and FPS in the middle",
  size: { width: 1080, height: 240 },
  background: "#FF2A3A66",
  color: "#FFFFFFFF",
  type: { family: "Segoe UI", light: "Semibold", regular: "Semibold", strong: "Bold" },
  palette: DARK,
  variants: variantsOf("dark", "white", "smoke", "float"),
  grids: {
    standard: { cols: 1, rows: 3, cells: [[0, 0, 1, 1], [0, 1, 1, 1], [0, 2, 1, 1]] },
    wide: { cols: 3, rows: 1, cells: [[0, 0, 1, 1], [1, 0, 1, 1], [2, 0, 1, 1]] },
  },
  margin: MARGIN,
  gap: 0,
  backdrop: (k) => {
    const m = Math.round(MARGIN * k.frame.u);
    const pill = { x: m, y: m, width: k.frame.width - 2 * m, height: k.frame.height - 2 * m };
    return surface(k, "Pill", pill, k.frame.shape === "wide" ? pill.height / 2 : Math.min(pill.width, pill.height) * 0.12);
  },
  tiles: [
    (k, b) => side(k, b, { label: "CPU", accent: "accent1", load: "cpu.load", temp: "cpu.temp", power: "cpu.power", mirror: false }),
    frames,
    (k, b) => side(k, b, { label: "GPU", accent: "accent2", load: "gpu.load", temp: "gpu.temp", power: "gpu.power", mirror: k.frame.shape === "wide" }),
  ],
};
