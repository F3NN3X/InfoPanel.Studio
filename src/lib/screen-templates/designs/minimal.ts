/** Minimal: a big clock with the date and three readings found by role, flat on black. */
import { zone, type ScreenTemplate, type Zone } from "../kit";

const clock = { showSeconds: false, showDate: true, scale: 200, align: "mc" };

/** The three readings: CPU and GPU temperature and RAM load. */
const readings = (at: readonly Zone["at"][]): Zone[] => [
  zone("SensorValue", at[0], { label: "CPU", align: "mc", scale: 150 }, { sensor: "cpu.temp" }),
  zone("SensorValue", at[1], { label: "GPU", align: "mc", scale: 150 }, { sensor: "gpu.temp" }),
  zone("SensorValue", at[2], { label: "RAM", align: "mc", scale: 150 }, { sensor: "ram.load" }),
];

export const MINIMAL: ScreenTemplate = {
  id: "minimal",
  name: "Minimal",
  blurb: "A big clock and three key readings",
  fits: ["strip", "wide", "standard", "tall"],
  look: {
    theme: "zinc",
    radius: 0.5,
    style: { surface: "flat", font: "outfit", fontWeight: "500", accent: "#fafafa", labelCase: "uppercase" },
    background: { type: "color", color: "#000000" },
    gap: 16,
    padding: 24,
  },
  layouts: {
    strip: {
      cols: 12,
      rows: 1,
      pages: [[zone("Clock", [1, 1, 6, 1], clock), ...readings([[7, 1, 2, 1], [9, 1, 2, 1], [11, 1, 2, 1]])]],
    },
    wide: {
      cols: 12,
      rows: 3,
      pages: [[zone("Clock", [1, 1, 8, 3], clock), ...readings([[9, 1, 4, 1], [9, 2, 4, 1], [9, 3, 4, 1]])]],
    },
    standard: {
      cols: 12,
      rows: 6,
      pages: [[zone("Clock", [1, 1, 12, 4], clock), ...readings([[1, 5, 4, 2], [5, 5, 4, 2], [9, 5, 4, 2]])]],
    },
    tall: {
      cols: 6,
      rows: 12,
      pages: [[zone("Clock", [1, 1, 6, 6], clock), ...readings([[1, 7, 6, 2], [1, 9, 6, 2], [1, 11, 6, 2]])]],
    },
  },
};
