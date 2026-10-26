/** Orbit: a pill with a load ring at each end and FPS in the middle. The native version of the InfoPanel template. */
import { zone, type ScreenTemplate } from "../kit";
import { cards, type Colours, darkFamily, theme } from "./ports";

const bar = (at: readonly [number, number, number, number]) =>
  cards([zone("StatusBar", at, { view: "orbit", left: "cpuRing", center: "fps", right: "gpuRing", separators: false })], { surface: "theme" });

const COLOURS: Colours = { bg: "#2a3a66", fg: "#ffffff", card: "#11151f", sub: "#8a93a8", line: "#2a3040" };

export const ORBIT: ScreenTemplate = {
  id: "orbit",
  name: "Orbit",
  blurb: "A pill with a load ring at each end and FPS in the middle",
  port: true,
  fits: ["strip", "wide"],
  size: { width: 1080, height: 240 },
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
    strip: { cols: 12, rows: 1, pages: [bar([1, 1, 12, 1])] },
    // A pill as long as the strip's, in the middle of the taller screen.
    wide: { cols: 12, rows: 6, pages: [bar([1, 2, 12, 3])] },
  },
};
