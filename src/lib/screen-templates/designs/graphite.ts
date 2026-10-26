/** Graphite: flat grey cards, one orange accent, rings on a flat track. The native version of the InfoPanel template. */
import { zone, type ScreenTemplate, type Zone } from "../kit";
import { cards, flow, reading, theme } from "./ports";

const CARD = { surface: "theme" };

const tiles = (at: ReturnType<typeof flow>): Zone[] => cards([
  reading(at[0], "CPU", "cpu.load", { display: "gauge", stroke: 60 }),
  reading(at[1], "GPU", "gpu.load", { display: "gauge", stroke: 60 }),
  reading(at[2], "Memory", "ram.load", { display: "bar" }),
  zone("Clock", at[3]),
  reading(at[4], "Storage", "disk.load", { display: "bar" }),
  zone("NetworkThroughput", at[5], { sparkline: true }),
], CARD);

export const GRAPHITE: ScreenTemplate = {
  id: "graphite",
  name: "Graphite",
  blurb: "Flat grey cards with one accent",
  port: true,
  fits: ["strip", "wide", "standard", "tall"],
  look: {
    theme: theme({ bg: "#121316", fg: "#eceef0", card: "#1c1e22", sub: "#8b9099", line: "#2b2e34" }),
    radius: 0.625,
    style: { skin: "default", surface: "theme", scale: 130, accent: "#ff8a3d", font: "sans", numGlow: "off", meter: "bar" },
    background: { type: "color", color: "#0d0e10" },
    gap: 10,
    padding: 10,
  },
  layouts: {
    strip: { cols: 6, rows: 1, pages: [tiles(flow(6, 6))] },
    wide: { cols: 3, rows: 2, pages: [tiles(flow(3, 6))] },
    standard: { cols: 3, rows: 2, pages: [tiles(flow(3, 6))] },
    tall: { cols: 2, rows: 3, pages: [tiles(flow(2, 6))] },
  },
};
