/**
 * Cores: a wall of per-core load bars (the Cores element, native Bars bound to each core) under a
 * header of the CPU's temperature, load, clock and power. Cards and bars are all native.
 */
import type { DisplayItem } from "../../schema.ts";
import { card, cores, ink, text, value, type Kit, type Template } from "../kit.ts";
import { inset, split, type Box } from "../layout.ts";
import { heading, lineOf, padOf, row } from "../parts.ts";

const flat = (k: Kit) => ({ radius: Math.round(10 * k.frame.u) });

/** The CPU temperature large with its label, and three readings beside it (or under it, in a narrow box). */
function header(k: Kit, b: Box): DisplayItem[] {
  const p = padOf(k);
  const inner = inset(b, p);
  const across = inner.width >= inner.height * 1.6;
  const [left, right] = split(inner, across ? [1, 1.2] : [1, 1], p * 1.5, across);
  const head = heading(k, left, "CPU temp", { icon: "thermometer" });
  const px = Math.max(16, Math.round(Math.min((left.height - head.height) / 1.3, left.width * 0.34)));
  const rows = [["Load", "cpu.load"], ["Clock", "cpu.clock"], ["Power", "cpu.power"]] as const;
  const rp = Math.max(9, Math.round(Math.min(right.height / (rows.length * 1.8), right.width * 0.1, 16 * k.frame.u)));
  const step = right.height / rows.length;
  return [
    card(k, "CPU card", b, flat(k)),
    ...head.items,
    value(k, "cpu.temp", { x: left.x, y: left.y + head.height + (left.height - head.height - lineOf(px)) / 2, px, weight: "light" }),
    ...rows.flatMap(([label, role], i) => row(k, { x: right.x, y: right.y + i * step + (step - lineOf(rp)) / 2, width: right.width, height: lineOf(rp) }, label, role, { px: rp })),
  ];
}

function wall(k: Kit, b: Box): DisplayItem[] {
  const p = padOf(k);
  const inner = inset(b, p);
  const head = heading(k, inner, "Cores", { icon: "microchip" });
  const sub = Math.max(9, Math.round(head.height * 0.72));
  const body = { x: inner.x, y: inner.y + head.height + p * 0.6, width: inner.width, height: inner.height - head.height - p * 0.6 };
  return [
    card(k, "Cores card", b, flat(k)),
    ...head.items,
    text(k, "per-core load", { x: inner.x, y: inner.y + (head.height - lineOf(sub)) / 2, px: sub, width: inner.width, align: "right", slot: "subtext" }),
    cores(k, body, { gap: Math.max(2, Math.round(3 * k.frame.u)), radius: Math.max(1, Math.round(2 * k.frame.u)), fill: ink(k, "accent1"), track: ink(k, "track") }),
  ];
}

export const CORES: Template = {
  id: "cores",
  name: "Cores",
  blurb: "A per-core load wall under a temperature header",
  fits: ["strip", "wide", "standard"],
  background: "#FF0C0D10",
  color: "#FFF2F3F5",
  type: { family: "Segoe UI", light: "Light", regular: "Regular", strong: "Semibold" },
  palette: {
    accent1: "#FF34D399", accent2: "#FFFBBF24", accent3: "#FFF87171", text: "#FFF2F3F5", subtext: "#FF868B96",
    track: "#FF23262D", card: "#FF16181D", warn: "#FFFBBF24", crit: "#FFF87171",
  },
  variants: [
    { id: "mint", name: "Mint", palette: {} },
    { id: "heat", name: "Heat", palette: { accent1: "#FFF97316", accent2: "#FFFACC15", accent3: "#FFEF4444" } },
    { id: "ocean", name: "Ocean", palette: { accent1: "#FF38BDF8", accent2: "#FF818CF8", accent3: "#FF22D3EE" } },
  ],
  grids: {
    standard: { cols: 1, rows: 3, cells: [[0, 0, 1, 1], [0, 1, 1, 2]] },
    wide: { cols: 4, rows: 1, cells: [[0, 0, 1, 1], [1, 0, 3, 1]] },
  },
  margin: 8,
  gap: 8,
  tiles: [(k, b) => header(k, b), (k, b) => wall(k, b)],
};
