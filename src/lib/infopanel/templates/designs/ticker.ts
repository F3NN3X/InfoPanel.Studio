/**
 * Ticker: one long pill, its readings split by thin dividers: CPU load and temperature, GPU load
 * and temperature, FPS with the 1% low, and the time. Text only, so it is all native. In a box
 * that isn't long, the four readings stack in rows instead.
 */
import type { Slot } from "../../elements/palette.ts";
import type { DisplayItem } from "../../schema.ts";
import { clock, divider, ink, text, type Kit, type Template } from "../kit.ts";
import { split, type Box } from "../layout.ts";
import { DARK, DEGREES, isFloat, reading, shadowed, surface, variantsOf } from "../looks.ts";
import { lineOf } from "../parts.ts";
import type { Role } from "../roles.ts";

/** A run of text in a section: its width in ems of the type size, and how it is drawn at a place. */
interface Piece {
  em: number;
  make: (x: number, width: number, cy: number, px: number) => DisplayItem;
}

const word = (k: Kit, label: string, slot: Slot, em: number): Piece => ({
  em,
  make: (x, width, cy, px) => shadowed(k, text(k, label, { x, y: cy - lineOf(px) / 2, px, width, slot, weight: "strong" })),
});

/** A value in a slot of `em`; one beside a dot sits against it. */
const figure = (k: Kit, role: Role, em: number, o: { degrees?: boolean; align?: "left" | "right" } = {}): Piece => ({
  em,
  make: (x, width, cy, px) =>
    shadowed(k, reading(k, role, { x, y: cy - lineOf(px) / 2, px, width, align: o.align, weight: "strong", unit: role !== "fps" && role !== "fps.low1" }, o.degrees ? DEGREES : undefined)),
});

const dot = (k: Kit): Piece => ({
  em: 0.9,
  make: (x, width, cy, px) => shadowed(k, text(k, "·", { x, y: cy - lineOf(px) / 2, px, width, align: "center", slot: "subtext", weight: "strong" })),
});

const timeOfDay = (k: Kit, em: number): Piece => ({
  em,
  make: (x, width, cy, px) => shadowed(k, clock(k, "h:mm tt", { x, y: cy - lineOf(px) / 2, px, width, weight: "strong" })),
});

const sections = (k: Kit): Piece[][] => [
  [word(k, "CPU", "accent1", 2.45), figure(k, "cpu.load", 2.2, { align: "right" }), dot(k), figure(k, "cpu.temp", 2.0, { degrees: true })],
  [word(k, "GPU", "accent2", 2.45), figure(k, "gpu.load", 2.2, { align: "right" }), dot(k), figure(k, "gpu.temp", 2.0, { degrees: true })],
  [word(k, "FPS", "accent3", 2.45), figure(k, "fps", 1.9, { align: "right" }), dot(k), word(k, "1%", "subtext", 1.7), figure(k, "fps.low1", 1.9)],
  [timeOfDay(k, 5.4)],
];

const emsOf = (pieces: readonly Piece[]) => pieces.reduce((a, p) => a + p.em, 0);

/** The pieces left to right from `x`, centred on `cy`; returns the items. */
function run(pieces: readonly Piece[], x: number, cy: number, px: number): DisplayItem[] {
  let at = x;
  return pieces.map((p) => {
    const item = p.make(Math.round(at), Math.round(p.em * px), Math.round(cy), px);
    at += p.em * px;
    return item;
  });
}

/** Space either side of a divider, in ems. */
const SPACE = 1.1;

function ticker(k: Kit, b: Box): DisplayItem[] {
  const all = sections(k);
  const long = b.width / b.height >= 3.2;
  if (long) {
    const total = all.reduce((a, s) => a + emsOf(s), 0) + (all.length - 1) * 2 * SPACE;
    const px = Math.max(10, Math.floor(Math.min(b.height * 0.34, b.width / (total + 2.4))));
    const pillH = Math.min(b.height, Math.round(px * 2.6));
    const pill = { x: b.x, y: Math.round(b.y + (b.height - pillH) / 2), width: b.width, height: pillH };
    const cy = pill.y + pillH / 2;
    let at = b.x + (b.width - total * px) / 2;
    const items: DisplayItem[] = [];
    all.forEach((s, i) => {
      if (i > 0) {
        at += SPACE * px;
        if (!isFloat(k)) items.push(divider(k, { x: Math.round(at), y: Math.round(cy - px * 0.7), width: 2, height: Math.round(px * 1.4) }, { orientation: "vertical", thickness: px > 26 ? 2 : 1, fill: [ink(k, "track")] }));
        at += SPACE * px;
      }
      items.push(...run(s, at, cy, px));
      at += emsOf(s) * px;
    });
    return [...surface(k, "Pill", pill, pillH / 2), ...items];
  }
  const rows = split(b, all.map(() => 1), 0, false);
  const px = Math.max(10, Math.floor(Math.min(Math.min(...rows.map((r) => r.height)) * 0.42, b.width / (Math.max(...all.map(emsOf)) + 2.4))));
  return [
    ...surface(k, "Pill", b, Math.min(b.width, b.height) * 0.12),
    ...rows.flatMap((r, i) => [
      ...(i > 0 && !isFloat(k) ? [divider(k, { x: Math.round(b.x + b.width * 0.1), y: r.y, width: Math.round(b.width * 0.8), height: 1 }, { fill: [ink(k, "track")] })] : []),
      ...run(all[i], r.x + (r.width - emsOf(all[i]) * px) / 2, r.y + r.height / 2, px),
    ]),
  ];
}

export const TICKER: Template = {
  id: "ticker",
  name: "Ticker",
  blurb: "One long pill: CPU, GPU, FPS and the time",
  size: { width: 1280, height: 160 },
  background: "#FF2A3A66",
  color: "#FFFFFFFF",
  type: { family: "Segoe UI", light: "Semibold", regular: "Semibold", strong: "Bold" },
  palette: DARK,
  variants: variantsOf("dark", "white", "smoke", "float"),
  grids: {
    standard: { cols: 1, rows: 1, cells: [[0, 0, 1, 1]] },
    wide: { cols: 1, rows: 1, cells: [[0, 0, 1, 1]] },
  },
  margin: 8,
  gap: 0,
  tiles: [ticker],
};
