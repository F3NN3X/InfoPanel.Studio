/** Terminal: monospace green on black, two console panes of labelled meters and values. The native version of the InfoPanel template. */
import type { ScreenTemplate, Zone } from "../kit";
import type { Role } from "../../infopanel/templates/roles";
import { cards, reading, theme } from "./ports";

type Line = readonly [label: string, role: Role, bar: boolean];

const CPU_GPU: readonly Line[] = [["cpu", "cpu.load", true], ["temp", "cpu.temp", true], ["clock", "cpu.clock", false], ["gpu", "gpu.load", true], ["temp", "gpu.temp", true], ["power", "gpu.power", false]];
const MEM_NET: readonly Line[] = [["ram", "ram.load", true], ["disk", "disk.load", true], ["rx", "net.down", false], ["tx", "net.up", false], ["cpu W", "cpu.power", false], ["up", "uptime", false]];

/** A pane: one line a row, in column `col`. */
const pane = (lines: readonly Line[], col: number): Zone[] => lines.map(([label, role, bar], i) => reading([col, i + 1, 1, 1], label, role, { display: bar ? "bar" : "value", meter: "blocks", align: "ml" }));

const layout = { cols: 2, rows: 6, pages: [cards([...pane(CPU_GPU, 1), ...pane(MEM_NET, 2)], { surface: "terminal", scale: 150 })] };

export const TERMINAL: ScreenTemplate = {
  id: "terminal",
  name: "Terminal",
  blurb: "Monospace, green on black, a console",
  port: true,
  fits: ["strip", "wide", "standard"],
  look: {
    theme: theme({ bg: "#010402", fg: "#b8ffd3", card: "#030a06", sub: "#1f9d52", line: "#0d2b17" }),
    radius: 0.25,
    style: { skin: "tui", surface: "terminal", accent: "#39ff88", font: "jetbrains-mono", numGlow: "soft", labelCase: "none" },
    background: { type: "color", color: "#010402" },
    gap: 2,
    padding: 8,
  },
  layouts: { strip: layout, wide: layout, standard: layout },
};
