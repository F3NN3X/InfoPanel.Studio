/** General: the time and weather, the machine at a glance, the network and what's playing, on frosted glass. */
import { zone, type ScreenTemplate } from "../kit";

const overview = { view: "gauges", sections: "cpu,gpu,ram" };
const network = { sparkline: true };

export const GENERAL: ScreenTemplate = {
  id: "general",
  name: "General",
  blurb: "Time, weather, system, network and music",
  fits: ["strip", "wide", "standard", "tall"],
  size: { width: 1024, height: 600 },
  look: {
    theme: "slate",
    radius: 0.75,
    style: { surface: "glass", accent: "#7dd3fc", blur: "16", numGlow: "soft" },
    background: { type: "image", src: "/assets/bg/aurora.png", fit: "cover", dim: 25 },
    gap: 16,
    padding: 20,
  },
  layouts: {
    strip: {
      cols: 12,
      rows: 2,
      pages: [
        [
          zone("Clock", [1, 1, 2, 2]),
          zone("Weather", [3, 1, 2, 2], { view: "glance", showForecast: false, showStats: false, showFeels: false }),
          zone("SystemOverview", [5, 1, 4, 2], overview),
          zone("NetworkThroughput", [9, 1, 2, 2], network),
          zone("NowPlaying", [11, 1, 2, 2]),
        ],
      ],
    },
    wide: {
      cols: 12,
      rows: 4,
      pages: [
        [
          zone("Clock", [1, 1, 3, 2]),
          zone("Weather", [1, 3, 3, 2], { view: "now", showForecast: false }),
          zone("SystemOverview", [4, 1, 6, 4], overview),
          zone("NowPlaying", [10, 1, 3, 2]),
          zone("NetworkThroughput", [10, 3, 3, 2], network),
        ],
      ],
    },
    standard: {
      cols: 12,
      rows: 6,
      pages: [
        [
          zone("Clock", [1, 1, 4, 2]),
          zone("Weather", [5, 1, 4, 2], { view: "now", showForecast: false }),
          zone("NowPlaying", [9, 1, 4, 2]),
          zone("SystemOverview", [1, 3, 8, 4], overview),
          zone("NetworkThroughput", [9, 3, 4, 2], network),
          zone("Forecast", [9, 5, 4, 2]),
        ],
      ],
    },
    tall: {
      cols: 6,
      rows: 12,
      pages: [
        [
          zone("Clock", [1, 1, 6, 2]),
          zone("Weather", [1, 3, 6, 2], { view: "now", showForecast: false }),
          zone("SystemOverview", [1, 5, 6, 4], overview),
          zone("NetworkThroughput", [1, 9, 6, 2], network),
          zone("NowPlaying", [1, 11, 6, 2]),
        ],
      ],
    },
  },
};
