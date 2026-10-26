/** Deck: a second-screen dashboard of rings, graphs, FPS, the clock and the network. The native version of the InfoPanel template. */
import { zone, type ScreenTemplate, type Zone } from "../kit";
import type { Role } from "../../infopanel/templates/roles";
import { cards, type Colours, darkFamily, merged, reading, theme } from "./ports";

const BLUE = "#0a84ff";
const PURPLE = "#bf5af2";
const GREEN = "#30d158";

const T = 17;
const NO_TITLE = { showTitle: false };

/**
 * A processor card of 17 columns and `h` rows from (col, 1): its load as a ring with the label inside, the temperature,
 * clock and power beside it, and the load's history under.
 */
const processor = (col: number, label: string, load: Role, temp: Role, clock: Role, power: Role, accent: string, h: number): Zone[] => {
  const ring = h === 16 ? 10 : 12;
  const a = Math.round(ring * 0.4);
  const b = Math.floor((ring - a) / 2) + (ring - a) % 2;
  return merged([
    reading([col, 1, 8, ring], label, load, { display: "gauge", stroke: 55, accent, labelInside: true, ...NO_TITLE }),
    reading([col + 8, 1, 9, a], "Temp", temp, { display: "figure", ...NO_TITLE }),
    reading([col + 8, 1 + a, 9, b], "Clock", clock, { display: "figure", ...NO_TITLE }),
    reading([col + 8, 1 + a + b, 9, ring - a - b], "Power", power, { display: "figure", ...NO_TITLE }),
    reading([col, ring + 1, T, h - ring], "Temperature", temp, { display: "spark", accent, ...NO_TITLE }),
  ]);
};

/** The FPS card: the frame rate large, the lows and frame time beside it, the frame time's history under. */
const frames = (col: number, h: number): Zone[] => {
  const top = h === 16 ? 8 : 10;
  const s = Math.floor(top / 3);
  return merged([
    reading([col, 1, 9, top], "FPS", "fps", { display: "figure", accent: GREEN, ...NO_TITLE }),
    reading([col + 9, 1, 8, s], "1% low", "fps.low1", { display: "line", lineValue: "end", ...NO_TITLE }),
    reading([col + 9, 1 + s, 8, s], "0.1% low", "fps.low01", { display: "line", lineValue: "end", ...NO_TITLE }),
    reading([col + 9, 1 + 2 * s, 8, top - 2 * s], "Frame time", "frametime", { display: "line", lineValue: "end", ...NO_TITLE }),
    reading([col, top + 1, T, h - top], "Frame time", "frametime", { display: "spark", accent: GREEN, ...NO_TITLE }),
  ]);
};

/** The right-hand column: the clock over memory and the free disk space, an empty row between (`h` rows). */
const side = (col: number, h: number): Zone[] => {
  const clockRows = h === 16 ? 7 : 11;
  const memory = clockRows + 2;
  const room = h - memory + 1;
  return [
    ...merged([zone("Clock", [col, 1, T, clockRows - 2], { showSeconds: false, scale: 180 }), reading([col, clockRows - 1, T, 2], "Uptime", "uptime", { display: "line", lineValue: "end", ...NO_TITLE })]),
    ...merged([
      reading([col, memory, 8, room - 3], "RAM", "ram.used", { display: "figure", ...NO_TITLE }),
      reading([col + 8, memory, 9, room - 3], "VRAM", "vram.used", { display: "figure", ...NO_TITLE }),
      reading([col, memory + room - 3, T, 3], "Disk free", "disk.free", { display: "line", lineValue: "end", ...NO_TITLE }),
    ]),
  ];
};

/** The three cards and the column at the top of both layouts: 17 columns each with an empty column between. */
const head = (h: number): Zone[] => [
  ...processor(1, "CPU", "cpu.load", "cpu.temp", "cpu.clock", "cpu.power", BLUE, h),
  ...processor(19, "GPU", "gpu.load", "gpu.temp", "gpu.clock", "gpu.power", PURPLE, h),
  ...frames(37, h),
  ...side(55, h),
];

const COLOURS: Colours = { bg: "#2c3a63", fg: "#ffffff", card: "#11141d", sub: "#8c94aa", line: "#262c3b" };

export const DECK: ScreenTemplate = {
  id: "deck",
  name: "Deck",
  blurb: "A second-screen dashboard: rings, graphs, FPS, clock, network",
  port: true,
  fits: ["wide", "standard"],
  size: { width: 1920, height: 1080 },
  look: {
    theme: theme(COLOURS),
    radius: 0,
    style: { skin: "default", surface: "theme", accent: BLUE, font: "sans" },
    background: { type: "gradient", gradient: { from: "#2c4a8a", to: "#5a3a8f", angle: 135 } },
    gap: 0,
    padding: 16,
  },
  variants: darkFamily(COLOURS, "white", "smoke", "tint", "float"),
  layouts: {
    wide: {
      cols: 71,
      rows: 24,
      pages: [cards(head(24), { surface: "theme" })],
    },
    standard: {
      cols: 71,
      rows: 29,
      pages: [
        cards(
          [
            ...head(16),
            ...merged([
              reading([1, 18, 52, 4], "CPU", "cpu.load", { display: "spark", accent: BLUE, ...NO_TITLE }),
              reading([1, 22, 52, 4], "GPU", "gpu.load", { display: "spark", accent: PURPLE, ...NO_TITLE }),
              reading([1, 26, 52, 4], "FPS", "fps", { display: "spark", accent: GREEN, ...NO_TITLE }),
            ]),
            ...merged([zone("NetworkThroughput", [55, 18, 17, 12], { sparkline: true, scale: 160 })]),
          ],
          { surface: "theme" },
        ),
      ],
    },
  },
};
