/** Gaming: frame rate and pacing, the game you're in and your friends; a second page for the GPU and CPU. */
import { zone, type ScreenTemplate } from "../kit";

const fps = { view: "gauge", sparkline: false };
const spotlight = { spotlightLayout: "hero" };

export const GAMING: ScreenTemplate = {
  id: "gaming",
  name: "Gaming",
  blurb: "FPS, frame pacing, the game, GPU and CPU",
  fits: ["strip", "wide", "standard", "tall"],
  look: {
    theme: "zinc",
    radius: 0.5,
    style: { skin: "cyber", accent: "#22d3ee", numGlow: "strong", glow: "soft", glowColor: "#22d3ee" },
    background: { type: "gradient", gradient: { from: "#0b1023", to: "#05060a", angle: 160 } },
    gap: 14,
    padding: 16,
  },
  pages: [
    { name: "Game", icon: "gamepad-2" },
    { name: "System", icon: "cpu" },
  ],
  // The OSD strip wants a row of about 100 px, so the grids with it have more, shorter rows.
  layouts: {
    strip: {
      cols: 12,
      rows: 2,
      pages: [
        [
          zone("FpsMonitor", [1, 1, 2, 2], fps),
          zone("FramePacing", [3, 1, 4, 2]),
          zone("GameSpotlight", [7, 1, 4, 2], spotlight),
          zone("SteamFriends", [11, 1, 2, 2]),
        ],
        [
          zone("GpuRings", [1, 1, 3, 2]),
          zone("GpuMonitor", [4, 1, 3, 2]),
          zone("CpuMonitor", [7, 1, 3, 2]),
          zone("Thermals", [10, 1, 3, 2]),
        ],
      ],
    },
    wide: {
      cols: 12,
      rows: 7,
      pages: [
        [
          zone("OsdStrip", [1, 1, 12, 1]),
          zone("FpsMonitor", [1, 2, 3, 6], fps),
          zone("FramePacing", [4, 2, 4, 6]),
          zone("GameSpotlight", [8, 2, 3, 6], spotlight),
          zone("SteamFriends", [11, 2, 2, 6]),
        ],
        [
          zone("GpuMonitor", [1, 1, 4, 7]),
          zone("CpuMonitor", [5, 1, 4, 7]),
          zone("GpuRings", [9, 1, 4, 4]),
          zone("Thermals", [9, 5, 4, 3]),
        ],
      ],
    },
    standard: {
      cols: 12,
      rows: 11,
      pages: [
        [
          zone("OsdStrip", [1, 1, 12, 1]),
          zone("FpsMonitor", [1, 2, 4, 5], fps),
          zone("FramePacing", [5, 2, 8, 5]),
          zone("GameSpotlight", [1, 7, 8, 5], spotlight),
          zone("SteamFriends", [9, 7, 4, 5]),
        ],
        [
          zone("GpuMonitor", [1, 1, 6, 6]),
          zone("CpuMonitor", [7, 1, 6, 6]),
          zone("GpuRings", [1, 7, 4, 5]),
          zone("Thermals", [5, 7, 4, 5]),
          zone("PowerDraw", [9, 7, 4, 5]),
        ],
      ],
    },
    tall: {
      cols: 6,
      rows: 18,
      pages: [
        [
          zone("OsdStrip", [1, 1, 6, 1]),
          zone("FpsMonitor", [1, 2, 6, 4], fps),
          zone("FramePacing", [1, 6, 6, 4]),
          zone("GameSpotlight", [1, 10, 6, 5], spotlight),
          zone("SteamFriends", [1, 15, 6, 4]),
        ],
        [
          zone("GpuMonitor", [1, 1, 6, 6]),
          zone("CpuMonitor", [1, 7, 6, 6]),
          zone("GpuRings", [1, 13, 3, 6]),
          zone("Thermals", [4, 13, 3, 6]),
        ],
      ],
    },
  },
};
