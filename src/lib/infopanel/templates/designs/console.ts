/**
 * Console: a header strip of six readouts, a CPU and a GPU panel (a thick gradient ring with its
 * load on a hex face, and a column of label boxes), RAM and VRAM as long bars, and a tile per drive. The label
 * boxes are Row elements, the drives a Drives element. Ice is blue over orange; Amber is warm; Steel is neutral.
 */
import type { Slot } from "../../elements/palette.ts";
import type { DisplayItem } from "../../schema.ts";
import { drives, figure } from "../composites.ts";
import { card, clock, glows, icon, ink, ledbar, text, value, type Kit, type Template } from "../kit.ts";
import { inset, split, type Box } from "../layout.ts";
import { lineOf, ringValue } from "../parts.ts";
import type { Role } from "../roles.ts";

/** A px count scaled by `s`, never below a legible 8. */
const scaled = (s: number) => (n: number) => Math.max(8, Math.round(n * s));

const dim = { color: "#40000000" };

interface Cell {
  caption: string;
  icon: string;
  /** A sensor value with its unit set small, or a date or time format. */
  role?: Role;
  unit?: string;
  format?: string;
  date?: boolean;
}

const CELLS: readonly Cell[] = [
  { caption: "Date", icon: "calendar", format: "MMM d, yyyy", date: true },
  { caption: "Download", icon: "arrow-down", role: "net.down", unit: "MB/s" },
  { caption: "Upload", icon: "arrow-up", role: "net.up", unit: "MB/s" },
  { caption: "FPS", icon: "monitor", role: "fps", unit: "FPS" },
  { caption: "UPS power", icon: "zap", role: "ups.power", unit: "W" },
  { caption: "Time", icon: "clock", format: "hh:mm:ss tt" },
];

/** Six cells in a row, or three by two when the strip is not wide. */
function header(k: Kit, b: Box): DisplayItem[] {
  const across = b.width >= b.height * 4.2;
  const gap = Math.max(2, Math.round(4 * k.frame.u));
  const lines = across ? [split(b, [1, 1, 1, 1, 1, 1], gap, true)] : split(b, [1, 1, 1], gap, false).map((r) => split(r, [1, 1], gap, true));
  return lines.flat().flatMap((c, i) => {
    const cell = CELLS[i];
    const pad = Math.round(c.height * 0.18);
    const s = scaled(c.height / 100);
    const ic = Math.round(c.height * 0.4);
    const tx = c.x + pad + ic + pad * 0.7;
    const capPx = s(15);
    const valPx = s(34);
    const valBox = { x: tx, y: c.y + c.height - pad * 0.6 - lineOf(valPx), width: c.x + c.width - pad - tx, height: lineOf(valPx) };
    return [
      card(k, `${cell.caption} cell`, c, { radius: Math.round(c.height * 0.1), fill: [ink(k, "card")], stroke: ink(k, "track") }),
      icon(k, cell.icon, { x: c.x + pad, y: Math.round(c.y + (c.height - ic) / 2), width: ic, height: ic }, "subtext"),
      text(k, cell.caption.toUpperCase(), { x: tx, y: c.y + pad * 0.7, px: capPx, slot: "subtext", upper: true }),
      ...(cell.role
        ? figure(k, cell.role, valBox, { px: valPx, unit: cell.unit ?? "", unitSlot: "accent1", unitScale: 0.5, glow: glows(k) })
        : [clock(k, cell.format ?? "", { x: tx, y: valBox.y, px: valPx, width: valBox.width, align: "left" }, cell.date)]),
    ];
  });
}

interface PanelSpec {
  title: string;
  slot: Slot;
  /** The ring's light end, so it reads as a glowing gradient. */
  light: Slot;
  ring: Role;
  rows: readonly { label: string; role: Role; icon: string }[];
}

const CPU: PanelSpec = {
  title: "CPU", slot: "accent1", light: "accent3", ring: "cpu.load",
  rows: [
    { label: "Temperature", role: "cpu.temp", icon: "thermometer" },
    { label: "Core clock", role: "cpu.clock", icon: "activity" },
    { label: "Max core", role: "cpu.maxcore", icon: "target" },
    { label: "Power", role: "cpu.power", icon: "zap" },
  ],
};

const GPU: PanelSpec = {
  title: "GPU", slot: "accent2", light: "warn", ring: "gpu.load",
  rows: [
    { label: "Temperature", role: "gpu.temp", icon: "thermometer" },
    { label: "Hot spot", role: "gpu.hotspot", icon: "target" },
    { label: "Core clock", role: "gpu.clock", icon: "activity" },
    { label: "Fan speed", role: "gpu.fan", icon: "fan" },
    { label: "Power", role: "gpu.power", icon: "zap" },
  ],
};

function panel(k: Kit, b: Box, p: PanelSpec): DisplayItem[] {
  const px = scaled(Math.min(b.width / 950, b.height / 350));
  const pad = px(16);
  const inner = inset(b, pad);
  const titlePx = px(26);
  const head = lineOf(titlePx);
  const body = { x: inner.x, y: inner.y + head, width: inner.width, height: inner.height - head };
  const beside = b.width > b.height * 1.5;
  const size = Math.round(beside ? Math.min(body.height, body.width * 0.42) : Math.min(body.width * 0.6, body.height * 0.46));
  const sq = { x: Math.round(beside ? body.x : body.x + (body.width - size) / 2), y: Math.round(beside ? body.y + (body.height - size) / 2 : body.y), width: size, height: size };
  const list = beside
    ? { x: sq.x + size + pad, y: body.y, width: body.width - size - pad, height: body.height }
    : { x: body.x, y: sq.y + size + pad / 2, width: body.width, height: body.height - size - pad / 2 };
  const gap = px(8);
  const n = p.rows.length;
  const rowH = (list.height - gap * (n - 1)) / n;
  // One size for both panels' boxes whatever their row count: sized for the longest list, labels small beside the values.
  const valPx = Math.max(10, Math.round(Math.min(px(26), list.width * 0.06, ((list.height - gap * 4) / 5) * 0.5)));
  const labPx = Math.max(Math.round((12 * k.frame.u) / 2.25), Math.round(valPx * 0.6));
  const usagePx = Math.max(8, Math.round(size * 0.075));
  return [
    card(k, `${p.title} panel`, b, { radius: px(10), fill: [ink(k, "card")], stroke: ink(k, p.slot) }),
    text(k, p.title, { x: inner.x, y: inner.y, px: titlePx, weight: "strong" }),
    ...ringValue(k, p.ring, sq, { ring: { start: 0, sweep: 360, thickness: Math.round(size * 0.1), rounded: true, dot: false, glow: px(4), fill: [ink(k, p.light), ink(k, p.slot)], face: { pattern: "hex", color: "#FFFFFF", opacity: 0.08, size: Math.max(6, Math.round(size * 0.075)), fill: "#06090D" } }, scale: 0.2 }),
    text(k, "USAGE", { x: sq.x, y: sq.y + size * 0.27, px: usagePx, width: size, align: "center", slot: "subtext", upper: true }),
    ...p.rows.flatMap((r, i) => {
      const box = { x: list.x, y: list.y + i * (rowH + gap), width: list.width, height: rowH };
      return [
        card(k, `${r.label} box`, box, { radius: px(7), fill: [dim], stroke: ink(k, "track") }),
        icon(k, r.icon, { x: box.x + gap, y: Math.round(box.y + (rowH - valPx * 1.3) / 2), width: Math.round(valPx * 1.3), height: Math.round(valPx * 1.3) }, p.slot),
        text(k, r.label.toUpperCase(), { x: box.x + gap * 2 + valPx * 1.3, y: box.y + (rowH - lineOf(labPx)) / 2, px: labPx, slot: "subtext", upper: true }),
        value(k, r.role, { x: box.x, y: box.y + (rowH - lineOf(valPx)) / 2 - valPx * 0.05, px: valPx, width: box.width - gap, align: "right", slot: "text", glow: glows(k) }),
      ];
    }),
  ];
}

interface MemSpec {
  title: string;
  slot: Slot;
  light: Slot;
  used: Role;
  second: { label: string; role: Role };
  third: { label: string; role: Role };
}

/** A title, then used, a long bar, a second reading and a third, split by hairlines. */
function memory(k: Kit, b: Box, m: MemSpec): DisplayItem[] {
  const px = scaled(Math.min(b.height / 100, b.width / 1000));
  const pad = Math.round(b.height * 0.18);
  const inner = inset(b, pad);
  const long = b.width >= b.height * 5;
  const parts = split(inner, long ? [1.1, 1.6, 4.2, 1.6, 2] : [1.1, 1.8, 3, 1.8], px(10), true);
  const [title, used, barBox, second, third] = parts;
  const capPx = px(14);
  const valPx = px(30);
  const block = (c: Box, caption: string, role: Role): DisplayItem[] => [
    text(k, caption.toUpperCase(), { x: c.x, y: c.y + c.height / 2 - lineOf(capPx) - valPx * 0.1, px: capPx, slot: "subtext", upper: true }),
    value(k, role, { x: c.x, y: c.y + c.height / 2 - valPx * 0.1, px: valPx, weight: "regular", glow: glows(k) }),
  ];
  const barH = Math.max(4, Math.round(b.height * 0.2));
  return [
    card(k, `${m.title} panel`, b, { radius: px(10), fill: [ink(k, "card")], stroke: ink(k, "track") }),
    text(k, m.title, { x: title.x, y: title.y + (title.height - lineOf(px(28))) / 2, px: px(28), weight: "strong" }),
    ...block(used, "Used", m.used),
    ledbar(k, m.used, { x: barBox.x, y: Math.round(barBox.y + (barBox.height - barH) / 2), width: barBox.width, height: barH }, { segments: 0, gap: 0, radius: 2, fill: [ink(k, m.light), ink(k, m.slot)] }),
    ...block(second, m.second.label, m.second.role),
    ...(long ? block(third, m.third.label, m.third.role) : []),
  ];
}

const RAM: MemSpec = { title: "RAM", slot: "accent1", light: "accent3", used: "ram.used", second: { label: "Free", role: "ram.free" }, third: { label: "Memory speed", role: "ram.speed" } };
const VRAM: MemSpec = { title: "VRAM", slot: "accent2", light: "warn", used: "vram.used", second: { label: "Total", role: "vram.total" }, third: { label: "Memory clock", role: "gpu.memclock" } };

export const CONSOLE: Template = {
  id: "console",
  name: "Console",
  blurb: "A header strip, CPU and GPU rings, memory bars and drives",
  background: "#FF07090D",
  color: "#FFF2F6FA",
  type: { family: "Segoe UI", light: "Light", regular: "Regular", strong: "Semibold" },
  palette: {
    accent1: "#FF3FA0FF", accent2: "#FFFF9A3C", accent3: "#FF9BE3FF", text: "#FFF2F6FA", subtext: "#FF9AA7B4",
    track: "#FF262E39", card: "#FF0E1218", warn: "#FFFFD98A", crit: "#FFFF5A5A",
  },
  variants: [
    { id: "ice", name: "Ice", palette: {} },
    { id: "glow", name: "Ice glow", palette: {} },
    { id: "amber", name: "Amber", palette: { accent1: "#FFFFB02E", accent2: "#FFFF6A3D", accent3: "#FFFFE0A0", warn: "#FFFFC27A", card: "#FF130F0A", track: "#FF352B20", subtext: "#FFB5A592" } },
    { id: "steel", name: "Steel", palette: { accent1: "#FFC4CCD6", accent2: "#FF8E99A8", accent3: "#FFF0F3F7", warn: "#FFD9DEE5", card: "#FF101114", track: "#FF2C2F36" } },
  ],
  grids: {
    standard: { cols: 2, rows: 14, cells: [[0, 0, 2, 2], [0, 2, 1, 7], [1, 2, 1, 7], [0, 9, 1, 2], [1, 9, 1, 2], [0, 11, 2, 3]] },
    wide: { cols: 2, rows: 14, cells: [[0, 0, 2, 2], [0, 2, 1, 7], [1, 2, 1, 7], [0, 9, 1, 2], [1, 9, 1, 2], [0, 11, 2, 3]] },
    tall: { cols: 1, rows: 24, cells: [[0, 0, 1, 3], [0, 3, 1, 6], [0, 9, 1, 6], [0, 15, 1, 2], [0, 17, 1, 2], [0, 19, 1, 5]] },
  },
  margin: 6,
  gap: 6,
  tiles: [
    (k, b) => header(k, b),
    (k, b) => panel(k, b, CPU),
    (k, b) => panel(k, b, GPU),
    (k, b) => memory(k, b, RAM),
    (k, b) => memory(k, b, VRAM),
    (k, b) => [drives(k, b, { gap: Math.max(2, Math.round(6 * k.frame.u)), radius: Math.round(8 * k.frame.u) })],
  ],
};
