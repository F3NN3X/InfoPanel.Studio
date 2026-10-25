/**
 * Quota: the clock and the system footer only. A big clock with the date and uptime, and a
 * System list of CPU, RAM, GPU and Disk, each a label, its percentage and a thin bar.
 */
import type { DisplayItem } from "../../schema.ts";
import { labelRows } from "../composites.ts";
import { card, clock, ink, text, value, type Kit, type Template } from "../kit.ts";
import { inset, type Box } from "../layout.ts";
import { lineOf } from "../parts.ts";

const scaled = (s: number) => (n: number) => Math.max(8, Math.round(n * s));

const pane = (k: Kit, name: string, b: Box): DisplayItem => card(k, name, b, { radius: Math.round(14 * k.frame.u), fill: [ink(k, "card")], stroke: ink(k, "track") });

function clockTile(k: Kit, b: Box): DisplayItem[] {
  const px = scaled(Math.min(b.width / 760, b.height / 500));
  const pad = inset(b, px(34));
  const big = Math.round(Math.min(px(230), pad.width * 0.34, pad.height * 0.62));
  const block = lineOf(big) * 0.92 + lineOf(px(36)) + lineOf(px(22));
  const inner = { ...pad, y: pad.y + Math.max(0, (pad.height - block) / 2) };
  const dateY = inner.y + lineOf(big) * 0.92;
  return [
    pane(k, "Clock card", b),
    clock(k, "HH:mm", { x: inner.x - Math.round(big * 0.03), y: inner.y, px: big, weight: "light" }),
    clock(k, "dddd d MMMM yyyy", { x: inner.x, y: dateY, px: px(36), weight: "strong" }, true),
    text(k, "Up", { x: inner.x, y: dateY + lineOf(px(36)), px: px(22), slot: "subtext", upper: true, weight: "strong" }),
    value(k, "uptime", { x: inner.x + px(54), y: dateY + lineOf(px(36)), px: px(22), slot: "accent1" }),
  ];
}

function systemTile(k: Kit, b: Box): DisplayItem[] {
  const px = scaled(Math.min(b.width / 1100, b.height / 500));
  const inner = inset(b, px(34));
  const head = lineOf(px(22));
  return [
    pane(k, "System card", b),
    text(k, "SYSTEM", { x: inner.x, y: inner.y, px: px(22), slot: "subtext", weight: "strong", upper: true }),
    labelRows(
      k,
      { x: inner.x, y: inner.y + head + px(12), width: inner.width, height: inner.height - head - px(12) },
      [{ label: "CPU", role: "cpu.load" }, { label: "RAM", role: "ram.load" }, { label: "GPU", role: "gpu.load" }, { label: "Disk", role: "disk.load" }],
      { px: px(34), bar: true, fill: "accent1", value: "text", label: "text" },
    ),
  ];
}

export const QUOTA: Template = {
  id: "quota",
  name: "Quota",
  blurb: "A big clock and a system footer",
  background: "#FF090B0E",
  color: "#FFF5F7FA",
  type: { family: "Segoe UI", light: "Light", regular: "Regular", strong: "Semibold" },
  palette: {
    accent1: "#FF9AA7FF", accent2: "#FF7FD6C4", accent3: "#FFF2B27A", text: "#FFF5F7FA", subtext: "#FF8A92A0",
    track: "#FF262B34", card: "#FF10131A", warn: "#FFFFC857", crit: "#FFFF6B6B",
  },
  variants: [
    { id: "slate", name: "Slate", palette: {} },
    { id: "sand", name: "Sand", palette: { accent1: "#FFE8B86B", accent2: "#FFD98C5F", accent3: "#FFF4D9A6", subtext: "#FF9C917C", track: "#FF2E2A22", card: "#FF15130F" } },
  ],
  grids: {
    standard: { cols: 1, rows: 2, cells: [[0, 0, 1, 1], [0, 1, 1, 1]] },
    wide: { cols: 5, rows: 1, cells: [[0, 0, 2, 1], [2, 0, 3, 1]] },
  },
  margin: 10,
  gap: 10,
  tiles: [(k, b) => clockTile(k, b), (k, b) => systemTile(k, b)],
};
