/** Neon: near-black panels outlined in a glowing accent, LED-segment meters. The native version of the InfoPanel template. */
import { zone, type At, type ScreenTemplate, type Zone } from "../kit";
import { cards, reading, theme } from "./ports";

const cyan = { accent: "#00e5ff", glowColor: "#00e5ff" };
const pink = { accent: "#ff2bd6", glowColor: "#ff2bd6" };

const CARD = { surface: "neon", glow: "soft", meter: "segments" };

/** CPU and GPU rings, RAM and Disk bars, and the network, at the boxes of a class. */
const tiles = (at: readonly At[]): Zone[] =>
  cards(
    [
      reading(at[0], "CPU", "cpu.load", { ...cyan, display: "gauge", stroke: 60 }),
      reading(at[1], "GPU", "gpu.load", { ...pink, display: "gauge", stroke: 60 }),
      reading(at[2], "RAM", "ram.load", { ...pink, display: "bar" }),
      reading(at[3], "Disk", "disk.load", { ...pink, display: "bar" }),
      zone("NetworkThroughput", at[4], { ...cyan, sparkline: true, scale: 140 }),
    ],
    CARD,
  );

const row = tiles([[1, 1, 1, 2], [2, 1, 1, 2], [3, 1, 1, 1], [3, 2, 1, 1], [4, 1, 1, 2]]);
const grid = tiles([[1, 1, 1, 2], [2, 1, 1, 2], [1, 3, 1, 1], [1, 4, 1, 1], [2, 3, 1, 2]]);
// Rings keep their cells no taller than wide.
const wide = tiles([[1, 1, 2, 1], [3, 1, 2, 1], [1, 2, 1, 1], [2, 2, 1, 1], [3, 2, 2, 1]]);
const tall = tiles([[1, 1, 2, 2], [1, 3, 2, 2], [1, 5, 1, 1], [1, 6, 1, 1], [2, 5, 1, 2]]);

export const NEON: ScreenTemplate = {
  id: "neon",
  name: "Neon",
  blurb: "Dark panels, glowing outlines, LED segments",
  port: true,
  fits: ["strip", "wide", "standard", "tall"],
  look: {
    theme: theme({ bg: "#06040b", fg: "#f5f3ff", card: "#0b0816", sub: "#8e86b3", line: "#1c1633" }),
    radius: 0.375,
    style: { skin: "cyber", surface: "neon", accent: "#00e5ff", glow: "soft", glowColor: "#00e5ff", meter: "segments", numGlow: "soft", font: "rajdhani" },
    background: { type: "color", color: "#06040b" },
    gap: 14,
    padding: 14,
  },
  layouts: {
    strip: { cols: 4, rows: 2, pages: [row] },
    wide: { cols: 4, rows: 2, pages: [wide] },
    standard: { cols: 2, rows: 4, pages: [grid] },
    tall: { cols: 2, rows: 6, pages: [tall] },
  },
};
