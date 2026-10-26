/** Meters: a wide pill of double rings with thin-bar rows, and FPS. The native version of the InfoPanel template. */
import { zone, type At, type ScreenTemplate, type Zone } from "../kit";
import { cards, type Colours, darkFamily, theme } from "./ports";

const bar = (at: At, slots: { left: string; center: string; right: string }): Zone => zone("StatusBar", at, { view: "meters", ...slots, separators: false });
const all = { left: "cpuDual", center: "gpuDual", right: "fps,frameTime" };

/** One bar across a strip. */
const strip = { cols: 12, rows: 1, pages: [cards([bar([1, 1, 12, 1], all)], { surface: "theme" })] };

/** Taller screens stack one pill each for the CPU, the GPU and the frame rate, so each fills a third of the height. */
const stack = {
  cols: 12,
  rows: 6,
  pages: [
    cards(
      [
        bar([1, 1, 12, 2], { left: "cpuDual", center: "", right: "" }),
        bar([1, 3, 12, 2], { left: "gpuDual", center: "", right: "" }),
        bar([1, 5, 12, 2], { left: "fps,frameTime", center: "", right: "" }),
      ],
      { surface: "theme" },
    ),
  ],
};

const COLOURS: Colours = { bg: "#2a3a66", fg: "#ffffff", card: "#11151f", sub: "#8a93a8", line: "#2a3040" };

export const METERS: ScreenTemplate = {
  id: "meters",
  name: "Meters",
  blurb: "A wide pill: double rings, rows with thin bars, FPS",
  port: true,
  fits: ["strip", "wide", "standard"],
  size: { width: 1600, height: 300 },
  look: {
    theme: theme(COLOURS),
    radius: 1,
    style: { skin: "default", surface: "theme", accent: "#0a84ff", font: "sans" },
    background: { type: "color", color: "#2a3a66" },
    gap: 0,
    padding: 8,
  },
  variants: darkFamily(COLOURS, "white", "smoke", "float"),
  layouts: {
    strip,
    // A wide screen's one pill would be a thin band: the stack fills it.
    wide: stack,
    standard: stack,
  },
};
