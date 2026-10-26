/** Tower: a tall card of FPS, CPU and GPU readings with a graph each. The native version of the InfoPanel template. */
import { zone, type ScreenTemplate } from "../kit";
import { cards, theme } from "./ports";

export const TOWER: ScreenTemplate = {
  id: "tower",
  name: "Tower",
  blurb: "A tall card: FPS, CPU and GPU readings with a graph each",
  port: true,
  fits: ["tall"],
  size: { width: 480, height: 1920 },
  look: {
    theme: theme({ bg: "#2a3a66", fg: "#ffffff", card: "#11151f", sub: "#8a93a8", line: "#2a3040" }),
    radius: 1,
    style: { skin: "default", surface: "theme", accent: "#0a84ff", font: "sans" },
    background: { type: "color", color: "#2a3a66" },
    gap: 6,
    padding: 8,
  },
  layouts: {
    tall: {
      cols: 2,
      rows: 7,
      pages: [
        cards(
          [
            zone("FpsMonitor", [1, 1, 2, 2], { view: "trend", accent: "#30d158" }),
            zone("CpuMonitor", [1, 3, 2, 2], { coreView: "off", accent: "#0a84ff" }),
            zone("GpuMonitor", [1, 5, 2, 3], { accent: "#bf5af2" }),
          ],
          { surface: "theme" },
        ),
      ],
    },
  },
};
