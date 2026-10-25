/**
 * Frost Bar: frosted glass cards over a soft wash. A big card holds a double ring (CPU load outside,
 * GPU load inside), two large percentages and two bars; beside it a memory card, a clock card, two
 * small cards (uptime, network) and three square temperature rings. The glass is a translucent
 * Card with a hairline, a shadow and a real blur of the wash behind it (baked into an export); the wash is a baked gradient and glows.
 */
import type { Slot } from "../../elements/palette.ts";
import type { DisplayItem } from "../../schema.ts";
import { doubleRing, labelRows } from "../composites.ts";
import { bar, card, clock, glow, icon, ink, text, value, type Kit, type Template } from "../kit.ts";
import { inset, square, type Box } from "../layout.ts";
import { lineOf, ringValue } from "../parts.ts";

const scaled = (s: number) => (n: number) => Math.max(8, Math.round(n * s));

/** A pane of frosted glass. */
const glass = (k: Kit, name: string, b: Box): DisplayItem =>
  card(k, name, b, {
    radius: Math.round(Math.min(b.width, b.height) * 0.14),
    fill: [ink(k, "card"), { color: "#0AFFFFFF" }],
    angle: 0,
    stroke: ink(k, "track"),
    shadow: { blur: Math.round(22 * k.frame.u), dx: 0, dy: Math.round(8 * k.frame.u), color: { color: "#59000000" } },
    blur: Math.max(6, Math.round(14 * k.frame.u)),
  });

/** The big card: the double ring, CPU and GPU load, and two bars. */
function loadCard(k: Kit, b: Box): DisplayItem[] {
  const px = scaled(Math.min(b.width / 600, b.height / 430));
  const inner = inset(b, px(26));
  const titlePx = px(26);
  const top = inner.y + lineOf(titlePx) + px(8);
  const barsH = px(92);
  const ringArea = { x: inner.x, y: top, width: inner.width, height: inner.y + inner.height - barsH - px(10) - top };
  const size = Math.min(ringArea.height, inner.width * 0.4);
  const sq = square({ x: ringArea.x, y: ringArea.y + (ringArea.height - size) / 2, width: size, height: size });
  const bx = sq.x + sq.width + px(30);
  const blockH = ringArea.height / 2;
  const block = (i: number, label: string, role: "cpu.load" | "gpu.load", dot: Slot): DisplayItem[] => {
    const y = ringArea.y + i * blockH;
    const bigPx = Math.min(px(66), blockH * 0.5);
    return [
      text(k, "●", { x: bx, y: y + blockH * 0.12, px: px(13), slot: dot }),
      text(k, label, { x: bx + px(20), y: y + blockH * 0.1, px: px(18), slot: "subtext", weight: "strong" }),
      value(k, role, { x: bx, y: y + blockH * 0.12 + lineOf(px(18)), px: bigPx, slot: "text", weight: "regular" }),
    ];
  };
  return [
    glass(k, "Load card", b),
    text(k, "System load", { x: inner.x, y: inner.y, px: titlePx, weight: "strong" }),
    doubleRing(k, "cpu.load", "gpu.load", sq, { thickness: Math.max(6, Math.round(size * 0.1)), gap: Math.max(3, Math.round(size * 0.04)), outer: ["accent1"], inner: ["accent2"], centre: "cpu.temp", px: Math.round(size * 0.16) }),
    ...block(0, "CPU", "cpu.load", "accent1"),
    ...block(1, "GPU", "gpu.load", "accent2"),
    labelRows(k, { x: inner.x, y: inner.y + inner.height - barsH, width: inner.width, height: barsH }, [{ label: "Disk", role: "disk.load" }, { label: "Memory", role: "ram.load" }], { px: px(17), bar: true, fill: "accent3", value: "text" }),
  ];
}

/** A big memory percentage with its bar and the used amount. */
function memoryCard(k: Kit, b: Box): DisplayItem[] {
  const px = scaled(Math.min(b.width / 520, b.height / 200));
  const inner = inset(b, px(22));
  const barH = Math.max(4, px(11));
  return [
    glass(k, "Memory card", b),
    text(k, "Memory", { x: inner.x, y: inner.y, px: px(24), weight: "strong" }),
    text(k, "USED", { x: inner.x, y: inner.y + px(6), px: px(14), width: inner.width, align: "right", slot: "subtext" }),
    value(k, "ram.used", { x: inner.x, y: inner.y + lineOf(px(14)) + px(2), px: px(26), width: inner.width, align: "right", slot: "text" }),
    value(k, "ram.load", { x: inner.x, y: inner.y + lineOf(px(24)) - px(2), px: px(60), weight: "regular" }),
    bar(k, "ram.load", { x: inner.x, y: inner.y + inner.height - barH, width: inner.width, height: barH }, "accent3"),
  ];
}

/** The weekday, the day of the month, the month, and the time large on the right. */
function clockCard(k: Kit, b: Box): DisplayItem[] {
  const px = scaled(Math.min(b.width / 700, b.height / 200));
  const inner = inset(b, px(26));
  return [
    glass(k, "Clock card", b),
    clock(k, "dddd", { x: inner.x, y: inner.y, px: px(20), slot: "crit", weight: "strong", upper: true }),
    clock(k, "dd", { x: inner.x, y: inner.y + lineOf(px(20)) - px(6), px: px(70), weight: "strong" }),
    clock(k, "MMMM yyyy", { x: inner.x, y: inner.y + inner.height - lineOf(px(20)), px: px(20), slot: "subtext" }, true),
    clock(k, "HH:mm", { x: inner.x, y: inner.y + (inner.height - lineOf(px(150))) / 2 - px(12), px: px(150), width: inner.width, align: "right", weight: "light" }),
  ];
}

/** Uptime: a title and the time up, large. */
function uptimeCard(k: Kit, b: Box): DisplayItem[] {
  const px = scaled(Math.min(b.width / 245, b.height / 200));
  const inner = inset(b, px(18));
  const big = Math.round(Math.min(px(34), inner.width * 0.15));
  return [
    glass(k, "Uptime card", b),
    text(k, "Uptime", { x: inner.x, y: inner.y, px: px(18), slot: "accent2", weight: "strong" }),
    text(k, "Since boot", { x: inner.x, y: inner.y + lineOf(px(18)), px: px(14), slot: "subtext" }),
    value(k, "uptime", { x: inner.x, y: inner.y + inner.height - lineOf(big), px: big, weight: "regular" }),
  ];
}

/** Network: the download and upload rates, each a row with an arrow. */
function networkCard(k: Kit, b: Box): DisplayItem[] {
  const px = scaled(Math.min(b.width / 245, b.height / 200));
  const inner = inset(b, px(18));
  const top = inner.y + lineOf(px(18)) + px(8);
  const rowH = Math.min(px(34), (inner.y + inner.height - top) / 2);
  const rowsTop = top + (inner.y + inner.height - top - 2 * rowH) / 2;
  return [
    glass(k, "Network card", b),
    text(k, "Network", { x: inner.x, y: inner.y, px: px(18), slot: "accent1", weight: "strong" }),
    ...(["net.down", "net.up"] as const).flatMap((role, i) => {
      const y = rowsTop + i * rowH;
      const s = Math.round(rowH * 0.7);
      // The arrow says which way; the value takes the rest of the row, wide enough for "10429.3MB/s".
      const vx = inner.x + s + px(8);
      const vPx = Math.max(8, Math.min(px(17), Math.round((inner.x + inner.width - vx) / (12 * 0.55))));
      return [
        icon(k, i === 0 ? "arrow-down" : "arrow-up", { x: inner.x, y: Math.round(y + (rowH - s) / 2), width: s, height: s }, i === 0 ? "accent1" : "accent3"),
        value(k, role, { x: vx, y: y + (rowH - lineOf(vPx)) / 2, px: vPx, width: inner.x + inner.width - vx, align: "right", slot: "text" }),
      ];
    }),
  ];
}

/** A square temperature or load ring with its title. */
function ringCard(k: Kit, b: Box, title: string, role: "cpu.temp" | "gpu.temp" | "ram.load", slot: Slot): DisplayItem[] {
  const px = scaled(Math.min(b.width / 215, b.height / 200));
  const inner = inset(b, px(14));
  const head = lineOf(px(17));
  const sq = square({ x: inner.x, y: inner.y + head, width: inner.width, height: inner.height - head }, 0.92);
  return [
    glass(k, `${title} card`, b),
    text(k, title, { x: inner.x, y: inner.y, px: px(16), slot: "text", weight: "strong" }),
    ...ringValue(k, role, sq, { ring: { start: 0, sweep: 360, thickness: Math.max(4, Math.round(sq.width * 0.09)), rounded: true, dot: false, fill: [ink(k, slot)] }, scale: 0.2, weight: "strong" }),
  ];
}

export const FROSTBAR: Template = {
  id: "frostbar",
  name: "Frost Bar",
  blurb: "Frosted glass cards over a soft wash",
  background: "#FF0A0A1E",
  color: "#FFFFFFFF",
  type: { family: "Segoe UI", light: "Light", regular: "Regular", strong: "Semibold" },
  palette: {
    accent1: "#FF5B9BFF", accent2: "#FF4DD0FF", accent3: "#FFB07CFF", text: "#FFFFFFFF", subtext: "#FFD2C9EA",
    track: "#40FFFFFF", card: "#2AFFFFFF", warn: "#FFFFA24D", crit: "#FFFF6B7A",
  },
  variants: [
    { id: "aurora", name: "Aurora", palette: {} },
    {
      id: "smoke", name: "Smoke",
      palette: {
        accent1: "#FF5E8FCF", accent2: "#FF52A8C9", accent3: "#FF9B7BC4", subtext: "#FFA3A3A8", text: "#FFEDEDEE",
        card: "#1EFFFFFF", track: "#2EFFFFFF", crit: "#FFD94A4A", warn: "#FFB0A090",
      },
    },
  ],
  grids: {
    standard: {
      cols: 12, rows: 4,
      cells: [[0, 0, 6, 2], [6, 0, 6, 1], [0, 2, 3, 2], [3, 2, 3, 2], [6, 1, 6, 1], [6, 2, 2, 2], [8, 2, 2, 2], [10, 2, 2, 2]],
    },
    wide: {
      cols: 48, rows: 2,
      cells: [[0, 0, 16, 2], [16, 0, 14, 1], [16, 1, 7, 1], [23, 1, 7, 1], [30, 0, 18, 1], [30, 1, 6, 1], [36, 1, 6, 1], [42, 1, 6, 1]],
    },
  },
  margin: 18,
  gap: 14,
  backdrop: (k) => {
    const { width: w, height: h } = k.frame;
    const wash = k.variant === "smoke" ? [{ color: "#FF69696C" }, { color: "#FF08080A" }] : [{ color: "#FF1A0F3A" }, { color: "#FF080B24" }];
    const s = Math.round(Math.max(w, h) * 0.6);
    return [
      card(k, "Wash", { x: 0, y: 0, width: w, height: h }, { radius: 0, fill: wash, angle: 0 }),
      ...(k.variant === "smoke"
        ? []
        : [
            glow(k, "Glow", { x: w * 0.3 - s / 2, y: -s * 0.55, width: s, height: s }, "warn", 0.34),
            glow(k, "Glow", { x: w * 0.9 - s / 2, y: -s * 0.4, width: s, height: s }, "accent1", 0.4),
            glow(k, "Glow", { x: w * 0.55 - s / 2, y: h - s * 0.35, width: s, height: s }, "accent3", 0.36),
            glow(k, "Glow", { x: -s * 0.25, y: h - s * 0.7, width: s, height: s }, "crit", 0.16),
          ]),
    ];
  },
  tiles: [
    (k, b) => loadCard(k, b),
    (k, b) => memoryCard(k, b),
    (k, b) => uptimeCard(k, b),
    (k, b) => networkCard(k, b),
    (k, b) => clockCard(k, b),
    (k, b) => ringCard(k, b, "CPU", "cpu.temp", "accent1"),
    (k, b) => ringCard(k, b, "GPU", "gpu.temp", "accent2"),
    (k, b) => ringCard(k, b, "RAM", "ram.load", "accent3"),
  ],
};
