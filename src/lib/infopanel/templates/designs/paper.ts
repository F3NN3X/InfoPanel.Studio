/** Paper: a light theme, white cards with soft shadows (baked), dark type and one ink accent. */
import { ink, type Kit, type Template } from "../kit.ts";
import { barsTile, clockTile, gaugeTile, netTile } from "../parts.ts";

const sheet = (k: Kit) => ({
  radius: Math.round(12 * k.frame.u), fill: [ink(k, "card")],
  shadow: { blur: Math.round(10 * k.frame.u), dx: 0, dy: Math.round(3 * k.frame.u), color: { color: "#24000000" } },
});
const ringOf = (k: Kit, slot: "accent1" | "accent2") => ({ fill: [ink(k, slot)], dot: false, rounded: true });

export const PAPER: Template = {
  id: "paper",
  name: "Paper",
  blurb: "Light, white cards with soft shadows",
  fits: ["strip", "wide", "standard", "tall"],
  background: "#FFF2EFE9",
  color: "#FF1C1F24",
  type: { family: "Segoe UI", light: "Light", regular: "Regular", strong: "Semibold" },
  palette: {
    accent1: "#FF2563EB", accent2: "#FF0EA5E9", accent3: "#FF6366F1", text: "#FF1C1F24", subtext: "#FF6B6F78",
    track: "#FFE7E3DB", card: "#FFFFFFFF", warn: "#FFD97706", crit: "#FFDC2626",
  },
  variants: [
    { id: "ink", name: "Ink", palette: {} },
    { id: "coral", name: "Coral", palette: { accent1: "#FFF2604E", accent2: "#FFF59E0B", accent3: "#FFE11D48" } },
    { id: "forest", name: "Forest", palette: { accent1: "#FF15803D", accent2: "#FF0D9488", accent3: "#FF65A30D" } },
  ],
  grids: {
    standard: { cols: 3, rows: 2, cells: [[0, 0, 2, 1], [2, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1], [2, 1, 1, 1]] },
    wide: { cols: 6, rows: 1, cells: [[0, 0, 2, 1], [2, 0, 1, 1], [3, 0, 1, 1], [4, 0, 1, 1], [5, 0, 1, 1]] },
  },
  margin: 12,
  gap: 12,
  tiles: [
    (k, b) => clockTile(k, b, { card: sheet(k), weight: "light" }),
    (k, b) => gaugeTile(k, b, { label: "CPU", icon: "cpu", role: "cpu.load", sub: "cpu.temp", ring: ringOf(k, "accent1"), card: sheet(k) }),
    (k, b) => gaugeTile(k, b, { label: "GPU", icon: "gpu", role: "gpu.load", sub: "gpu.temp", ring: ringOf(k, "accent2"), card: sheet(k) }),
    (k, b) =>
      barsTile(k, b, {
        label: "Memory", icon: "memory-stick", card: sheet(k),
        entries: [{ label: "RAM", role: "ram.load" }, { label: "Disk", role: "disk.load", fill: "accent2" }],
      }),
    (k, b) => netTile(k, b, { card: sheet(k), up: "accent3", spark: { style: "line", dot: true, gradient: false } }),
  ],
};
