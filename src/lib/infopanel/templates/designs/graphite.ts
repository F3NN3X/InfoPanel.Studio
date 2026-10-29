/** Graphite: flat grey cards, one accent, rings with a flat track. Every card exports as a native Shape. */
import { ink, type Kit, type Template } from "../kit.ts";
import { barsTile, clockTile, gaugeTile, netTile } from "../parts.ts";

const flat = (k: Kit) => ({ radius: Math.round(10 * k.frame.u) });
const ringOf = (k: Kit) => ({ fill: [ink(k, "accent1")], dot: false, rounded: true, start: -135, sweep: 270 });

export const GRAPHITE: Template = {
  id: "graphite",
  name: "Graphite",
  blurb: "Flat gray cards with one accent",
  fits: ["strip", "wide", "standard", "tall"],
  background: "#FF121316",
  color: "#FFECEDEF",
  type: { family: "Segoe UI", light: "Light", regular: "Regular", strong: "Semibold" },
  palette: {
    accent1: "#FFFF8A3D", accent2: "#FFFFB37A", accent3: "#FFFF8A3D", text: "#FFECEDEF", subtext: "#FF8B9099",
    track: "#FF2B2E34", card: "#FF1C1E22", warn: "#FFF5B83D", crit: "#FFF0524F",
  },
  variants: [
    { id: "amber", name: "Amber", palette: {} },
    { id: "teal", name: "Teal", palette: { accent1: "#FF2DD4BF", accent2: "#FF7EEBDD", accent3: "#FF2DD4BF" } },
    { id: "violet", name: "Violet", palette: { accent1: "#FFA78BFA", accent2: "#FFC9B8FD", accent3: "#FFA78BFA" } },
  ],
  grids: {
    standard: { cols: 3, rows: 2, cells: [[0, 0, 1, 1], [1, 0, 1, 1], [2, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1], [2, 1, 1, 1]] },
    wide: { cols: 6, rows: 1, cells: [[0, 0, 1, 1], [1, 0, 1, 1], [2, 0, 1, 1], [3, 0, 1, 1], [4, 0, 1, 1], [5, 0, 1, 1]] },
  },
  margin: 8,
  gap: 8,
  tiles: [
    (k, b) => gaugeTile(k, b, { label: "CPU", icon: "cpu", role: "cpu.load", sub: "cpu.temp", foot: ["cpu.clock", "cpu.power"], ring: ringOf(k), card: flat(k) }),
    (k, b) => gaugeTile(k, b, { label: "GPU", icon: "gpu", role: "gpu.load", sub: "gpu.temp", foot: ["gpu.clock", "gpu.power"], ring: ringOf(k), card: flat(k) }),
    (k, b) =>
      barsTile(k, b, {
        label: "Memory", icon: "memory-stick", card: flat(k),
        entries: [{ label: "Load", role: "ram.load" }, { label: "Used", role: "ram.used", meter: false }],
      }),
    (k, b) => clockTile(k, b, { card: flat(k) }),
    (k, b) =>
      barsTile(k, b, {
        label: "Storage", icon: "hard-drive", card: flat(k),
        entries: [{ label: "Activity", role: "disk.load" }, { label: "Temp", role: "disk.temp" }],
      }),
    (k, b) => netTile(k, b, { card: flat(k), spark: { style: "line", dot: false, gradient: false }, up: "accent2" }),
  ],
};
