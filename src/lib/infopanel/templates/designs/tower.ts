/**
 * Tower: a tall card in three blocks split by dividers, FPS on top with its lows, then CPU and GPU
 * as lists of readings, each block ending in a small graph. On a canvas that isn't tall the blocks
 * sit side by side.
 */
import type { Slot } from "../../elements/palette.ts";
import type { DisplayItem } from "../../schema.ts";
import { divider, ink, type Kit, type Template } from "../kit.ts";
import { inset, type Box } from "../layout.ts";
import { caption, DARK, DEGREES, GHZ, graph, lines, reading, shadowed, surface, variantsOf, type LineEntry } from "../looks.ts";
import { lineOf } from "../parts.ts";
import type { Role } from "../roles.ts";

const MARGIN = 12;

interface Block {
  label: string;
  accent: Slot;
  /** A big value under the caption (FPS). */
  big?: Role;
  rows: readonly LineEntry[];
  graph: Role;
  divided: boolean;
}

function block(k: Kit, b: Box, o: Block): DisplayItem[] {
  const p = Math.max(6, Math.round(Math.min(k.frame.width, k.frame.height) * 0.035));
  const inner = inset(b, p);
  const graphH = Math.round(inner.height * 0.13);
  const vertical = k.frame.shape !== "tall";
  // The same type size in every block: from the narrowest block's width and the room for the longest list (the GPU's eight rows).
  const gpuHeight = vertical ? inner.height : ((k.frame.height - 2 * p) * 6) / 14;
  const px = Math.round(Math.min((vertical ? Math.min(b.width, k.frame.width * 0.27) : b.width) / 8.5, (gpuHeight * 0.58) / 8 / 1.45));
  const cap = Math.max(8, Math.round(px * 1.1));
  const capH = lineOf(cap);
  const bigPx = o.big ? Math.max(12, Math.floor(Math.min(inner.height * 0.16, inner.width * 0.26))) : 0;
  const bigH = o.big ? Math.round(lineOf(bigPx) * 0.95) : 0;
  const rowsTop = inner.y + capH + bigH + Math.round(p * 0.5);
  const rows: Box = { x: inner.x, y: rowsTop, width: inner.width, height: inner.y + inner.height - graphH - p - rowsTop };
  const edge = k.frame.u > 1.6 ? 2 : 1;
  return [
    ...(o.divided
      ? [vertical
          ? divider(k, { x: b.x, y: Math.round(b.y + b.height * 0.04), width: edge, height: Math.round(b.height * 0.92) }, { orientation: "vertical", thickness: edge, fill: [ink(k, "track")] })
          : divider(k, { x: Math.round(b.x + b.width * 0.06), y: b.y, width: Math.round(b.width * 0.88), height: edge }, { thickness: edge, fill: [ink(k, "track")] })]
      : []),
    caption(k, o.label, inner.x, inner.y, cap, { slot: o.accent }),
    ...(o.big ? [shadowed(k, reading(k, o.big, { x: inner.x, y: inner.y + capH, px: bigPx, weight: "strong", unit: false }))] : []),
    ...lines(k, rows, o.rows, { px, value: "text" }),
    graph(k, o.graph, { x: inner.x, y: inner.y + inner.height - graphH, width: inner.width, height: graphH }, { style: "area", color: ink(k, o.accent), fillAlpha: 0.22 }),
  ];
}

const NO_UNIT = { unit: "" };

export const TOWER: Template = {
  id: "tower",
  name: "Tower",
  blurb: "A tall card: FPS, CPU and GPU readings with a graph each",
  fits: ["tall"],
  size: { width: 480, height: 1920 },
  background: "#FF2A3A66",
  color: "#FFFFFFFF",
  type: { family: "Segoe UI", light: "Semibold", regular: "Semibold", strong: "Bold" },
  palette: DARK,
  variants: variantsOf("dark", "white", "smoke", "float"),
  grids: {
    standard: { cols: 7, rows: 1, cells: [[0, 0, 2, 1], [2, 0, 2, 1], [4, 0, 3, 1]] },
    wide: { cols: 7, rows: 1, cells: [[0, 0, 2, 1], [2, 0, 2, 1], [4, 0, 3, 1]] },
    tall: { cols: 1, rows: 14, cells: [[0, 0, 1, 4], [0, 4, 1, 4], [0, 8, 1, 6]] },
  },
  margin: MARGIN,
  gap: 0,
  backdrop: (k) => {
    const m = Math.round(MARGIN * k.frame.u);
    return surface(k, "Card", { x: m, y: m, width: k.frame.width - 2 * m, height: k.frame.height - 2 * m }, Math.min(k.frame.width, k.frame.height) * 0.07);
  },
  tiles: [
    (k, b) =>
      block(k, b, {
        label: "FPS", accent: "accent3", big: "fps", graph: "fps", divided: false,
        rows: [{ label: "1% low", role: "fps.low1", shown: NO_UNIT }, { label: "0.1% low", role: "fps.low01", shown: NO_UNIT }, { label: "Frametime", role: "frametime" }],
      }),
    (k, b) =>
      block(k, b, {
        label: "CPU", accent: "accent1", graph: "cpu.load", divided: true,
        rows: [
          { label: "Temp", role: "cpu.temp", shown: DEGREES }, { label: "Load", role: "cpu.load" }, { label: "Power", role: "cpu.power" },
          { label: "Clock", role: "cpu.clock", shown: GHZ }, { label: "RAM", role: "ram.used" },
        ],
      }),
    (k, b) =>
      block(k, b, {
        label: "GPU", accent: "accent2", graph: "gpu.load", divided: true,
        rows: [
          { label: "Temp", role: "gpu.temp", shown: DEGREES }, { label: "Load", role: "gpu.load" }, { label: "Power", role: "gpu.power" },
          { label: "Clock", role: "gpu.clock", shown: GHZ }, { label: "Voltage", role: "gpu.volt" }, { label: "Fan", role: "gpu.fan" },
          { label: "VRAM", role: "vram.used" }, { label: "VRAM temp", role: "vram.temp", shown: DEGREES },
        ],
      }),
  ],
};
