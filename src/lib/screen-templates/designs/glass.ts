/** Glass: translucent cards with a hairline edge over soft colour, gradient rings. The native version of the InfoPanel template. */
import { zone, type At, type ScreenTemplate, type Zone } from "../kit";
import { cards, type Colours, reading, theme, variant } from "./ports";

/** CPU, GPU and Memory, then Network and the clock, at the boxes of a class. */
const CARD = { surface: "glass", blur: "24" };

const tiles = (at: readonly At[]): Zone[] => cards([
  reading(at[0], "CPU", "cpu.load", { display: "gauge", stroke: 60, accent: "#60a5fa" }),
  reading(at[1], "GPU", "gpu.load", { display: "gauge", stroke: 60, accent: "#a78bfa" }),
  reading(at[2], "Memory", "ram.load", { display: "gauge", stroke: 60, accent: "#22d3ee" }),
  zone("NetworkThroughput", at[3], { sparkline: true, scale: 140 }),
  zone("Clock", at[4]),
], CARD);

const COLOURS: Colours = { bg: "#0a0f1e", fg: "#f1f5ff", card: "#1a2138", sub: "#9aa6c4", line: "#2e3752" };

export const GLASS: ScreenTemplate = {
  id: "glass",
  name: "Glass",
  blurb: "Translucent cards on soft glows",
  port: true,
  fits: ["strip", "wide", "standard", "tall"],
  look: {
    theme: theme(COLOURS),
    radius: 1,
    style: { skin: "default", surface: "glass", accent: "#60a5fa", blur: "24", numGlow: "soft" },
    background: { type: "gradient", gradient: { from: "#16254f", to: "#1d1245", angle: 140 } },
    gap: 10,
    padding: 10,
  },
  variants: [
    variant("aurora", "Aurora", ["#60a5fa", "#a78bfa", "#f1f5ff"], COLOURS, {}),
    variant("sunset", "Sunset", ["#fb7185", "#fdba74", "#f1f5ff"], COLOURS, {}, { style: { accent: "#fb7185" }, swap: { "#60a5fa": "#fb7185", "#a78bfa": "#fdba74", "#22d3ee": "#f472b6" } }),
    variant("lagoon", "Lagoon", ["#34d399", "#22d3ee", "#f1f5ff"], COLOURS, {}, { style: { accent: "#34d399" }, swap: { "#60a5fa": "#34d399", "#a78bfa": "#22d3ee", "#22d3ee": "#60a5fa" } }),
  ],
  layouts: {
    strip: { cols: 6, rows: 1, pages: [tiles([[1, 1, 1, 1], [2, 1, 1, 1], [3, 1, 1, 1], [4, 1, 2, 1], [6, 1, 1, 1]])] },
    wide: { cols: 3, rows: 2, pages: [tiles([[1, 1, 1, 1], [2, 1, 1, 1], [3, 1, 1, 1], [1, 2, 2, 1], [3, 2, 1, 1]])] },
    standard: { cols: 3, rows: 2, pages: [tiles([[1, 1, 1, 1], [2, 1, 1, 1], [3, 1, 1, 1], [1, 2, 2, 1], [3, 2, 1, 1]])] },
    tall: { cols: 2, rows: 3, pages: [tiles([[1, 1, 1, 1], [2, 1, 1, 1], [1, 2, 1, 1], [2, 2, 1, 1], [1, 3, 2, 1]])] },
  },
};
