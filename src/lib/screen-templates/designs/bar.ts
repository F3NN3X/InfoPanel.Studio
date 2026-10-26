/** Bar: one status bar across a thin strip display: the time, the machine's load and temperatures, the network. */
import { zone, type ScreenTemplate } from "../kit";

export const BAR: ScreenTemplate = {
  id: "bar",
  name: "Status bar",
  blurb: "One bar: time, load, temperatures, network",
  fits: ["strip"],
  size: { width: 1280, height: 160 },
  look: {
    theme: "zinc",
    radius: 0.75,
    style: { surface: "glass", accent: "#facc15", numGlow: "soft" },
    background: { type: "gradient", gradient: { from: "#111827", to: "#030712", angle: 90 } },
    gap: 12,
    padding: 16,
  },
  layouts: {
    strip: {
      cols: 12,
      rows: 1,
      pages: [
        [
          zone("StatusBar", [1, 1, 12, 1], {
            view: "islands",
            left: "time,date",
            center: "cpu,cpuTemp,gpu,gpuTemp,ram",
            right: "down,up,weather",
          }),
        ],
      ],
    },
  },
};
