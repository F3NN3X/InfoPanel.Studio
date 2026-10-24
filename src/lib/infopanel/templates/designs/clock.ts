/**
 * Clock: a big centred time inside a ring of sixty segments, with the date under it and two quiet
 * columns of readings either side. InfoPanel has no seconds to drive a ring, so the sixty segments
 * fill with CPU load, which the line under the date says.
 */
import type { DisplayItem } from "../../schema.ts";
import { clock, ink, ring, text, value, type Kit, type Template } from "../kit.ts";
import { inset, split, square, type Box } from "../layout.ts";
import { lineOf, padOf } from "../parts.ts";
import type { Role } from "../roles.ts";

function face(k: Kit, b: Box): DisplayItem[] {
  const sq = square(b);
  const px = Math.round(sq.width * 0.2);
  const datePx = Math.max(9, Math.round(px * 0.26));
  const top = sq.y + sq.height / 2 - lineOf(px) * 0.62;
  return [
    ring(k, "cpu.load", sq, {
      start: 0, sweep: 360, thickness: Math.max(4, Math.round(sq.width * 0.035)), segments: 60, gap: 1.8, rounded: false, dot: false,
      fill: [ink(k, "accent1"), ink(k, "accent2")], glow: 0,
    }),
    clock(k, "HH:mm", { x: sq.x, y: top, px, width: sq.width, align: "center", weight: "light" }),
    clock(k, "ddd d MMM", { x: sq.x, y: top + lineOf(px) * 0.92, px: datePx, width: sq.width, align: "center", slot: "subtext", upper: true }, true),
    text(k, "CPU", { x: sq.x, y: top + lineOf(px) * 0.92 + lineOf(datePx) * 1.2, px: datePx, width: sq.width / 2 - datePx * 0.2, align: "right", slot: "subtext", weight: "strong" }),
    value(k, "cpu.load", { x: sq.x + sq.width / 2 + datePx * 0.2, y: top + lineOf(px) * 0.92 + lineOf(datePx) * 1.2, px: datePx, slot: "accent1" }),
  ];
}

/** Readings stacked down a column: a small label, then the value. */
function column(k: Kit, b: Box, entries: readonly (readonly [string, Role])[], align: "left" | "right"): DisplayItem[] {
  const p = padOf(k, 6);
  const parts = split(inset(b, p), entries.map(() => 1), p, false);
  return entries.flatMap(([label, role], i) => {
    const c = parts[i];
    const lp = Math.max(9, Math.round(Math.min(c.height * 0.14, 11 * k.frame.u)));
    const vp = Math.max(12, Math.round(Math.min(c.height * 0.36, c.width * 0.26)));
    const y = c.y + (c.height - lineOf(lp) - lineOf(vp)) / 2;
    return [
      text(k, label, { x: c.x, y, px: lp, width: c.width, align, slot: "subtext", weight: "strong", upper: true }),
      value(k, role, { x: c.x, y: y + lineOf(lp), px: vp, width: c.width, align, weight: "light" }),
    ];
  });
}

export const CLOCK: Template = {
  id: "clock",
  name: "Clock",
  blurb: "A big centred clock in a ring of sixty segments",
  background: "#FF07090F",
  color: "#FFF4F6FB",
  type: { family: "Segoe UI", light: "Light", regular: "Regular", strong: "Semibold" },
  palette: {
    accent1: "#FF7DD3FC", accent2: "#FFC4B5FD", accent3: "#FF7DD3FC", text: "#FFF4F6FB", subtext: "#FF7D8597",
    track: "#FF1A1F2B", card: "#FF0E121B", warn: "#FFFCD34D", crit: "#FFFB7185",
  },
  variants: [
    { id: "sky", name: "Sky", palette: {} },
    { id: "rose", name: "Rose", palette: { accent1: "#FFFDA4AF", accent2: "#FFF9A8D4", accent3: "#FFFDA4AF" } },
    { id: "gold", name: "Gold", palette: { accent1: "#FFFCD34D", accent2: "#FFFB923C", accent3: "#FFFCD34D" } },
  ],
  grids: {
    standard: { cols: 4, rows: 1, cells: [[1, 0, 2, 1], [0, 0, 1, 1], [3, 0, 1, 1]] },
    wide: { cols: 6, rows: 1, cells: [[2, 0, 2, 1], [0, 0, 2, 1], [4, 0, 2, 1]] },
    tall: { cols: 1, rows: 4, cells: [[0, 1, 1, 2], [0, 0, 1, 1], [0, 3, 1, 1]] },
  },
  margin: 10,
  gap: 6,
  tiles: [
    (k, b) => face(k, b),
    (k, b) => column(k, b, [["CPU temp", "cpu.temp"], ["CPU power", "cpu.power"], ["RAM", "ram.load"]], "left"),
    (k, b) => column(k, b, [["GPU temp", "gpu.temp"], ["GPU load", "gpu.load"], ["GPU power", "gpu.power"]], "right"),
  ],
};
