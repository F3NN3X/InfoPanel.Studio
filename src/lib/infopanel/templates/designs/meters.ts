/**
 * Meters: a wide pill in zones split by dividers. CPU and GPU each have a double ring (load outside,
 * a heat-coloured temperature ring inside), the temperature big beside it, and Power, Clock and
 * memory rows with a thin bar under each. FPS has its number, the 1% low and frame time, and a line
 * graph. In a canvas that isn't long the zones stack.
 */
import { applyElement } from "../../elements/apply.ts";
import type { Slot } from "../../elements/palette.ts";
import { defaultItem, type DisplayItem } from "../../schema.ts";
import { divider, fontSize, ink, ring, text, type Kit, type Template } from "../kit.ts";
import { inset, type Box } from "../layout.ts";
import { DARK, DEGREES, GHZ, graph, isFloat, lines, reading, shadowed, surface, variantsOf, type LineEntry } from "../looks.ts";
import { lineOf } from "../parts.ts";
import type { Role } from "../roles.ts";

const MARGIN = 10;

/** The outer ring on `load`, the inner on `temp` in heat colours, and the load in the middle. */
function doubleRing(k: Kit, sq: Box, name: string, load: Role, temp: Role, accent: Slot): DisplayItem {
  const thickness = Math.max(3, Math.round(sq.width * 0.075));
  const px = Math.round(sq.width * 0.24);
  const kids = [ring(k, load, sq), ring(k, temp, sq), reading(k, load, { x: 0, y: 0, px, unit: false, weight: "strong" })];
  const element = {
    type: "doublering", size: sq.width, thickness, gap: Math.max(2, Math.round(thickness * 0.6)), start: 0, sweep: 360, track: ink(k, "track"),
    outer: [ink(k, accent)], inner: [ink(k, "warn")],
    innerThresholds: [{ at: 0, ink: { color: "#FFFFD60A" } }, { at: 60, ink: ink(k, "warn") }, { at: 80, ink: ink(k, "crit") }],
    valueSize: fontSize(k, px), value: ink(k, "text"),
  };
  return applyElement({ ...defaultItem("Group"), Name: name, X: sq.x, Y: sq.y, DisplayItems: kids, element } as unknown as DisplayItem);
}

interface Zone {
  label: string;
  accent: Slot;
  load: Role;
  temp: Role;
  /** A small line under the temperature. */
  under?: [string, Role];
  rows: readonly LineEntry[];
  /** The zone has a divider at its start. */
  divided: boolean;
}

/** The divider between zones: upright in a long pill, across when they stack. */
function zoneDivider(k: Kit, b: Box): DisplayItem[] {
  if (isFloat(k)) return [];
  const thickness = k.frame.u > 1.6 ? 2 : 1;
  if (k.frame.shape === "wide") return [divider(k, { x: b.x, y: Math.round(b.y + b.height * 0.14), width: thickness, height: Math.round(b.height * 0.72) }, { orientation: "vertical", thickness, fill: [ink(k, "track")] })];
  return [divider(k, { x: Math.round(b.x + b.width * 0.06), y: b.y, width: Math.round(b.width * 0.88), height: thickness }, { thickness, fill: [ink(k, "track")] })];
}

function zone(k: Kit, b: Box, z: Zone): DisplayItem[] {
  const p = Math.round(Math.min(b.width, b.height) * 0.07);
  const inner = inset(b, p);
  const stacked = b.width < b.height * 1.3;
  const s = Math.round(stacked ? Math.min(inner.height * 0.4, inner.width * 0.46) : Math.min(inner.height * 0.82, inner.width * 0.31));
  const ringBox = { x: inner.x, y: stacked ? inner.y : Math.round(inner.y + (inner.height - s) / 2), width: s, height: s };
  const textX = ringBox.x + s + Math.round(p * 0.7);
  const rowsBox: Box = stacked
    ? { x: inner.x, y: ringBox.y + s + p, width: inner.width, height: inner.y + inner.height - ringBox.y - s - p }
    : { x: Math.max(textX + Math.round(s * 0.62), inner.x + inner.width - Math.min(Math.round(inner.width * 0.42), Math.round(inner.height * 2.2))), y: inner.y + Math.round(inner.height * 0.1), width: 0, height: Math.round(inner.height * 0.8) };
  if (!stacked) rowsBox.width = inner.x + inner.width - rowsBox.x;
  const textW = stacked ? inner.width - s - Math.round(p * 0.7) : rowsBox.x - textX - p;
  const big = Math.max(10, Math.floor(Math.min(s * 0.4, textW / 2.6)));
  const label = Math.max(8, Math.round(big * 0.46));
  const under = Math.max(8, Math.round(big * 0.34));
  const block = lineOf(label) + lineOf(big) * 0.95 + (z.under ? lineOf(under) : 0);
  const ty = Math.round(ringBox.y + (s - block) / 2);
  return [
    ...(z.divided ? zoneDivider(k, b) : []),
    doubleRing(k, ringBox, `${z.label} rings`, z.load, z.temp, z.accent),
    shadowed(k, text(k, z.label, { x: textX, y: ty, px: label, width: textW, slot: z.accent, weight: "strong" })),
    shadowed(k, reading(k, z.temp, { x: textX, y: ty + lineOf(label), px: big, width: textW, weight: "strong" }, DEGREES)),
    ...(z.under ? [shadowed(k, text(k, z.under[0], { x: textX, y: Math.round(ty + lineOf(label) + lineOf(big) * 0.95), px: under, width: textW, slot: "subtext" })), shadowed(k, reading(k, z.under[1], { x: textX + Math.round(under * 3.2), y: Math.round(ty + lineOf(label) + lineOf(big) * 0.95), px: under, width: textW, weight: "strong" }, DEGREES))] : []),
    ...lines(k, rowsBox, z.rows, { px: Math.max(8, Math.round(rowsBox.height / 4.2)), bar: true, barFill: z.accent, gap: Math.round(rowsBox.height * 0.04) }),
  ];
}

/** FPS big on the left, the 1% low and frame time right, a line graph along the bottom. */
function frames(k: Kit, b: Box): DisplayItem[] {
  const p = Math.round(Math.min(b.width, b.height) * 0.07);
  const inner = inset(b, p);
  const graphH = Math.round(inner.height * 0.24);
  const top = inner.height - graphH - p;
  const stacked = b.width < b.height * 1.3;
  const left: Box = { x: inner.x, y: inner.y, width: stacked ? Math.round(inner.width * 0.5) : Math.round(inner.width * 0.36), height: top };
  const big = Math.max(12, Math.floor(Math.min(top * 0.62, left.width / 1.9)));
  const label = Math.max(8, Math.round(big * 0.36));
  const block = lineOf(label) + lineOf(big) * 0.95;
  const y = Math.round(inner.y + (top - block) / 2);
  const rows: Box = { x: left.x + left.width + p, y: inner.y + Math.round(top * 0.1), width: inner.x + inner.width - left.x - left.width - p, height: Math.round(top * 0.8) };
  return [
    ...zoneDivider(k, b),
    shadowed(k, text(k, "FPS", { x: left.x, y, px: label, slot: "accent3", weight: "strong" })),
    shadowed(k, reading(k, "fps", { x: left.x, y: y + lineOf(label), px: big, weight: "strong", unit: false })),
    ...lines(k, rows, [{ label: "1%", role: "fps.low1", shown: { unit: "" } }, { label: "FT", role: "frametime" }], { px: Math.max(8, Math.round(rows.height / 3)), gap: Math.round(rows.height * 0.1) }),
    graph(k, "fps", { x: inner.x, y: inner.y + inner.height - graphH, width: inner.width, height: graphH }, { style: "line", color: ink(k, "accent3") }),
  ];
}

export const METERS: Template = {
  id: "meters",
  name: "Meters",
  blurb: "A wide pill: double rings, rows with thin bars, FPS and a graph",
  fits: ["strip", "wide", "standard"],
  size: { width: 1600, height: 300 },
  background: "#FF2A3A66",
  color: "#FFFFFFFF",
  type: { family: "Segoe UI", light: "Semibold", regular: "Semibold", strong: "Bold" },
  palette: DARK,
  variants: variantsOf("dark", "white", "smoke", "float"),
  grids: {
    standard: { cols: 1, rows: 3, cells: [[0, 0, 1, 1], [0, 1, 1, 1], [0, 2, 1, 1]] },
    wide: { cols: 8, rows: 1, cells: [[0, 0, 3, 1], [3, 0, 3, 1], [6, 0, 2, 1]] },
  },
  margin: MARGIN,
  gap: 0,
  backdrop: (k) => {
    const m = Math.round(MARGIN * k.frame.u);
    const pill = { x: m, y: m, width: k.frame.width - 2 * m, height: k.frame.height - 2 * m };
    return surface(k, "Pill", pill, Math.min(pill.width, pill.height) * 0.18);
  },
  tiles: [
    (k, b) =>
      zone(k, b, {
        label: "CPU", accent: "accent1", load: "cpu.load", temp: "cpu.temp", divided: false,
        rows: [{ label: "Power", role: "cpu.power" }, { label: "Clock", role: "cpu.clock", shown: GHZ }, { label: "RAM", role: "ram.used" }],
      }),
    (k, b) =>
      zone(k, b, {
        label: "GPU", accent: "accent2", load: "gpu.load", temp: "gpu.temp", under: ["VRAM", "vram.temp"], divided: true,
        rows: [{ label: "Power", role: "gpu.power" }, { label: "Clock", role: "gpu.clock", shown: GHZ }, { label: "VRAM", role: "vram.used" }],
      }),
    frames,
  ],
};
