/**
 * Glass: translucent cards with a faint sheen and a hairline edge, over soft background glows;
 * gradient rings with an end dot. The cards and glows bake to images.
 */
import { glow, ink, type Kit, type Template } from "../kit.ts";
import { clockTile, gaugeTile, netTile } from "../parts.ts";

const pane = (k: Kit) => ({ radius: Math.round(16 * k.frame.u), fill: [ink(k, "card"), { color: "#08FFFFFF" }], angle: 0, stroke: ink(k, "track") });

export const GLASS: Template = {
  id: "glass",
  name: "Glass",
  blurb: "Translucent cards on soft glows",
  fits: ["strip", "wide", "standard", "tall"],
  background: "#FF0A0F1E",
  color: "#FFF1F5FF",
  type: { family: "Segoe UI", light: "Light", regular: "Semilight", strong: "Semibold" },
  palette: {
    accent1: "#FF60A5FA", accent2: "#FFA78BFA", accent3: "#FF22D3EE", text: "#FFF1F5FF", subtext: "#FF9AA6C4",
    track: "#2EFFFFFF", card: "#24FFFFFF", warn: "#FFFBBF24", crit: "#FFF87171",
  },
  variants: [
    { id: "aurora", name: "Aurora", palette: {} },
    { id: "sunset", name: "Sunset", palette: { accent1: "#FFFB7185", accent2: "#FFFDBA74", accent3: "#FFF472B6" } },
    { id: "lagoon", name: "Lagoon", palette: { accent1: "#FF34D399", accent2: "#FF22D3EE", accent3: "#FF60A5FA" } },
  ],
  grids: {
    standard: { cols: 3, rows: 2, cells: [[0, 0, 1, 1], [1, 0, 1, 1], [2, 0, 1, 1], [0, 1, 2, 1], [2, 1, 1, 1]] },
    wide: { cols: 6, rows: 1, cells: [[0, 0, 1, 1], [1, 0, 1, 1], [2, 0, 1, 1], [3, 0, 2, 1], [5, 0, 1, 1]] },
  },
  margin: 10,
  gap: 10,
  backdrop: (k) => {
    const { width: w, height: h } = k.frame;
    const s = Math.round(Math.max(w, h) * 0.75);
    return [
      glow(k, "Glow", { x: -s * 0.35, y: -s * 0.4, width: s, height: s }, "accent1", 0.42),
      glow(k, "Glow", { x: w - s * 0.6, y: h - s * 0.55, width: s, height: s }, "accent2", 0.34),
      glow(k, "Glow", { x: w * 0.45 - s * 0.3, y: h * 0.2, width: s * 0.6, height: s * 0.6 }, "accent3", 0.16),
    ];
  },
  tiles: [
    (k, b) => gaugeTile(k, b, { label: "CPU", icon: "cpu", role: "cpu.load", sub: "cpu.temp", foot: ["cpu.clock", "cpu.power"], ring: { fill: [ink(k, "accent1"), ink(k, "accent3")] }, card: pane(k) }),
    (k, b) => gaugeTile(k, b, { label: "GPU", icon: "gpu", role: "gpu.load", sub: "gpu.temp", foot: ["gpu.clock", "gpu.power"], ring: { fill: [ink(k, "accent2"), ink(k, "accent1")] }, card: pane(k) }),
    (k, b) => gaugeTile(k, b, { label: "Memory", icon: "memory-stick", role: "ram.load", sub: "ram.used", ring: { fill: [ink(k, "accent3"), ink(k, "accent2")] }, card: pane(k) }),
    (k, b) => netTile(k, b, { card: pane(k), up: "accent2" }),
    (k, b) => clockTile(k, b, { card: pane(k) }),
  ],
};
