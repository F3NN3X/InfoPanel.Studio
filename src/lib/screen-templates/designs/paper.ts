/** Paper: a light theme, white cards with soft shadows, dark type and one ink accent. The native version of the InfoPanel template. */
import { zone, type At, type ScreenTemplate, type Zone } from "../kit";
import { cards, type Colours, reading, theme, variant } from "./ports";

const shadow = ":scope { box-shadow: 0 3px 10px rgba(0, 0, 0, 0.14); }";

const tiles = (at: readonly At[]): Zone[] =>
  cards(
    [
      zone("Clock", at[0], { showSeconds: false, scale: 150 }),
      reading(at[1], "CPU", "cpu.load", { display: "gauge", stroke: 60 }),
      reading(at[2], "GPU", "gpu.load", { display: "gauge", stroke: 60, accent: "#0ea5e9" }),
      reading(at[3], "Memory", "ram.load", { display: "bar" }),
      zone("NetworkThroughput", at[4], { sparkline: true, scale: 140, accent: "#6366f1" }),
    ],
    { surface: "theme", customCss: shadow },
  );

const COLOURS: Colours = { bg: "#d8d2c4", fg: "#1c1f24", card: "#ffffff", sub: "#6b6f78", line: "#e7e3db" };

export const PAPER: ScreenTemplate = {
  id: "paper",
  name: "Paper",
  blurb: "Light, white cards with soft shadows",
  port: true,
  fits: ["strip", "wide", "standard", "tall"],
  size: { width: 800, height: 480 },
  look: {
    theme: theme(COLOURS),
    radius: 0.75,
    style: { skin: "auto", surface: "theme", accent: "#2563eb", font: "inter", numGlow: "off" },
    background: { type: "color", color: "#d8d2c4" },
    gap: 12,
    padding: 12,
  },
  variants: [
    variant("ink", "Ink", ["#2563eb", "#0ea5e9", "#1c1f24"], COLOURS, {}),
    variant("coral", "Coral", ["#f2604e", "#f59e0b", "#1c1f24"], COLOURS, {}, { style: { accent: "#f2604e" }, swap: { "#0ea5e9": "#f59e0b", "#6366f1": "#e11d48" } }),
    variant("forest", "Forest", ["#15803d", "#0d9488", "#1c1f24"], COLOURS, {}, { style: { accent: "#15803d" }, swap: { "#0ea5e9": "#0d9488", "#6366f1": "#65a30d" } }),
  ],
  layouts: {
    strip: { cols: 6, rows: 1, pages: [tiles([[1, 1, 2, 1], [3, 1, 1, 1], [4, 1, 1, 1], [5, 1, 1, 1], [6, 1, 1, 1]])] },
    wide: { cols: 4, rows: 2, pages: [tiles([[1, 1, 2, 1], [3, 1, 1, 1], [4, 1, 1, 1], [1, 2, 1, 1], [2, 2, 3, 1]])] },
    standard: { cols: 3, rows: 2, pages: [tiles([[1, 1, 2, 1], [3, 1, 1, 1], [1, 2, 1, 1], [2, 2, 1, 1], [3, 2, 1, 1]])] },
    tall: { cols: 2, rows: 3, pages: [tiles([[1, 1, 2, 1], [1, 2, 1, 1], [2, 2, 1, 1], [1, 3, 1, 1], [2, 3, 1, 1]])] },
  },
};
