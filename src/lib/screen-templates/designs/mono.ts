/** Mono: black, huge numerals, tiny capital labels and hairline dividers. The native version of the InfoPanel template. */
import type { ScreenTemplate, Zone } from "../kit";
import type { Role } from "../../infopanel/templates/roles";
import { cards, type Colours, reading, theme, variant } from "./ports";

type Figure = readonly [label: string, role: Role, under: readonly [string, Role, string, Role]];

const FIGURES: readonly Figure[] = [
  ["CPU", "cpu.load", ["Temp", "cpu.temp", "Clock", "cpu.clock"]],
  ["GPU", "gpu.load", ["Temp", "gpu.temp", "Power", "gpu.power"]],
  ["Memory", "ram.load", ["Used", "ram.used", "Up", "uptime"]],
  ["Disk", "disk.load", ["Down", "net.down", "Up", "net.up"]],
];

const SUB = "#7c7c7c";
const hair = ":scope { border-top: 1px solid #2e2e2e; }";

/**
 * One figure at (col, row) of a grid whose tiles are 2 columns wide and 4 rows tall: a hairline, the number as large as
 * the tile allows, then a labelled reading and a quiet one on a line under it.
 */
const figure = ([label, role, [l1, r1, l2, r2]]: Figure, col: number, row: number): Zone[] => [
  reading([col, row, 2, 3], label, role, { display: "figure", customCss: hair }),
  reading([col, row + 3, 1, 1], l1, r1, { display: "line", lineValue: "next", accent: SUB }),
  reading([col + 1, row + 3, 1, 1], l2, r2, { display: "line", lineValue: "only" }),
];

/** The four figures at a class's tile positions. */
const tiles = (at: readonly (readonly [number, number])[]): Zone[] =>
  cards(
    FIGURES.flatMap((f, i) => figure(f, at[i][0], at[i][1])),
    { surface: "flat", showTitle: false },
  );

const COLOURS: Colours = { bg: "#000000", fg: "#ffffff", card: "#0a0a0a", sub: "#7c7c7c", line: "#2e2e2e" };

export const MONO: ScreenTemplate = {
  id: "mono",
  name: "Mono",
  blurb: "Black, huge thin numerals, hairlines",
  port: true,
  fits: ["strip", "wide", "standard"],
  size: { width: 1920, height: 480 },
  look: {
    theme: theme(COLOURS),
    radius: 0,
    style: { skin: "default", surface: "flat", accent: "#ffffff", font: "inter", labelCase: "none", numGlow: "off" },
    background: { type: "color", color: "#000000" },
    gap: 22,
    padding: 18,
  },
  variants: [
    variant("white", "White", ["#ffffff", "#bdbdbd", "#ffffff"], COLOURS, {}),
    variant("amber", "Amber", ["#ffb547", "#bdbdbd", "#ffb547"], COLOURS, { fg: "#ffb547", sub: "#8f6a30", line: "#3a2c14" }, { style: { accent: "#ffb547" }, swap: { "#2e2e2e": "#3a2c14", [SUB]: "#8f6a30" } }),
    variant("ice", "Ice", ["#d6ecff", "#bdbdbd", "#d6ecff"], COLOURS, { fg: "#d6ecff", sub: "#6f8597", line: "#1e2a36" }, { style: { accent: "#d6ecff" }, swap: { "#2e2e2e": "#1e2a36", [SUB]: "#6f8597" } }),
  ],
  layouts: {
    strip: { cols: 8, rows: 4, pages: [tiles([[1, 1], [3, 1], [5, 1], [7, 1]])] },
    wide: { cols: 8, rows: 4, pages: [tiles([[1, 1], [3, 1], [5, 1], [7, 1]])] },
    standard: { cols: 4, rows: 8, pages: [tiles([[1, 1], [3, 1], [1, 5], [3, 5]])] },
  },
};
