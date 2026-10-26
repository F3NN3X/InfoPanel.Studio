/** Deck: a second-screen dashboard of rings, graphs, FPS, the clock and the network. The native version of the InfoPanel template. */
import { zone, type At, type ScreenTemplate, type Zone } from "../kit";
import { cards, reading, theme } from "./ports";

const BLUE = "#0a84ff";
const PURPLE = "#bf5af2";
const GREEN = "#30d158";

/** The CPU and GPU: a ring over its temperature, then FPS and the clock, at a class's boxes. */
const head = (at: readonly At[]): Zone[] => [
  reading(at[0], "CPU", "cpu.load", { display: "gauge", stroke: 55, accent: BLUE }),
  reading(at[1], "CPU temp", "cpu.temp", { display: "value", scale: 200, accent: BLUE, align: "mc" }),
  reading(at[2], "GPU", "gpu.load", { display: "gauge", stroke: 55, accent: PURPLE }),
  reading(at[3], "GPU temp", "gpu.temp", { display: "value", scale: 200, accent: PURPLE, align: "mc" }),
  zone("FpsMonitor", at[4], { view: "trend", accent: GREEN }),
  zone("Clock", at[5], { showSeconds: false, scale: 180 }),
  zone("MemoryUsage", at[6], { scale: 150 }),
];

export const DECK: ScreenTemplate = {
  id: "deck",
  name: "Deck",
  blurb: "A second-screen dashboard: rings, graphs, FPS, clock, network",
  port: true,
  fits: ["wide", "standard"],
  size: { width: 1920, height: 1080 },
  look: {
    theme: theme({ bg: "#2c3a63", fg: "#ffffff", card: "#11141d", sub: "#8c94aa", line: "#262c3b" }),
    radius: 0.75,
    style: { skin: "default", surface: "theme", accent: BLUE, font: "sans" },
    background: { type: "gradient", gradient: { from: "#2c4a8a", to: "#5a3a8f", angle: 135 } },
    gap: 12,
    padding: 16,
  },
  layouts: {
    wide: {
      cols: 4,
      rows: 4,
      pages: [cards(head([[1, 1, 1, 3], [1, 4, 1, 1], [2, 1, 1, 3], [2, 4, 1, 1], [3, 1, 1, 4], [4, 1, 1, 2], [4, 3, 1, 2]]), { surface: "theme" })],
    },
    standard: {
      cols: 4,
      rows: 6,
      pages: [
        cards(
          [
            ...head([[1, 1, 1, 2], [1, 3, 1, 1], [2, 1, 1, 2], [2, 3, 1, 1], [3, 1, 1, 3], [4, 1, 1, 1], [4, 2, 1, 2]]),
            reading([1, 4, 3, 1], "CPU", "cpu.load", { display: "spark", accent: BLUE }),
            reading([1, 5, 3, 1], "GPU", "gpu.load", { display: "spark", accent: PURPLE }),
            reading([1, 6, 3, 1], "FPS", "fps", { display: "spark", accent: GREEN }),
            zone("NetworkThroughput", [4, 4, 1, 3], { sparkline: true, scale: 160 }),
          ],
          { surface: "theme" },
        ),
      ],
    },
  },
};
