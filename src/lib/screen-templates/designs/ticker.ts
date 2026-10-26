/** Ticker: one long pill: CPU, GPU, FPS and the time. The native version of the InfoPanel template. */
import { zone, type ScreenTemplate } from "../kit";
import { cards, type Colours, darkFamily, theme } from "./ports";

const COLOURS: Colours = { bg: "#2a3a66", fg: "#ffffff", card: "#11151f", sub: "#8a93a8", line: "#2a3040" };

export const TICKER: ScreenTemplate = {
  id: "ticker",
  name: "Ticker",
  blurb: "One long pill: CPU, GPU, FPS and the time",
  port: true,
  fits: ["strip"],
  size: { width: 1280, height: 160 },
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
    // The pill takes the strip's whole height.
    strip: {
      cols: 12,
      rows: 1,
      pages: [cards([zone("StatusBar", [1, 1, 12, 1], { view: "ticker", left: "", center: "cpuLine,gpuLine,fpsLine,time", right: "", separators: true })], { surface: "theme" })],
    },
  },
};
