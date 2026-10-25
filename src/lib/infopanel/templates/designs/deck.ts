/**
 * Deck: a second-screen dashboard of tiles over a soft wallpaper. CPU and GPU each have a ring,
 * temperature, clock, power and a graph; FPS has its lows, a graph and a frame-time histogram; then
 * the clock, memory, a performance strip of three graphs, and the network's two speeds over a dual
 * graph. A wide canvas keeps the first five tiles in four columns; a tall one stacks them in two.
 */
import type { Slot } from "../../elements/palette.ts";
import type { DisplayItem } from "../../schema.ts";
import { clock, divider, glow, ink, ring, text, type Kit, type Template } from "../kit.ts";
import { inset, split, type Box } from "../layout.ts";
import { caption, coloured, DARK, dualGraph, GHZ, graph, lines, reading, shadowed, surface, variantsOf } from "../looks.ts";
import { lineOf } from "../parts.ts";
import type { Role } from "../roles.ts";

const CYAN = "#FF5AC8FA";
const YELLOW = "#FFE6B800";

/** A tile's card and its inner box; `r` is the size its type follows. */
function frame(k: Kit, name: string, b: Box, short = false) {
  const p = Math.max(6, Math.round(Math.min(b.width, b.height * 1.1) * 0.055));
  const inner = inset(b, p);
  const r = Math.min(inner.width, inner.height * (short ? 2.2 : 1.05));
  return { p, inner, r, cap: Math.max(8, Math.round(r * 0.04)), card: surface(k, `${name} card`, b, Math.min(b.width, b.height) * 0.07) };
}

const hairline = (k: Kit, x: number, y: number, width: number): DisplayItem => divider(k, { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: 1 }, { fill: [ink(k, "track")] });

/** CPU or GPU: a ring with its load, the temperature big beside it with the clock and power, a hairline, then a temperature graph. */
function device(k: Kit, b: Box, o: { label: string; accent: Slot; load: Role; temp: Role; clock: Role; power: Role; under?: readonly [string, Role][] }): DisplayItem[] {
  const { p, inner, r, cap, card } = frame(k, o.label, b);
  const s = Math.round(Math.min(inner.height * 0.36, inner.width * 0.44));
  const sq = { x: inner.x, y: inner.y, width: s, height: s };
  const vpx = Math.round(s * 0.22);
  const lpx = Math.max(8, Math.round(s * 0.12));
  const mid = (lineOf(vpx) * 0.9 + lineOf(lpx)) / 2;
  const textX = sq.x + s + Math.round(p * 1.2);
  const textW = inner.x + inner.width - textX;
  const big = Math.max(10, Math.floor(Math.min(s * 0.34, textW / 3.3)));
  const small = Math.max(8, Math.round(big * 0.5));
  const block = lineOf(big) * 0.95 + lineOf(small) * 1.9;
  const ty = Math.round(sq.y + (s - block) / 2);
  const ruleY = sq.y + s + Math.round(p * 1.1);
  const capY = ruleY + Math.round(p * 0.7);
  const rowPx = Math.max(8, Math.round(r * 0.046));
  const below = (o.under?.length ?? 0) * Math.round(lineOf(rowPx) * 1.15);
  const graphY = capY + lineOf(cap) + Math.round(p * 0.4);
  const graphH = Math.max(8, inner.y + inner.height - graphY - (below ? below + p : 0));
  return [
    ...card,
    ring(k, o.load, sq, { start: 0, sweep: 360, thickness: Math.max(3, Math.round(s * 0.09)), fill: [ink(k, o.accent)], rounded: false, dot: false }),
    shadowed(k, reading(k, o.load, { x: sq.x, y: Math.round(sq.y + s / 2 - mid), px: vpx, width: s, align: "center", weight: "strong" })),
    caption(k, o.label, sq.x, Math.round(sq.y + s / 2 - mid + lineOf(vpx) * 0.9), lpx, { slot: o.accent, width: s, align: "center" }),
    shadowed(k, reading(k, o.temp, { x: textX, y: ty, px: big, width: textW, weight: "strong" })),
    shadowed(k, reading(k, o.clock, { x: textX, y: Math.round(ty + lineOf(big) * 0.95), px: small, width: textW, slot: "subtext" }, GHZ)),
    shadowed(k, reading(k, o.power, { x: textX, y: Math.round(ty + lineOf(big) * 0.95 + lineOf(small) * 0.95), px: small, width: textW, slot: "subtext" })),
    hairline(k, inner.x, ruleY, inner.width),
    caption(k, "Temperature", inner.x, capY, cap),
    graph(k, o.temp, { x: inner.x, y: graphY, width: inner.width, height: graphH }, { style: "area", color: ink(k, "warn"), fillAlpha: 0.3 }),
    ...(o.under ? lines(k, { x: inner.x, y: inner.y + inner.height - below, width: inner.width, height: below }, o.under.map(([label, role]) => ({ label, role })), { px: rowPx }) : []),
  ];
}

/** FPS big with the lows beside it and a green graph; a hairline; the frame time as a histogram. */
function fps(k: Kit, b: Box): DisplayItem[] {
  const { p, inner, r, cap, card } = frame(k, "FPS", b);
  const top = Math.round(inner.height * 0.2);
  const big = Math.max(12, Math.floor(Math.min(inner.height * 0.2, inner.width * 0.34)));
  const gapRow = Math.round(p * 0.4);
  const rows: Box = { x: inner.x + Math.round(inner.width * 0.46), y: inner.y, width: Math.round(inner.width * 0.54), height: top + Math.round(big * 0.4) };
  const graphY = inner.y + Math.max(top, lineOf(cap) + Math.round(lineOf(big) * 0.9)) + gapRow;
  const ruleY = Math.round(inner.y + inner.height * 0.5);
  const capY = ruleY + Math.round(p * 0.7);
  const rowPx = Math.max(8, Math.round(Math.min(r * 0.04, rows.width / 9.5)));
  return [
    ...card,
    caption(k, "FPS", inner.x, inner.y, cap, { slot: "accent3" }),
    shadowed(k, reading(k, "fps", { x: inner.x, y: inner.y + lineOf(cap), px: big, weight: "strong", unit: false })),
    ...lines(k, rows, [{ label: "1% low", role: "fps.low1", shown: { unit: "" } }, { label: "0.1% low", role: "fps.low01", shown: { unit: "" } }, { label: "Frame time", role: "frametime" }], { px: rowPx, gap: 2 }),
    graph(k, "fps", { x: inner.x, y: graphY, width: inner.width, height: Math.max(8, ruleY - graphY - gapRow) }, { style: "area", color: ink(k, "accent3"), fillAlpha: 0.3 }),
    hairline(k, inner.x, ruleY, inner.width),
    caption(k, "Frame time", inner.x, capY, cap),
    caption(k, "last 60 s", inner.x, capY, Math.max(8, cap - 1), { width: inner.width, align: "right", weight: "regular" }),
    graph(k, "frametime", { x: inner.x, y: capY + lineOf(cap) + Math.round(p * 0.4), width: inner.width, height: Math.max(8, inner.y + inner.height - capY - lineOf(cap) - Math.round(p * 0.4)) }, { style: "bars", color: { color: YELLOW }, fillAlpha: 1 }),
  ];
}

/** The weekday in red, the time, the date, and the uptime at the right. */
function time(k: Kit, b: Box): DisplayItem[] {
  const { p, inner, cap, card } = frame(k, "Clock", b, true);
  const big = Math.max(12, Math.floor(Math.min(inner.height * 0.5, inner.width * 0.27)));
  const date = Math.max(8, Math.round(big * 0.27));
  const block = lineOf(cap) + lineOf(big) * 0.95 + lineOf(date);
  const y = Math.round(inner.y + (inner.height - block) / 2);
  return [
    ...card,
    shadowed(k, clock(k, "dddd", { x: inner.x, y, px: cap, slot: "crit", weight: "strong", upper: true }, true)),
    shadowed(k, clock(k, "HH:mm", { x: inner.x, y: y + lineOf(cap), px: big, weight: "strong" })),
    shadowed(k, clock(k, "dd MMMM yyyy", { x: inner.x, y: Math.round(y + lineOf(cap) + lineOf(big) * 0.95), px: date, slot: "subtext" }, true)),
    ...(inner.width >= big * 2.2 + date * 5.4 + p
      ? [
          shadowed(k, text(k, "Uptime", { x: inner.x, y: y + lineOf(cap) + Math.round(p * 0.6), px: date, width: inner.width, align: "right", slot: "subtext" })),
          shadowed(k, reading(k, "uptime", { x: inner.x, y: y + lineOf(cap) + Math.round(p * 0.6) + lineOf(date), px: date, width: inner.width, align: "right", weight: "strong" })),
        ]
      : []),
  ];
}

/** RAM and VRAM in use side by side, then the disk's free space. */
function memory(k: Kit, b: Box): DisplayItem[] {
  const { p, inner, r, cap, card } = frame(k, "Memory", b, true);
  const [left, right] = split({ x: inner.x, y: inner.y + lineOf(cap), width: inner.width, height: inner.height * 0.5 }, [1, 1], p, true);
  const big = Math.max(10, Math.floor(Math.min(r * 0.13, left.width / 4.6)));
  const lab = Math.max(8, Math.round(big * 0.5));
  const ruleY = Math.round(inner.y + inner.height * 0.7);
  const col = (box: Box, label: string, slot: Slot, role: Role): DisplayItem[] => [
    caption(k, label, box.x, box.y, lab, { slot }),
    shadowed(k, reading(k, role, { x: box.x, y: box.y + lineOf(lab), px: big, weight: "strong" })),
  ];
  return [
    ...card,
    caption(k, "Memory", inner.x, inner.y, cap),
    ...col(left, "RAM", "warn", "ram.used"),
    ...col(right, "VRAM", "accent2", "vram.used"),
    hairline(k, inner.x, ruleY, inner.width),
    ...lines(k, { x: inner.x, y: ruleY + p, width: inner.width, height: Math.max(8, inner.y + inner.height - ruleY - p) }, [{ label: "Disk", role: "disk.free", shown: { unit: " GB free" } }], { px: Math.max(8, Math.round(r * 0.045)) }),
  ];
}

/** Three labelled area graphs, CPU, GPU and FPS, one under another. */
function performance(k: Kit, b: Box): DisplayItem[] {
  const { p, inner, r, cap, card } = frame(k, "Performance", b);
  const head = lineOf(cap) + Math.round(p * 0.6);
  const bands = split({ x: inner.x, y: inner.y + head, width: inner.width, height: inner.height - head }, [1, 1, 1], 0, false);
  const lab = Math.max(8, Math.round(Math.min(r * 0.045, bands[0].height * 0.2)));
  const labelW = Math.round(Math.max(lab * 3.2, inner.width * 0.06));
  const rows: [string, Slot, Role][] = [["CPU", "accent1", "cpu.load"], ["GPU", "accent2", "gpu.load"], ["FPS", "accent3", "fps"]];
  return [
    ...card,
    caption(k, "Performance", inner.x, inner.y, cap),
    caption(k, "last 2 minutes", inner.x, inner.y, Math.max(8, cap - 1), { width: inner.width, align: "right", weight: "regular" }),
    ...rows.flatMap(([label, slot, role], i) => {
      const band = bands[i];
      return [
        ...(i > 0 ? [hairline(k, inner.x, band.y, inner.width)] : []),
        caption(k, label, band.x, Math.round(band.y + (band.height - lineOf(lab)) / 2), lab, { slot }),
        graph(k, role, { x: band.x + labelW, y: band.y + 1, width: band.width - labelW, height: band.height - 1 }, { style: "area", color: ink(k, slot), fillAlpha: 0.28 }, 120),
      ];
    }),
  ];
}

/** Download and upload with their speeds, over a graph of both. */
function network(k: Kit, b: Box): DisplayItem[] {
  const { p, inner, cap, card } = frame(k, "Network", b);
  const lab = Math.max(8, Math.round(cap * 0.95));
  const big = Math.max(10, Math.floor(Math.min(inner.height * 0.1, inner.width / 15)));
  const y = inner.y + lineOf(cap) + Math.round(p * 0.5);
  const graphY = y + lineOf(lab) + lineOf(big) + Math.round(p * 0.6);
  return [
    ...card,
    caption(k, "Network", inner.x, inner.y, cap),
    shadowed(k, text(k, "↓ Download", { x: inner.x, y, px: lab, slot: "subtext" })),
    shadowed(k, coloured(reading(k, "net.down", { x: inner.x, y: y + lineOf(lab), px: big, weight: "strong" }), CYAN)),
    shadowed(k, text(k, "Upload ↑", { x: inner.x, y, px: lab, width: inner.width, align: "right", slot: "subtext" })),
    shadowed(k, reading(k, "net.up", { x: inner.x, y: y + lineOf(lab), px: big, width: inner.width, align: "right", slot: "warn", weight: "strong" })),
    dualGraph(k, { x: inner.x, y: graphY, width: inner.width, height: Math.max(8, inner.y + inner.height - graphY) }, "net.down", "net.up", [{ color: CYAN }, ink(k, "warn")]),
  ];
}

export const DECK: Template = {
  id: "deck",
  name: "Deck",
  blurb: "A second-screen dashboard: rings, graphs, FPS, clock and network",
  fits: ["wide", "standard"],
  size: { width: 1920, height: 1080 },
  background: "#FF2C3A63",
  color: "#FFFFFFFF",
  type: { family: "Segoe UI", light: "Semilight", regular: "Regular", strong: "Bold" },
  palette: DARK,
  variants: variantsOf("dark", "white", "smoke", "tint", "float"),
  grids: {
    standard: { cols: 4, rows: 4, cells: [[0, 0, 1, 2], [1, 0, 1, 2], [2, 0, 1, 2], [3, 0, 1, 1], [3, 1, 1, 1], [0, 2, 3, 2], [3, 2, 1, 2]] },
    wide: { cols: 4, rows: 2, cells: [[0, 0, 1, 2], [1, 0, 1, 2], [2, 0, 1, 2], [3, 0, 1, 1], [3, 1, 1, 1]] },
    tall: { cols: 2, rows: 11, cells: [[0, 2, 1, 3], [1, 2, 1, 3], [0, 5, 1, 3], [0, 0, 1, 2], [1, 0, 1, 2], [0, 8, 2, 3], [1, 5, 1, 3]] },
  },
  margin: 16,
  gap: 12,
  backdrop: (k) => {
    const { width: w, height: h } = k.frame;
    const s = Math.round(Math.max(w, h) * 0.8);
    return [
      glow(k, "Glow", { x: Math.round(-s * 0.3), y: Math.round(-s * 0.45), width: s, height: s }, "accent1", 0.32),
      glow(k, "Glow", { x: Math.round(w - s * 0.65), y: Math.round(h - s * 0.5), width: s, height: s }, "accent2", 0.28),
    ];
  },
  tiles: [
    (k, b) => device(k, b, { label: "CPU", accent: "accent1", load: "cpu.load", temp: "cpu.temp", clock: "cpu.clock", power: "cpu.power" }),
    (k, b) => device(k, b, { label: "GPU", accent: "accent2", load: "gpu.load", temp: "gpu.temp", clock: "gpu.clock", power: "gpu.power", under: [["Core clock", "gpu.clock"], ["Memory clock", "gpu.memclock"]] }),
    fps,
    time,
    memory,
    performance,
    network,
  ],
};
