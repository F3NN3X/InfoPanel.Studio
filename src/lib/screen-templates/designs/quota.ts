/** Quota: a big clock and a footer of thin bars for the system. The native version of the InfoPanel template. */
import { zone, type At, type ScreenTemplate, type Zone } from "../kit";
import { cards, type Colours, reading, theme, variant } from "./ports";

const flat = { surface: "theme", meter: "bar", scale: 120 };

/** The clock, then CPU, RAM, GPU and Disk as thin bars at four boxes. */
const tiles = (clock: At, bars: readonly At[]): Zone[] => [
  ...cards([zone("Clock", clock, { showSeconds: false, scale: 220, fontWeight: "400", align: "ml" })], { surface: "theme" }),
  ...cards(
    [
      reading(bars[0], "CPU", "cpu.load", { display: "bar" }),
      reading(bars[1], "RAM", "ram.load", { display: "bar" }),
      reading(bars[2], "GPU", "gpu.load", { display: "bar" }),
      reading(bars[3], "Disk", "disk.load", { display: "bar" }),
    ],
    flat,
  ),
];

const COLOURS: Colours = { bg: "#090b0e", fg: "#f5f7fa", card: "#0e1118", sub: "#8a92a0", line: "#222733" };

export const QUOTA: ScreenTemplate = {
  id: "quota",
  name: "Quota",
  blurb: "A big clock and a system footer",
  port: true,
  fits: ["strip", "wide", "standard"],
  size: { width: 800, height: 480 },
  look: {
    theme: theme(COLOURS),
    radius: 0.5,
    style: { skin: "default", surface: "theme", accent: "#9aa7ff", font: "sans", numGlow: "off" },
    background: { type: "color", color: "#090b0e" },
    gap: 10,
    padding: 10,
  },
  variants: [
    variant("slate", "Slate", ["#9aa7ff", "#7fd6c4", "#f5f7fa"], COLOURS, {}),
    variant("sand", "Sand", ["#e8b86b", "#d98c5f", "#f5f7fa"], COLOURS, { card: "#15130f", sub: "#9c917c", line: "#2e2a22" }, { style: { accent: "#e8b86b" } }),
  ],
  layouts: {
    strip: { cols: 5, rows: 4, pages: [tiles([1, 1, 2, 4], [[3, 1, 3, 1], [3, 2, 3, 1], [3, 3, 3, 1], [3, 4, 3, 1]])] },
    wide: { cols: 5, rows: 4, pages: [tiles([1, 1, 2, 4], [[3, 1, 3, 1], [3, 2, 3, 1], [3, 3, 3, 1], [3, 4, 3, 1]])] },
    standard: { cols: 2, rows: 7, pages: [tiles([1, 1, 2, 3], [[1, 4, 2, 1], [1, 5, 2, 1], [1, 6, 2, 1], [1, 7, 2, 1]])] },
  },
};
