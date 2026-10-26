/** Terminal: monospace green on black, two console panes of labelled meters and values under a prompt. The native version of the InfoPanel template. */
import { zone, type ScreenTemplate, type Zone } from "../kit";
import type { Role } from "../../infopanel/templates/roles";
import { cards, reading, theme, variant, type Colours } from "./ports";

type Line = readonly [label: string, role: Role];

const CPU_GPU: readonly Line[] = [["cpu", "cpu.load"], ["temp", "cpu.temp"], ["clock", "cpu.clock"], ["gpu", "gpu.load"], ["temp", "gpu.temp"], ["power", "gpu.power"]];
const MEM_NET: readonly Line[] = [["ram", "ram.load"], ["disk", "disk.load"], ["rx", "net.down"], ["tx", "net.up"], ["cpu W", "cpu.power"], ["up", "uptime"]];

const SUB = "#1f9d52";
const EDGE = "#0d2b17";

/** The pane's outline, drawn by its zones: the rows touch, so their left and right edges join up. */
const edge = (top: boolean, bottom: boolean) => `:scope { border: 1px solid ${EDGE}; border-top-width: ${top ? 1 : 0}px; border-bottom-width: ${bottom ? 1 : 0}px; }`;

/** A pane from `col` for 24 columns of the 49 (one between the panes): its prompt line (with the clock when it has one), then a line per reading. */
const pane = (col: number, prompt: string, lines: readonly Line[], clock: boolean): Zone[] => [
  zone("SensorValue", [col, 1, 16, 1], { display: "line", label: prompt, accent: SUB, showTitle: false, customCss: edge(true, false) }),
  clock
    ? zone("Clock", [col + 16, 1, 8, 1], { face: "line", showSeconds: true, customCss: edge(true, false) })
    : zone("SensorValue", [col + 16, 1, 8, 1], { display: "line", label: "", showTitle: false, customCss: edge(true, false) }),
  ...lines.map(([label, role], i) => reading([col, i + 2, 24, 1], label, role, { display: "line", showTitle: false, customCss: edge(false, i === lines.length - 1) })),
];

const layout = { cols: 49, rows: 7, pages: [cards([...pane(1, "$ sensors --cpu --gpu", CPU_GPU, false), ...pane(26, "$ free && ifstat", MEM_NET, true)], { surface: "flat" })] };

const COLOURS: Colours = { bg: "#010402", fg: "#b8ffd3", card: "#030a06", sub: SUB, line: EDGE };

export const TERMINAL: ScreenTemplate = {
  id: "terminal",
  name: "Terminal",
  blurb: "Monospace, green on black, a console",
  port: true,
  fits: ["strip", "wide", "standard"],
  look: {
    theme: theme(COLOURS),
    radius: 0,
    style: { skin: "default", surface: "flat", accent: "#39ff88", font: "jetbrains-mono", numGlow: "off", labelCase: "none" },
    background: { type: "color", color: "#010402" },
    gap: 0,
    padding: 8,
  },
  variants: [
    variant("green", "Green", ["#39ff88", "#9dffc4", "#b8ffd3"], COLOURS, {}),
    variant("amber", "Amber", ["#ffb000", "#ffd27a", "#ffe2a8"], COLOURS, { fg: "#ffe2a8", card: "#0a0700", sub: "#9c6c00", line: "#2e2100" }, { style: { accent: "#ffb000" }, swap: { [SUB]: "#9c6c00", [EDGE]: "#2e2100" } }),
    variant("cyan", "Cyan", ["#4dd8ff", "#a8ecff", "#c9f3ff"], COLOURS, { fg: "#c9f3ff", card: "#02080b", sub: "#2a86a3", line: "#0b2530" }, { style: { accent: "#4dd8ff" }, swap: { [SUB]: "#2a86a3", [EDGE]: "#0b2530" } }),
  ],
  layouts: { strip: layout, wide: layout, standard: layout },
};
