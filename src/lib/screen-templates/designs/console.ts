/** Console: a header strip, CPU and GPU rings with their readings, memory bars and drives. The native version of the InfoPanel template. */
import { zone, type ScreenTemplate, type Zone } from "../kit";
import { ROLE_INFO, type Role } from "../../infopanel/templates/roles";
import { cards, reading, theme, variant, type Colours } from "./ports";

const header = { view: "edge", left: "date", center: "down,up", right: "time", separators: true };

/** A processor panel: a ring, then four readings beside it, from column `col` for 4 columns and 8 rows from row 3. */
const SUB = "#9aa7b4";

const panel = (col: number, label: string, load: Role, rows: readonly (readonly [string, Role])[], accent: string): Zone[] => [
  reading([col, 3, 2, 8], label, load, { display: "gauge", accent, stroke: 60 }),
  ...rows.map(([name, role], i) => reading([col + 2, 3 + i * 2, 2, 2], name, role, { display: "line", lineValue: "end", accent: SUB, showTitle: false })),
];

const tiles = (): Zone[] =>
  cards(
    [
      zone("StatusBar", [1, 1, 8, 2], header),
      ...panel(1, "CPU", "cpu.load", [["Temperature", "cpu.temp"], ["Core clock", "cpu.clock"], ["Max core", "cpu.maxcore"], ["Power", "cpu.power"]], "#3fa0ff"),
      ...panel(5, "GPU", "gpu.load", [["Temperature", "gpu.temp"], ["Hot spot", "gpu.hotspot"], ["Core clock", "gpu.clock"], ["Power", "gpu.power"]], "#ff9a3c"),
      reading([1, 11, 4, 2], "RAM", "ram.load", { display: "line", showTitle: false, accent: "#3fa0ff" }),
      reading([5, 11, 4, 2], "VRAM", "vram.used", { display: "line", showTitle: false, max: ROLE_INFO["vram.used"].max, accent: "#ff9a3c" }),
      zone("DriveSpace", [1, 13, 8, 6], { view: "bars", scale: 170 }),
    ],
    { surface: "theme" },
  );

const layout = { cols: 8, rows: 18, pages: [tiles()] };

const COLOURS: Colours = { bg: "#07090d", fg: "#f2f6fa", card: "#0d1118", sub: "#9aa7b4", line: "#1f2733" };

export const CONSOLE: ScreenTemplate = {
  id: "console",
  name: "Console",
  blurb: "A header strip, CPU and GPU rings, memory bars and drives",
  port: true,
  fits: ["wide", "standard"],
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
  layouts: { wide: layout, standard: layout },
};
