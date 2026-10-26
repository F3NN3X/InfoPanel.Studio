/** Deck: a second-screen dashboard of rings, graphs, FPS, the clock and the network. The native version of the InfoPanel template. */
import { zone, type ScreenTemplate, type Zone } from "../kit";
import type { Role } from "../../infopanel/templates/roles";
import { cards, type Colours, darkFamily, reading, theme } from "./ports";

const BLUE = "#0a84ff";
const PURPLE = "#bf5af2";
const GREEN = "#30d158";

/**
 * A processor tile of 2 columns and 8 rows from (col, 1): its load as a ring with the temperature, clock and power
 * beside it, and the load's history under.
 */
const processor = (col: number, label: string, load: Role, temp: Role, clock: Role, power: Role, accent: string): Zone[] => [
  reading([col, 1, 1, 4], label, load, { display: "gauge", stroke: 55, accent }),
  reading([col + 1, 1, 1, 2], `${label} temp`, temp, { display: "line", lineValue: "only", showTitle: false }),
  reading([col + 1, 3, 1, 1], `${label} clock`, clock, { display: "line", lineValue: "only", showTitle: false }),
  reading([col + 1, 4, 1, 1], `${label} power`, power, { display: "line", lineValue: "only", showTitle: false }),
  reading([col, 5, 2, 4], label, load, { display: "spark", accent }),
];

/** The CPU and GPU tiles, FPS, the clock and memory: the top of both layouts, `rows` tall. */
const head = (rows: number): Zone[] => [
  ...processor(1, "CPU", "cpu.load", "cpu.temp", "cpu.clock", "cpu.power", BLUE),
  ...processor(3, "GPU", "gpu.load", "gpu.temp", "gpu.clock", "gpu.power", PURPLE),
  zone("FpsMonitor", [5, 1, 2, rows], { view: "trend", accent: GREEN }),
  zone("Clock", [7, 1, 2, rows / 2], { showSeconds: false, scale: 180 }),
  zone("MemoryUsage", [7, rows / 2 + 1, 2, rows / 2], { scale: 150 }),
];

const COLOURS: Colours = { bg: "#2c3a63", fg: "#ffffff", card: "#11141d", sub: "#8c94aa", line: "#262c3b" };

export const DECK: ScreenTemplate = {
  id: "deck",
  name: "Deck",
  blurb: "A second-screen dashboard: rings, graphs, FPS, clock, network",
  port: true,
  fits: ["wide", "standard"],
  size: { width: 1920, height: 1080 },
  look: {
    theme: theme(COLOURS),
    radius: 0.75,
    style: { skin: "default", surface: "theme", accent: BLUE, font: "sans" },
    background: { type: "gradient", gradient: { from: "#2c4a8a", to: "#5a3a8f", angle: 135 } },
    gap: 12,
    padding: 16,
  },
  variants: darkFamily(COLOURS, "white", "smoke", "tint", "float"),
  layouts: {
    wide: {
      cols: 8,
      rows: 8,
      pages: [cards(head(8), { surface: "theme" })],
    },
    standard: {
      cols: 8,
      rows: 14,
      pages: [
        cards(
          [
            ...head(8),
            reading([1, 9, 6, 2], "CPU", "cpu.load", { display: "spark", accent: BLUE }),
            reading([1, 11, 6, 2], "GPU", "gpu.load", { display: "spark", accent: PURPLE }),
            reading([1, 13, 6, 2], "FPS", "fps", { display: "spark", accent: GREEN }),
            zone("NetworkThroughput", [7, 9, 2, 6], { sparkline: true, scale: 160 }),
          ],
          { surface: "theme" },
        ),
      ],
    },
  },
};
