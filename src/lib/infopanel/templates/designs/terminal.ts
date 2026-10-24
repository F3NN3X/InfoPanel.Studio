/**
 * Terminal: monospace green on black, two console panes of label, LED meter and value lines
 * under a prompt. The panes are native Shapes; the LED meters bake to frames.
 */
import type { DisplayItem } from "../../schema.ts";
import { card, clock, ink, ledbar, text, value, type Kit, type Template } from "../kit.ts";
import { inset, type Box } from "../layout.ts";
import { lineOf, padOf } from "../parts.ts";
import type { Role } from "../roles.ts";

interface Line {
  label: string;
  role: Role;
  /** An LED meter between the label and the value. */
  meter?: boolean;
}

/** A pane: a stroked box, a prompt line, then one line per role. */
function pane(k: Kit, b: Box, prompt: string, lines: readonly Line[], withClock: boolean): DisplayItem[] {
  const p = padOf(k, 9);
  const inner = inset(b, p);
  const step = inner.height / (lines.length + 1);
  const px = Math.max(9, Math.round(Math.min(step / 1.6, 15 * k.frame.u, inner.width / 24)));
  const labelW = Math.round(px * 0.55 * 7);
  const valueW = Math.round(px * 0.55 * 9);
  const lineY = (i: number) => inner.y + i * step + (step - lineOf(px)) / 2;
  return [
    card(k, `${prompt} pane`, b, { radius: Math.round(4 * k.frame.u), fill: [ink(k, "card")], stroke: ink(k, "track") }),
    text(k, `$ ${prompt}`, { x: inner.x, y: lineY(0), px, slot: "subtext" }),
    ...(withClock ? [clock(k, "HH:mm:ss", { x: inner.x, y: lineY(0), px, width: inner.width, align: "right", slot: "subtext" })] : []),
    ...lines.flatMap((l, i) => {
      const y = lineY(i + 1);
      const meterBox = { x: inner.x + labelW, y: y + px * 0.28, width: inner.width - labelW - valueW, height: Math.max(4, Math.round(px * 0.8)) };
      return [
        text(k, l.label, { x: inner.x, y, px, slot: "accent1" }),
        ...(l.meter ? [ledbar(k, l.role, meterBox, { segments: Math.max(8, Math.round(meterBox.width / (px * 0.7))), gap: Math.max(1, Math.round(px * 0.15)), radius: 0, glow: 0, fill: [ink(k, "accent1")] })] : []),
        value(k, l.role, { x: inner.x, y, px, width: inner.width, align: "right", slot: "text" }),
      ];
    }),
  ];
}

export const TERMINAL: Template = {
  id: "terminal",
  name: "Terminal",
  blurb: "Monospace, green on black, a console",
  background: "#FF010402",
  color: "#FF39FF88",
  type: { family: "Consolas", light: "Regular", regular: "Regular", strong: "Bold" },
  palette: {
    accent1: "#FF39FF88", accent2: "#FF9DFFC4", accent3: "#FF39FF88", text: "#FFB8FFD3", subtext: "#FF1F9D52",
    track: "#FF0D2B17", card: "#FF030A06", warn: "#FFE6FF5C", crit: "#FFFF5C5C",
  },
  variants: [
    { id: "green", name: "Green", palette: {} },
    { id: "amber", name: "Amber", palette: { accent1: "#FFFFB000", accent2: "#FFFFD27A", accent3: "#FFFFB000", text: "#FFFFE2A8", subtext: "#FF9C6C00", track: "#FF2E2100", card: "#FF0A0700" } },
    { id: "cyan", name: "Cyan", palette: { accent1: "#FF4DD8FF", accent2: "#FFA8ECFF", accent3: "#FF4DD8FF", text: "#FFC9F3FF", subtext: "#FF2A86A3", track: "#FF0B2530", card: "#FF02080B" } },
  ],
  grids: {
    standard: { cols: 2, rows: 1, cells: [[0, 0, 1, 1], [1, 0, 1, 1]] },
    wide: { cols: 2, rows: 1, cells: [[0, 0, 1, 1], [1, 0, 1, 1]] },
  },
  margin: 8,
  gap: 8,
  tiles: [
    (k, b) =>
      pane(k, b, "sensors --cpu --gpu", [
        { label: "cpu", role: "cpu.load", meter: true },
        { label: "temp", role: "cpu.temp", meter: true },
        { label: "clock", role: "cpu.clock" },
        { label: "gpu", role: "gpu.load", meter: true },
        { label: "temp", role: "gpu.temp", meter: true },
        { label: "power", role: "gpu.power" },
      ], false),
    (k, b) =>
      pane(k, b, "free && ifstat", [
        { label: "ram", role: "ram.load", meter: true },
        { label: "disk", role: "disk.load", meter: true },
        { label: "rx", role: "net.down" },
        { label: "tx", role: "net.up" },
        { label: "cpu W", role: "cpu.power" },
        { label: "up", role: "uptime" },
      ], true),
  ],
};
