/** Cores: a wall of per-core load bars under a header of the CPU's temperature, load, clock and power. The native version of the InfoPanel template. */
import { zone, type At, type ScreenTemplate, type Zone } from "../kit";
import { cards, reading, theme } from "./ports";

/** The header's four readings and the wall, at a class's boxes. */
const tiles = (head: readonly At[], wall: At): Zone[] =>
  cards(
    [
      reading(head[0], "CPU temp", "cpu.temp", { display: "value", scale: 420 }),
      reading(head[1], "Load", "cpu.load", { display: "value", scale: 280 }),
      reading(head[2], "Clock", "cpu.clock", { display: "value", scale: 280 }),
      reading(head[3], "Power", "cpu.power", { display: "value", scale: 280 }),
      zone("CpuMonitor", wall, { coreView: "bars" }),
    ],
    { surface: "theme" },
  );

export const CORES: ScreenTemplate = {
  id: "cores",
  name: "Cores",
  blurb: "A per-core load wall under a temperature header",
  port: true,
  fits: ["strip", "wide", "standard"],
  look: {
    theme: theme({ bg: "#0c0d10", fg: "#f2f3f5", card: "#16181d", sub: "#868b96", line: "#23262d" }),
    radius: 0.625,
    style: { skin: "default", surface: "theme", accent: "#34d399", font: "sans" },
    background: { type: "color", color: "#0c0d10" },
    gap: 8,
    padding: 8,
  },
  layouts: {
    strip: { cols: 12, rows: 2, pages: [tiles([[1, 1, 2, 2], [3, 1, 1, 2], [4, 1, 1, 2], [5, 1, 1, 2]], [6, 1, 7, 2])] },
    wide: { cols: 12, rows: 4, pages: [tiles([[1, 1, 3, 2], [1, 3, 1, 2], [2, 3, 1, 2], [3, 3, 1, 2]], [4, 1, 9, 4])] },
    standard: { cols: 12, rows: 6, pages: [tiles([[1, 1, 4, 2], [5, 1, 3, 2], [8, 1, 3, 2], [11, 1, 2, 2]], [1, 3, 12, 4])] },
  },
};
