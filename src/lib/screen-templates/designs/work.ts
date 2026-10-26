/** Work: the day (clock, calendar, weather), what the machine is doing and the coding agents' sessions. */
import { zone, type ScreenTemplate } from "../kit";

export const WORK: ScreenTemplate = {
  id: "work",
  name: "Work",
  blurb: "Calendar, clock, weather, processes and agents",
  fits: ["strip", "wide", "standard", "tall"],
  look: {
    theme: "neutral",
    radius: 0.75,
    style: { skin: "fluent", surface: "glass", accent: "#60a5fa", font: "inter" },
    background: { type: "gradient", gradient: { from: "#0f1d33", to: "#0a0d14", angle: 165 } },
    gap: 14,
    padding: 18,
  },
  layouts: {
    strip: {
      cols: 12,
      rows: 2,
      pages: [
        [
          zone("Clock", [1, 1, 2, 2]),
          zone("Weather", [3, 1, 2, 2], { view: "glance", showForecast: false, showStats: false, showFeels: false }),
          zone("CodingAgents", [5, 1, 4, 2], { view: "summary" }),
          zone("ProcessList", [9, 1, 2, 2]),
          zone("SystemStatus", [11, 1, 2, 2]),
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
          zone("Calendar", [4, 1, 3, 4]),
          zone("ProcessList", [7, 1, 3, 3]),
          zone("SystemStatus", [7, 4, 3, 1]),
          zone("CodingAgents", [10, 1, 3, 4]),
        ],
      ],
    },
    standard: {
      cols: 12,
      rows: 6,
      pages: [
        [
          zone("Clock", [1, 1, 4, 2]),
          zone("Calendar", [1, 3, 4, 4]),
          zone("Weather", [5, 1, 4, 2], { view: "now", showForecast: false }),
          zone("ProcessList", [5, 3, 4, 3]),
          zone("SystemStatus", [5, 6, 4, 1]),
          zone("CodingAgents", [9, 1, 4, 6]),
        ],
      ],
    },
    tall: {
      cols: 6,
      rows: 12,
      pages: [
        [
          zone("Clock", [1, 1, 3, 2]),
          zone("Weather", [4, 1, 3, 2], { view: "glance", showForecast: false, showStats: false, showFeels: false }),
          zone("Calendar", [1, 3, 6, 4]),
          zone("CodingAgents", [1, 7, 6, 2], { view: "summary" }),
          zone("ProcessList", [1, 9, 4, 4]),
          zone("SystemStatus", [5, 9, 2, 4]),
        ],
      ],
    },
  },
};
