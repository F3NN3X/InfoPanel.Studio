/** Clock: a big centred clock in rings, with a quiet column of readings each side. The native version of the InfoPanel template. */
import { zone, type ScreenTemplate, type Zone } from "../kit";
import { cards, reading, theme } from "./ports";

const quiet = { surface: "flat", display: "value", scale: 130 };

const tiles = (): Zone[] => [
  zone("RadialClockStack", [3, 1, 2, 3], { showSeconds: true, surface: "flat", surfaceOpacity: 100 }),
  ...cards(
    [
      reading([1, 1, 2, 1], "CPU temp", "cpu.temp"),
      reading([1, 2, 2, 1], "CPU power", "cpu.power"),
      reading([1, 3, 2, 1], "RAM", "ram.load"),
      reading([5, 1, 2, 1], "GPU temp", "gpu.temp"),
      reading([5, 2, 2, 1], "GPU load", "gpu.load"),
      reading([5, 3, 2, 1], "GPU power", "gpu.power"),
    ],
    quiet,
  ),
];

const layout = { cols: 6, rows: 3, pages: [tiles()] };

export const CLOCK: ScreenTemplate = {
  id: "clock",
  name: "Clock",
  blurb: "A big centred clock in rings, readings either side",
  port: true,
  fits: ["wide", "standard"],
  look: {
    theme: theme({ bg: "#07090f", fg: "#f4f6fb", card: "#0e121b", sub: "#7d8597", line: "#1a1f2b" }),
    radius: 0.5,
    style: { skin: "default", surface: "flat", accent: "#7dd3fc", font: "sans", numGlow: "off" },
    background: { type: "color", color: "#07090f" },
    gap: 10,
    padding: 14,
  },
  layouts: { wide: layout, standard: layout },
};
