/** Mono: black, huge thin numerals, tiny capital labels and hairline dividers. All native. */
import type { DisplayItem } from "../../schema.ts";
import { divider, ink, text, value, type Kit, type Template } from "../kit.ts";
import type { Box } from "../layout.ts";
import { headPx, lineOf, padOf } from "../parts.ts";
import type { Role } from "../roles.ts";

/** A hairline, a small label, the value as large as the tile allows, and two small values under it. */
function figure(k: Kit, b: Box, label: string, role: Role, under: readonly [string, Role, Role]): DisplayItem[] {
  const p = padOf(k, 8);
  const hp = headPx(k, b);
  const smallPx = Math.max(9, Math.round(hp * 1.1));
  const room = b.height - p - lineOf(hp) - lineOf(smallPx) - p;
  const px = Math.max(16, Math.round(Math.min(room / 1.25, b.width * 0.36)));
  const vy = b.y + p + lineOf(hp) + (room - lineOf(px) * 0.9) / 2 - px * 0.08;
  const sy = b.y + b.height - lineOf(smallPx);
  return [
    divider(k, { x: b.x, y: b.y, width: b.width, height: 1 }, { fill: [ink(k, "track")] }),
    text(k, label, { x: b.x, y: b.y + p, px: hp, slot: "subtext", weight: "strong", upper: true }),
    value(k, role, { x: b.x - Math.round(px * 0.04), y: vy, px, weight: "light" }),
    text(k, under[0], { x: b.x, y: sy, px: smallPx, slot: "subtext", upper: true }),
    value(k, under[1], { x: b.x + Math.round(smallPx * 3.4), y: sy, px: smallPx, slot: "text" }),
    value(k, under[2], { x: b.x, y: sy, px: smallPx, width: b.width, align: "right", slot: "subtext" }),
  ];
}

export const MONO: Template = {
  id: "mono",
  name: "Mono",
  blurb: "Black, huge thin numerals, hairlines",
  fits: ["strip", "wide", "standard"],
  background: "#FF000000",
  color: "#FFFFFFFF",
  type: { family: "Segoe UI", light: "Light", regular: "Regular", strong: "Semibold" },
  palette: {
    accent1: "#FFFFFFFF", accent2: "#FFBDBDBD", accent3: "#FF8A8A8A", text: "#FFFFFFFF", subtext: "#FF7C7C7C",
    track: "#FF2E2E2E", card: "#FF0A0A0A", warn: "#FFFFC857", crit: "#FFFF5A5A",
  },
  variants: [
    { id: "white", name: "White", palette: {} },
    { id: "amber", name: "Amber", palette: { text: "#FFFFB547", accent1: "#FFFFB547", subtext: "#FF8F6A30", track: "#FF3A2C14" } },
    { id: "ice", name: "Ice", palette: { text: "#FFD6ECFF", accent1: "#FFD6ECFF", subtext: "#FF6F8597", track: "#FF1E2A36" } },
  ],
  grids: {
    standard: { cols: 2, rows: 2, cells: [[0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1]] },
    wide: { cols: 4, rows: 1, cells: [[0, 0, 1, 1], [1, 0, 1, 1], [2, 0, 1, 1], [3, 0, 1, 1]] },
  },
  margin: 18,
  gap: 22,
  tiles: [
    (k, b) => figure(k, b, "CPU", "cpu.load", ["Temp", "cpu.temp", "cpu.clock"]),
    (k, b) => figure(k, b, "GPU", "gpu.load", ["Temp", "gpu.temp", "gpu.power"]),
    (k, b) => figure(k, b, "Memory", "ram.load", ["Used", "ram.used", "uptime"]),
    (k, b) => figure(k, b, "Disk", "disk.load", ["Down", "net.down", "net.up"]),
  ],
};
