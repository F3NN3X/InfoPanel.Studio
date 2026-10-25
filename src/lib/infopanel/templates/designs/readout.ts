/**
 * Readout: three instrument panels (GPU, CPU, System), each with a hairline header, one huge number,
 * two smaller ones beside it, an optional label list, and two meters along the bottom that change
 * colour as they fill. The big numbers are Values with their unit set small; the list is a Rows
 * element; the meters are LED bars coloured by value. Mono is flat black; Tint washes each panel.
 */
import type { Slot } from "../../elements/palette.ts";
import type { DisplayItem } from "../../schema.ts";
import { figure, labelRows } from "../composites.ts";
import { card, clock, divider, ink, ledbar, glows, text, value, type Kit, type Template } from "../kit.ts";
import { inset, split, type Box } from "../layout.ts";
import { lineOf } from "../parts.ts";
import type { Role } from "../roles.ts";

interface Stat {
  label: string;
  role: Role;
  unit?: string;
}

interface PanelSpec {
  title: string;
  /** The panel's own colour in Tint. */
  slot: Slot;
  /** The small value at the header's right; the clock shows the date and time. */
  head: Role | "clock";
  big: Stat;
  side: readonly [Stat, Stat];
  list?: readonly Stat[];
  foot: readonly [Stat, Stat];
}

/** A tint over the panel's card: its own colour at a low alpha. */
const wash = (k: Kit, slot: Slot) => ({ color: `#2A${k.palette[slot].slice(3)}` });

function panel(k: Kit, b: Box, p: PanelSpec): DisplayItem[] {
  const s = Math.min(b.width / 600, b.height / 440);
  const px = (n: number) => Math.max(8, Math.round(n * s));
  const tint = k.variant === "tint";
  const tone: Slot = tint ? p.slot : "accent1";
  const inner = inset(b, px(16));
  const hp = px(22);
  const headH = lineOf(hp) + px(6);

  const valPx = px(32);
  const labPx = px(14);
  const barH = px(12);
  const footH = lineOf(valPx) + px(8) + barH;
  const footTop = inner.y + inner.height - footH;
  const bodyTop = inner.y + headH + px(10);
  const bodyH = footTop - bodyTop - px(8);
  const label = (t: string, x: number, y: number) => text(k, t.toUpperCase(), { x, y, px: labPx, slot: "subtext", upper: true });

  const [bigZ, sideZ, listZ] = p.list
    ? [{ x: inner.x, w: inner.width * 0.36 }, { x: inner.x + inner.width * 0.37, w: inner.width * 0.24 }, { x: inner.x + inner.width * 0.65, w: inner.width * 0.35 }]
    : [{ x: inner.x, w: inner.width * 0.52 }, { x: inner.x + inner.width * 0.54, w: inner.width * 0.46 }, undefined];

  const head: DisplayItem[] = [
    text(k, p.title.toUpperCase(), { x: inner.x, y: inner.y, px: hp, slot: tint ? p.slot : "text", weight: "strong", upper: true }),
    ...(p.head === "clock"
      ? [
          clock(k, "HH:mm", { x: inner.x, y: inner.y, px: hp, width: inner.width, align: "right", weight: "strong" }),
          clock(k, "ddd d MMM", { x: inner.x, y: inner.y + px(3), px: px(17), width: inner.width - px(78), align: "right", slot: "subtext" }, true),
        ]
      : [value(k, p.head, { x: inner.x, y: inner.y + px(3), px: px(17), width: inner.width, align: "right", slot: "subtext" })]),
    divider(k, { x: inner.x, y: inner.y + headH, width: inner.width, height: 1 }, { fill: [ink(k, tint ? p.slot : "track")] }),
  ];

  const labH = lineOf(labPx);
  const bigPx = Math.round(Math.max(px(24), Math.min((bodyH - labH) / 1.35, px(150), bigZ.w * 0.42)));
  const bigBox = { x: bigZ.x, y: bodyTop + labH + (bodyH - labH - lineOf(bigPx)) / 2 - bigPx * 0.04, width: bigZ.w, height: lineOf(bigPx) };
  const big = [label(p.big.label, bigZ.x, bodyTop), ...figure(k, p.big.role, bigBox, { px: bigPx, unit: p.big.unit ?? "°C", weight: "strong", glow: glows(k) })];

  const blockH = bodyH / 2;
  // The secondary column: labels and numbers share the zone's right edge, each block under the same pattern.
  const unitLen = Math.max(...p.side.map((st) => (st.unit ?? "°C").length));
  const sidePx = Math.round(Math.max(px(18), Math.min((blockH - labH) / 1.35, px(52), sideZ.w / (3 + 0.19 * unitLen))));
  const side = p.side.flatMap((st, i) => {
    const y = bodyTop + i * blockH;
    return [text(k, st.label.toUpperCase(), { x: sideZ.x, y, px: labPx, width: sideZ.w, align: "right", slot: "subtext", upper: true }), ...figure(k, st.role, { x: sideZ.x, y: y + labH, width: sideZ.w, height: lineOf(sidePx) }, { px: sidePx, unit: st.unit ?? "°C", weight: "strong", glow: glows(k) })];
  });

  const list = p.list && listZ
    ? [
        divider(k, { x: Math.round(listZ.x - inner.width * 0.02), y: bodyTop, width: 1, height: bodyH }, { orientation: "vertical", fill: [ink(k, "track")] }),
        labelRows(k, { x: listZ.x, y: bodyTop, width: listZ.w, height: bodyH }, p.list, { px: Math.max(px(16), Math.min(px(22), bodyH / p.list.length / 1.7)), upper: true, value: "text" }),
      ]
    : [];

  const cols = split({ x: inner.x, y: footTop, width: inner.width, height: footH }, [1, 1], px(26), true);
  const zones = [{ at: 0, ink: ink(k, tone) }, { at: 70, ink: ink(k, "warn") }, { at: 90, ink: ink(k, "crit") }];
  const foot = p.foot.flatMap((st, i) => {
    const c = cols[i];
    return [
      label(st.label, c.x, footTop + (lineOf(valPx) - labH) * 0.85),
      value(k, st.role, { x: c.x, y: footTop, px: valPx, width: c.width, align: "right", slot: "text", weight: "strong", glow: glows(k) }),
      ledbar(k, st.role, { x: c.x, y: inner.y + inner.height - barH, width: c.width, height: barH }, { segments: 0, gap: 0, radius: Math.round(barH / 2), thresholds: zones }),
    ];
  });

  const wsh = tint ? [wash(k, p.slot)] : [];
  return [card(k, `${p.title} panel`, b, { radius: px(tint ? 14 : 6), fill: [ink(k, "card"), ...wsh], angle: 0 }), ...head, ...big, ...side, ...list, ...foot];
}

const GPU: PanelSpec = {
  title: "GPU", slot: "accent1", head: "gpu.clock",
  big: { label: "Temperature", role: "gpu.temp" },
  side: [{ label: "Hot spot", role: "gpu.hotspot" }, { label: "Memory", role: "vram.temp" }],
  list: [{ label: "Load", role: "gpu.load" }, { label: "Mem clock", role: "gpu.memclock" }, { label: "Fan", role: "gpu.fan" }, { label: "VRAM", role: "vram.used" }],
  foot: [{ label: "Power", role: "gpu.power" }, { label: "VRAM", role: "vram.used" }],
};

const CPU: PanelSpec = {
  title: "CPU", slot: "accent2", head: "cpu.clock",
  big: { label: "Temperature", role: "cpu.temp" },
  side: [{ label: "CCD 1", role: "cpu.ccd1" }, { label: "CCD 2", role: "cpu.ccd2" }],
  foot: [{ label: "Package", role: "cpu.power" }, { label: "Load", role: "cpu.load" }],
};

const SYSTEM: PanelSpec = {
  title: "System", slot: "accent3", head: "clock",
  big: { label: "Memory", role: "ram.load", unit: "%" },
  side: [{ label: "Download", role: "net.down", unit: "MB/s" }, { label: "Upload", role: "net.up", unit: "MB/s" }],
  foot: [{ label: "RAM", role: "ram.used" }, { label: "Disk", role: "disk.load" }],
};

export const READOUT: Template = {
  id: "readout",
  name: "Readout",
  blurb: "Three instrument panels, one huge number each",
  background: "#FF08090C",
  color: "#FFF4F5F7",
  type: { family: "Bahnschrift", light: "Light", regular: "Regular", strong: "SemiBold" },
  palette: {
    accent1: "#FF4DA3FF", accent2: "#FF4DA3FF", accent3: "#FF4DA3FF", text: "#FFF4F5F7", subtext: "#FFA7ABB5",
    track: "#FF2A2D35", card: "#FF0D0E12", warn: "#FFFFB43C", crit: "#FFFF5B4D",
  },
  variants: [
    { id: "mono", name: "Mono", palette: {} },
    { id: "glow", name: "Glow", palette: {} },
    { id: "tint", name: "Tint", palette: { accent1: "#FFB388FF", accent2: "#FF3DD9C0", accent3: "#FF4D9DFF", card: "#FF14151B", track: "#FF343844" } },
  ],
  grids: {
    standard: { cols: 2, rows: 2, cells: [[0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 2, 1]] },
    wide: { cols: 24, rows: 1, cells: [[0, 0, 11, 1], [11, 0, 7, 1], [18, 0, 6, 1]] },
  },
  margin: 8,
  gap: 8,
  tiles: [(k, b) => panel(k, b, GPU), (k, b) => panel(k, b, CPU), (k, b) => panel(k, b, SYSTEM)],
};
