/** Meters: a wide pill of double rings with thin-bar rows, and FPS. The native version of the InfoPanel template. */
import { zone, type At, type ScreenTemplate, type Zone } from "../kit";
import { cards, type Colours, darkFamily, theme } from "./ports";

const bar = (at: At, slots: { left: string; center: string; right: string }): Zone => zone("StatusBar", at, { view: "meters", ...slots, separators: false });
const all = { left: "cpuDual", center: "gpuDual", right: "fps,frameTime" };

/** A strip of the whole bar, in the middle rows of a grid so the pill keeps a long shape. */
const strip = (rows: number, from: number, span: number) => ({ cols: 12, rows, pages: [cards([bar([1, from, 12, span], all)], { surface: "theme" })] });

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
    strip: strip(7, 3, 3),
    wide: strip(10, 4, 3),
    // Taller screens stack one pill each for the CPU, the GPU and the frame rate.
    standard: {
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
    },
  },
};
