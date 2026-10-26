/** Media: what's playing, a visualiser, the volume mixer, whether you're on air and the machine's state, on an aurora glow. */
import { zone, type ScreenTemplate } from "../kit";

const viz = { mode: "bars", vizColorMode: "gradient", vizGlow: "on" };

export const MEDIA: ScreenTemplate = {
  id: "media",
  name: "Streaming",
  blurb: "Now playing, visualiser, mixer and on air",
  fits: ["strip", "wide", "standard", "tall"],
  look: {
    theme: "zinc",
    radius: 1,
    style: { surface: "aurora", accent: "#f472b6", glow: "soft", glowColor: "#f472b6" },
    background: { type: "gradient", gradient: { from: "#2a0b3d", to: "#07040d", angle: 200 } },
    gap: 16,
    padding: 18,
  },
  layouts: {
    strip: {
      cols: 12,
      rows: 2,
      pages: [
        [
          zone("NowPlaying", [1, 1, 4, 2], { playerLayout: "card" }),
          zone("Visualizer", [5, 1, 4, 2], viz),
          zone("VolumeMixer", [9, 1, 3, 2]),
          zone("OnAirBeacon", [12, 1, 1, 2]),
        ],
      ],
    },
    wide: {
      cols: 12,
      rows: 4,
      pages: [
        [
          zone("NowPlaying", [1, 1, 5, 4], { playerLayout: "backdrop" }),
          zone("Visualizer", [6, 1, 4, 3], viz),
          zone("OnAirBeacon", [6, 4, 2, 1]),
          zone("SystemStatus", [8, 4, 2, 1]),
          zone("VolumeMixer", [10, 1, 3, 4]),
        ],
      ],
    },
    standard: {
      cols: 12,
      rows: 6,
      pages: [
        [
          zone("NowPlaying", [1, 1, 6, 4], { playerLayout: "card" }),
          zone("Visualizer", [7, 1, 6, 4], viz),
          zone("VolumeMixer", [1, 5, 6, 2]),
          zone("OnAirBeacon", [7, 5, 3, 2]),
          zone("SystemStatus", [10, 5, 3, 2]),
        ],
      ],
    },
    tall: {
      cols: 6,
      rows: 12,
      pages: [
        [
          zone("NowPlaying", [1, 1, 6, 5], { playerLayout: "card" }),
          zone("Visualizer", [1, 6, 6, 3], viz),
          zone("VolumeMixer", [1, 9, 6, 3]),
          zone("OnAirBeacon", [1, 12, 3, 1]),
          zone("SystemStatus", [4, 12, 3, 1]),
        ],
      ],
    },
  },
};
