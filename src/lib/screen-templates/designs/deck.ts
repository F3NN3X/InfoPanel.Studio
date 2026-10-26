/** Deck: a second-screen dashboard of rings, graphs, FPS, the clock and the network. The native version of the InfoPanel template. */
import { zone, type At, type ScreenTemplate, type Zone } from "../kit";
import { cards, reading, theme } from "./ports";

const head = (at: readonly At[]): Zone[] => [
  reading(at[0], "CPU", "cpu.load", { display: "gauge", stroke: 55, accent: "#0a84ff" }),
  reading(at[1], "GPU", "gpu.load", { display: "gauge", stroke: 55, accent: "#bf5af2" }),
  zone("FpsMonitor", at[2], { view: "trend", accent: "#30d158" }),
  zone("Clock", at[3], { showSeconds: false }),
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
    style: { skin: "default", surface: "theme", accent: "#0a84ff", font: "sans" },
    background: { type: "gradient", gradient: { from: "#2c4a8a", to: "#5a3a8f", angle: 135 } },
    gap: 12,
    padding: 16,
  },
  layouts: {
    wide: {
      cols: 4,
      rows: 2,
      pages: [cards([...head([[1, 1, 1, 2], [2, 1, 1, 2], [3, 1, 1, 2], [4, 1, 1, 1]]), zone("MemoryUsage", [4, 2, 1, 1])], { surface: "theme" })],
    },
    standard: {
      cols: 4,
      rows: 4,
      pages: [
        cards(
          [
            ...head([[1, 1, 1, 2], [2, 1, 1, 2], [3, 1, 1, 2], [4, 1, 1, 1]]),
            zone("MemoryUsage", [4, 2, 1, 1]),
            zone("SystemOverview", [1, 3, 3, 2], { view: "graphs", sections: "cpu,gpu", accent: "#0a84ff" }),
            zone("NetworkThroughput", [4, 3, 1, 2], { sparkline: true }),
          ],
          { surface: "theme" },
        ),
      ],
    },
  },
};
