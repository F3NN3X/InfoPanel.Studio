/** Mono: black, huge numerals, tiny capital labels and hairline dividers. The native version of the InfoPanel template. */
import type { ScreenTemplate, Zone } from "../kit";
import type { Role } from "../../infopanel/templates/roles";
import { cards, reading, theme } from "./ports";

type Figure = readonly [label: string, role: Role, under: readonly [string, Role, string, Role]];

const FIGURES: readonly Figure[] = [
  ["CPU", "cpu.load", ["Temp", "cpu.temp", "Clock", "cpu.clock"]],
  ["GPU", "gpu.load", ["Temp", "gpu.temp", "Power", "gpu.power"]],
  ["Memory", "ram.load", ["Used", "ram.used", "Up", "uptime"]],
  ["Disk", "disk.load", ["Down", "net.down", "Up", "net.up"]],
];

const hair = "@scope { :scope { border-top: 1px solid #2e2e2e; } }";

/** One figure at (col, row) of a grid whose tiles are 2 columns wide and 4 rows tall: the number over two small readings. */
const figure = ([label, role, [l1, r1, l2, r2]]: Figure, col: number, row: number): Zone[] => [
  reading([col, row, 2, 3], label, role, { display: "value", scale: 260, align: "ml" }),
  reading([col, row + 3, 1, 1], l1, r1, { display: "value", scale: 170, align: "ml" }),
  reading([col + 1, row + 3, 1, 1], l2, r2, { display: "value", scale: 170, align: "ml" }),
];

/** The four figures at a class's tile positions. */
const tiles = (at: readonly (readonly [number, number])[]): Zone[] =>
  cards(
    FIGURES.flatMap((f, i) => figure(f, at[i][0], at[i][1])),
    { surface: "flat", customCss: hair },
  );

export const MONO: ScreenTemplate = {
  id: "mono",
  name: "Mono",
  blurb: "Black, huge thin numerals, hairlines",
  port: true,
  fits: ["strip", "wide", "standard"],
  look: {
    theme: theme({ bg: "#000000", fg: "#ffffff", card: "#0a0a0a", sub: "#7c7c7c", line: "#2e2e2e" }),
    radius: 0,
    style: { skin: "default", surface: "flat", accent: "#ffffff", font: "outfit", fontWeight: "400", labelCase: "uppercase", numGlow: "off" },
    background: { type: "color", color: "#000000" },
    gap: 22,
    padding: 18,
  },
  layouts: {
    strip: { cols: 8, rows: 4, pages: [tiles([[1, 1], [3, 1], [5, 1], [7, 1]])] },
    wide: { cols: 8, rows: 4, pages: [tiles([[1, 1], [3, 1], [5, 1], [7, 1]])] },
    standard: { cols: 4, rows: 8, pages: [tiles([[1, 1], [3, 1], [1, 5], [3, 5]])] },
  },
};
