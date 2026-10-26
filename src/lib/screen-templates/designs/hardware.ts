/** Hardware: temperatures, fans, power draw, drives, the cores and the GPU, on a sci-fi HUD. */
import { zone, type ScreenTemplate } from "../kit";

const heat = { shape: "grid", ramp: "thermal" };
const thermals = { view: "gauges", showFans: false };

export const HARDWARE: ScreenTemplate = {
  id: "hardware",
  name: "Hardware",
  blurb: "Thermals, fans, power, drives and cores",
  fits: ["strip", "wide", "standard", "tall"],
  size: { width: 1024, height: 600 },
  look: {
    theme: "zinc",
    radius: 0.25,
    style: { skin: "hud", accent: "#38bdf8", numGlow: "soft" },
    background: { type: "color", color: "#05080b" },
    gap: 12,
    padding: 14,
  },
  layouts: {
    strip: {
      cols: 12,
      rows: 2,
      pages: [
        [
          zone("CoreHeatmap", [1, 1, 3, 2], heat),
          zone("GpuRings", [4, 1, 3, 2]),
          zone("Thermals", [7, 1, 2, 2]),
          zone("Fans", [9, 1, 2, 2]),
          zone("PowerDraw", [11, 1, 2, 2]),
        ],
      ],
    },
    wide: {
      cols: 12,
      rows: 4,
      pages: [
        [
          zone("CoreHeatmap", [1, 1, 4, 2], heat),
          zone("Thermals", [1, 3, 4, 2], thermals),
          zone("GpuRings", [5, 1, 4, 2]),
          zone("Fans", [5, 3, 4, 2]),
          zone("PowerDraw", [9, 1, 4, 2]),
          zone("DriveSpace", [9, 3, 4, 2], { view: "bars" }),
        ],
      ],
    },
    standard: {
      cols: 12,
      rows: 6,
      pages: [
        [
          zone("CoreHeatmap", [1, 1, 5, 3], heat),
          zone("GpuRings", [6, 1, 4, 3]),
          zone("PowerDraw", [10, 1, 3, 3]),
          zone("Thermals", [1, 4, 5, 3], thermals),
          zone("Fans", [6, 4, 4, 3]),
          zone("DriveSpace", [10, 4, 3, 3], { view: "bars" }),
        ],
      ],
    },
    tall: {
      cols: 6,
      rows: 12,
      pages: [
        [
          zone("CoreHeatmap", [1, 1, 6, 3], heat),
          zone("GpuRings", [1, 4, 6, 3]),
          zone("Thermals", [1, 7, 3, 3], thermals),
          zone("Fans", [4, 7, 3, 3]),
          zone("PowerDraw", [1, 10, 3, 3]),
          zone("DriveSpace", [4, 10, 3, 3], { view: "bars" }),
        ],
      ],
    },
  },
};
