/** Readout: three instrument panels, one huge number each. The native version of the InfoPanel template. */
import type { ScreenTemplate, Zone } from "../kit";
import type { Role } from "../../infopanel/templates/roles";
import { cards, reading, theme } from "./ports";

interface Panel {
  big: readonly [string, Role];
  side: readonly (readonly [string, Role])[];
  bars: readonly (readonly [string, Role])[];
}

const GPU: Panel = { big: ["GPU", "gpu.temp"], side: [["Hot spot", "gpu.hotspot"], ["Mem clock", "gpu.memclock"], ["Fan", "gpu.fan"], ["VRAM", "vram.used"]], bars: [["Power", "gpu.power"], ["VRAM", "vram.used"]] };
const CPU: Panel = { big: ["CPU", "cpu.temp"], side: [["CCD1", "cpu.ccd1"], ["CCD2", "cpu.ccd2"], ["Clock", "cpu.clock"], ["Busiest core", "cpu.maxcore"]], bars: [["Package", "cpu.power"], ["Load", "cpu.load"]] };
const SYS: Panel = { big: ["Memory", "ram.load"], side: [["Download", "net.down"], ["Upload", "net.up"], ["Disk", "disk.load"], ["Uptime", "uptime"]], bars: [["RAM", "ram.used"], ["Disk", "disk.load"]] };

/** A panel `w` columns wide (even) and 6 rows tall at (col, row): the number, four readings beside it, two bars under. */
function panel(p: Panel, col: number, row: number, w: number): Zone[] {
  const half = w / 2;
  return [
    reading([col, row, half, 4], p.big[0], p.big[1], { display: "value", scale: 280, align: "ml" }),
    ...p.side.map(([label, role], i) => reading([col + half, row + i, half, 1], label, role, { display: "value", scale: 90, align: "ml" })),
    ...p.bars.map(([label, role], i) => reading([col + i * half, row + 4, half, 2], label, role, { display: "bar" })),
  ];
}

const tiles = (at: readonly (readonly [Panel, number, number, number])[]): Zone[] => cards(at.flatMap(([p, c, r, w]) => panel(p, c, r, w)), { surface: "solid", borderWidth: "0" });

export const READOUT: ScreenTemplate = {
  id: "readout",
  name: "Readout",
  blurb: "Three instrument panels, one huge number each",
  port: true,
  fits: ["wide", "standard"],
  look: {
    theme: theme({ bg: "#08090c", fg: "#f4f5f7", card: "#0e1015", sub: "#a7abb5", line: "#2a2d36" }),
    radius: 0.25,
    style: { skin: "instrument", surface: "solid", accent: "#4da3ff", font: "roboto-flex", labelCase: "uppercase", numGlow: "off" },
    background: { type: "color", color: "#08090c" },
    gap: 6,
    padding: 8,
  },
  layouts: {
    wide: { cols: 12, rows: 6, pages: [tiles([[GPU, 1, 1, 4], [CPU, 5, 1, 4], [SYS, 9, 1, 4]])] },
    standard: { cols: 12, rows: 12, pages: [tiles([[GPU, 1, 1, 6], [CPU, 7, 1, 6], [SYS, 1, 7, 12]])] },
  },
};
