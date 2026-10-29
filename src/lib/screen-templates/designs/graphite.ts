/** Graphite: flat grey cards, one orange accent, rings on a flat track. The native version of the InfoPanel template. */
import { zone, type ScreenTemplate, type Zone } from "../kit";
import { cards, type Colours, flow, reading, theme, variant } from "./ports";

const CARD = { surface: "theme" };

const tiles = (at: ReturnType<typeof flow>): Zone[] => cards([
  reading(at[0], "CPU", "cpu.load", { display: "gauge", stroke: 60 }),
  reading(at[1], "GPU", "gpu.load", { display: "gauge", stroke: 60 }),
  reading(at[2], "Memory", "ram.load", { display: "bar" }),
  zone("Clock", at[3]),
  reading(at[4], "Storage", "disk.load", { display: "bar" }),
  zone("NetworkThroughput", at[5], { sparkline: true, scale: 140 }),
], CARD);

const COLOURS: Colours = { bg: "#121316", fg: "#eceef0", card: "#1c1e22", sub: "#8b9099", line: "#2b2e34" };

export const GRAPHITE: ScreenTemplate = {
  id: "graphite",
  name: "Graphite",
  blurb: "Flat gray cards with one accent",
  port: true,
  fits: ["strip", "wide", "standard", "tall"],
  size: { width: 800, height: 480 },
  look: {
    theme: theme(COLOURS),
    radius: 0.625,
    style: { skin: "auto", surface: "theme", scale: 130, accent: "#ff8a3d", font: "sans", numGlow: "off", meter: "bar" },
    background: { type: "color", color: "#0d0e10" },
    gap: 10,
    padding: 10,
  },
  variants: [
    variant("amber", "Amber", ["#ff8a3d", "#ffb37a", "#eceef0"], COLOURS, {}),
    variant("teal", "Teal", ["#2dd4bf", "#7eebdd", "#eceef0"], COLOURS, {}, { style: { accent: "#2dd4bf" } }),
    variant("violet", "Violet", ["#a78bfa", "#c9b8fd", "#eceef0"], COLOURS, {}, { style: { accent: "#a78bfa" } }),
  ],
  layouts: {
    strip: { cols: 6, rows: 1, pages: [tiles(flow(6, 6))] },
    // Rings and bars in cells of their own shape, the clock and the network across two.
    wide: { cols: 4, rows: 2, pages: [tiles([[1, 1, 1, 1], [2, 1, 1, 1], [1, 2, 1, 1], [3, 1, 2, 1], [2, 2, 1, 1], [3, 2, 2, 1]])] },
    standard: { cols: 3, rows: 2, pages: [tiles(flow(3, 6))] },
    tall: { cols: 2, rows: 3, pages: [tiles(flow(2, 6))] },
  },
};
