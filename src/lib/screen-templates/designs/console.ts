/** Console: a header strip, CPU and GPU rings with their readings, memory bars and drives. The native version of the InfoPanel template. */
import { zone, type ScreenTemplate, type Zone } from "../kit";
import { ROLE_INFO, type Role } from "../../infopanel/templates/roles";
import { cards, reading, theme, variant, type Colours } from "./ports";

const SUB = "#9aa7b4";

/** A processor panel of 12 columns from `col`: its load as a ring with USAGE inside, then four readings beside it, 8 rows from row 3. */
const panel = (col: number, load: Role, rows: readonly (readonly [string, Role])[], accent: string): Zone[] => [
  reading([col, 3, 6, 8], "Usage", load, { display: "gauge", accent, stroke: 60, labelInside: true }),
  ...rows.map(([name, role], i) => reading([col + 6, 3 + i * 2, 6, 2], name, role, { display: "line", lineValue: "end", accent: SUB, showTitle: false })),
];

/** The header: six tiles, each a small caption over a reading; four on a standard screen, whose cells are narrower. */
const header = (four: boolean): Zone[] => four ? [
  zone("Clock", [1, 1, 6, 2], { face: "figure", showDate: true, showSeconds: true }),
  reading([7, 1, 6, 2], "Download", "net.down", { display: "figure", showTitle: false }),
  reading([13, 1, 6, 2], "Upload", "net.up", { display: "figure", showTitle: false }),
  reading([19, 1, 6, 2], "FPS", "fps", { display: "figure", showTitle: false }),
] : [
  zone("Clock", [1, 1, 4, 2], { face: "figure", showDate: true }),
  reading([5, 1, 4, 2], "Download", "net.down", { display: "figure", showTitle: false }),
  reading([9, 1, 4, 2], "Upload", "net.up", { display: "figure", showTitle: false }),
  reading([13, 1, 4, 2], "FPS", "fps", { display: "figure", showTitle: false }),
  reading([17, 1, 4, 2], "UPS power", "ups.power", { display: "figure", showTitle: false }),
  zone("Clock", [21, 1, 4, 2], { face: "figure", showDate: false, showSeconds: true }),
];

const tiles = (four: boolean): Zone[] =>
  cards(
    [
      ...header(four),
      ...panel(1, "cpu.load", [["Temperature", "cpu.temp"], ["Core clock", "cpu.clock"], ["Max core", "cpu.maxcore"], ["Power", "cpu.power"]], "#3fa0ff"),
      ...panel(13, "gpu.load", [["Temperature", "gpu.temp"], ["Hot spot", "gpu.hotspot"], ["Core clock", "gpu.clock"], ["Power", "gpu.power"]], "#ff9a3c"),
      reading([1, 11, 12, 2], "RAM", "ram.load", { display: "line", lineValue: "stack", showTitle: false, accent: "#3fa0ff" }),
      reading([13, 11, 12, 2], "VRAM", "vram.used", { display: "line", lineValue: "stack", showTitle: false, max: ROLE_INFO["vram.used"].max, accent: "#ff9a3c" }),
      zone("DriveSpace", [1, 13, 24, 6], { view: "bars", scale: 170 }),
    ],
    { surface: "theme" },
  );

const layout = (four: boolean) => ({ cols: 24, rows: 18, pages: [tiles(four)] });

const COLOURS: Colours = { bg: "#07090d", fg: "#f2f6fa", card: "#0d1118", sub: "#9aa7b4", line: "#1f2733" };

export const CONSOLE: ScreenTemplate = {
  id: "console",
  name: "Console",
  blurb: "A header strip, CPU and GPU rings, memory bars and drives",
  port: true,
  fits: ["wide", "standard"],
  size: { width: 1024, height: 600 },
  look: {
    theme: theme(COLOURS),
    radius: 0.25,
    style: { skin: "hud", surface: "theme", accent: "#3fa0ff", font: "sans", labelCase: "uppercase" },
    background: { type: "color", color: "#07090d" },
    gap: 6,
    padding: 6,
  },
  variants: [
    variant("ice", "Ice", ["#3fa0ff", "#ff9a3c", "#9be3ff"], COLOURS, {}),
    variant("glow", "Ice glow", ["#3fa0ff", "#ff9a3c", "#9be3ff"], COLOURS, {}, { style: { numGlow: "soft" } }),
    variant("amber", "Amber", ["#ffb02e", "#ff6a3d", "#ffe0a0"], COLOURS, { card: "#130f0a", line: "#352b20", sub: "#b5a592" }, { style: { accent: "#ffb02e" }, swap: { "#3fa0ff": "#ffb02e", "#ff9a3c": "#ff6a3d" } }),
    variant("steel", "Steel", ["#c4ccd6", "#8e99a8", "#f0f3f7"], COLOURS, { card: "#101114", line: "#2c2f36" }, { style: { accent: "#c4ccd6" }, swap: { "#3fa0ff": "#c4ccd6", "#ff9a3c": "#8e99a8" } }),
  ],
  layouts: { wide: layout(false), standard: layout(true) },
};
