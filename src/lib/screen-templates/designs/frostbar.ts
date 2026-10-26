/** Frost Bar: frosted glass cards over a soft wash. The native version of the InfoPanel template. */
import { zone, type At, type ScreenTemplate, type Zone } from "../kit";
import { cards, reading, theme } from "./ports";

/** System load, memory, the clock, uptime and the network, then three rings, at a class's boxes. */
const tiles = (at: readonly At[]): Zone[] =>
  cards(
    [
      zone("SystemOverview", at[0], { view: "gauges", sections: "cpu,gpu" }),
      zone("MemoryUsage", at[1], { scale: 130 }),
      zone("Clock", at[2], { showSeconds: false, scale: 130 }),
      zone("Uptime", at[3], { scale: 130 }),
      zone("NetworkThroughput", at[4], { scale: 140 }),
      reading(at[5], "CPU", "cpu.temp", { display: "gauge", stroke: 55 }),
      reading(at[6], "GPU", "gpu.temp", { display: "gauge", stroke: 55, accent: "#4dd0ff" }),
      reading(at[7], "RAM", "ram.load", { display: "gauge", stroke: 55, accent: "#b07cff" }),
    ],
    { surface: "glass", blur: "24" },
  );

export const FROSTBAR: ScreenTemplate = {
  id: "frostbar",
  name: "Frost Bar",
  blurb: "Frosted glass cards over a soft wash",
  port: true,
  fits: ["wide", "standard"],
  look: {
    theme: theme({ bg: "#0a0a1e", fg: "#ffffff", card: "#1a1840", sub: "#d2c9ea", line: "#3a3566" }),
    radius: 1,
    style: { skin: "default", surface: "glass", accent: "#5b9bff", blur: "24", font: "sans" },
    background: { type: "gradient", gradient: { from: "#4a2f6b", to: "#0a1a4a", angle: 150 } },
    gap: 14,
    padding: 18,
  },
  layouts: {
    wide: { cols: 9, rows: 2, pages: [tiles([[1, 1, 2, 2], [3, 1, 2, 1], [3, 2, 2, 1], [5, 1, 1, 2], [6, 1, 1, 2], [7, 1, 1, 2], [8, 1, 1, 2], [9, 1, 1, 2]])] },
    standard: { cols: 5, rows: 4, pages: [tiles([[1, 1, 2, 2], [3, 1, 3, 1], [3, 2, 3, 1], [1, 3, 1, 2], [2, 3, 1, 2], [3, 3, 1, 2], [4, 3, 1, 2], [5, 3, 1, 2]])] },
  },
};
