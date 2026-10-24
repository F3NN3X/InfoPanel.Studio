/**
 * Neon: near-black panels outlined in a saturated accent with a soft glow, LED-segment rings and
 * bars. The outlined panels, rings and LED bars bake to images.
 */
import { ink, type Kit, type Template } from "../kit.ts";
import { barsTile, gaugeTile, netTile } from "../parts.ts";

const outline = (k: Kit, slot: "accent1" | "accent2") => ({
  radius: Math.round(6 * k.frame.u), fill: [ink(k, "card")], stroke: ink(k, slot), glow: { blur: Math.round(8 * k.frame.u), color: ink(k, slot) },
});
const led = (k: Kit, a: "accent1" | "accent2", b: "accent2" | "accent3") => ({
  segments: 30, gap: 3, rounded: false, dot: false, glow: Math.max(2, Math.round(3 * k.frame.u)), fill: [ink(k, a), ink(k, b)], start: -135, sweep: 270,
});

export const NEON: Template = {
  id: "neon",
  name: "Neon",
  blurb: "Dark panels, glowing outlines, LED segments",
  background: "#FF06040B",
  color: "#FFF5F3FF",
  type: { family: "Bahnschrift", light: "Light", regular: "Regular", strong: "SemiBold" },
  palette: {
    accent1: "#FF00E5FF", accent2: "#FFFF2BD6", accent3: "#FF7C4DFF", text: "#FFF5F3FF", subtext: "#FF8E86B3",
    track: "#FF1C1633", card: "#FF0B0816", warn: "#FFFFE14D", crit: "#FFFF3B5C",
  },
  variants: [
    { id: "cyber", name: "Cyber", palette: {} },
    { id: "toxic", name: "Toxic", palette: { accent1: "#FF7CFF4D", accent2: "#FFFFE14D", accent3: "#FF00E5A0" } },
    { id: "synth", name: "Synth", palette: { accent1: "#FFFF4DA6", accent2: "#FFB34DFF", accent3: "#FFFF8A4D" } },
  ],
  grids: {
    standard: { cols: 2, rows: 2, cells: [[0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1]] },
    wide: { cols: 4, rows: 1, cells: [[0, 0, 1, 1], [1, 0, 1, 1], [2, 0, 1, 1], [3, 0, 1, 1]] },
  },
  margin: 14,
  gap: 14,
  tiles: [
    (k, b) => gaugeTile(k, b, { label: "CPU", icon: "cpu", role: "cpu.load", sub: "cpu.temp", foot: ["cpu.clock", "cpu.power"], ring: led(k, "accent1", "accent3"), card: outline(k, "accent1") }),
    (k, b) => gaugeTile(k, b, { label: "GPU", icon: "gpu", role: "gpu.load", sub: "gpu.temp", foot: ["gpu.clock", "gpu.power"], ring: led(k, "accent2", "accent3"), card: outline(k, "accent2") }),
    (k, b) =>
      barsTile(k, b, {
        label: "System", icon: "memory-stick", card: outline(k, "accent2"),
        led: { segments: 24, gap: 2, radius: 1, glow: Math.max(2, Math.round(3 * k.frame.u)), fill: [ink(k, "accent1"), ink(k, "accent2")] },
        entries: [{ label: "RAM", role: "ram.load" }, { label: "Disk", role: "disk.load" }, { label: "Uptime", role: "uptime", meter: false }],
      }),
    (k, b) => netTile(k, b, { card: outline(k, "accent1"), up: "accent2", spark: { dot: true, gradient: true, style: "area" } }),
  ],
};
