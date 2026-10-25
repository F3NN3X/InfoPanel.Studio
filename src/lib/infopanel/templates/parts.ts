/**
 * Tile layouts the templates share: a heading, a ring with its value in the middle, a meter (big
 * value over a bar), a network pair with sparklines, a clock, and label-and-value rows. Each fills
 * the box it is given and sizes everything from it, so the same tile works at every canvas size.
 */
import type { Slot } from "../elements/palette.ts";
import type { CardSpec, LedBarSpec, RingSpec, SparklineSpec } from "../elements/spec.ts";
import type { DisplayItem } from "../schema.ts";
import { bar, card, clock, icon, ink, ledbar, ring, sparkline, text, value, type Kit, type Weight } from "./kit.ts";
import { inset, split, square, type Box } from "./layout.ts";
import type { Role } from "./roles.ts";

/** A text line's height for its drawn size. */
export const lineOf = (px: number) => Math.round(px * 1.35);

/** The design's padding inside a tile, scaled. */
export const padOf = (k: Kit, design = 10) => Math.max(2, Math.round(design * k.frame.u));

/** The heading size: from the tile and the canvas, so a big tile on a small canvas stays modest. */
export const headPx = (k: Kit, b: Box) => Math.max(9, Math.round(Math.min(11 * k.frame.u, b.height * 0.09, b.width * 0.08)));

export interface HeadingOpts {
  icon?: string;
  iconSlot?: Slot;
  slot?: Slot;
  px?: number;
  weight?: Weight;
  upper?: boolean;
}

/** An optional icon, then the label, from the box's top left; returns the items and the height used. */
export function heading(k: Kit, b: Box, label: string, o: HeadingOpts = {}): { items: DisplayItem[]; height: number } {
  const px = o.px ?? headPx(k, b);
  const items: DisplayItem[] = [];
  let x = b.x;
  if (o.icon) {
    const s = Math.round(px * 1.4);
    items.push(icon(k, o.icon, { x, y: Math.round(b.y + px * 0.68 - s / 2), width: s, height: s }, o.iconSlot ?? "accent1"));
    x += s + Math.round(px * 0.55);
  }
  items.push(text(k, label, { x, y: b.y, px, slot: o.slot ?? "subtext", weight: o.weight ?? "strong", upper: o.upper ?? true }));
  return { items, height: lineOf(px) };
}

/** A label on the left and a role's value on the right of one line. */
export function row(k: Kit, b: Box, label: string, role: Role, o: { px?: number; slot?: Slot; valueSlot?: Slot; weight?: Weight; upper?: boolean } = {}): DisplayItem[] {
  const px = o.px ?? Math.round(b.height / 1.35);
  return [
    text(k, label, { x: b.x, y: b.y, px, slot: o.slot ?? "subtext", weight: "regular", upper: o.upper }),
    value(k, role, { x: b.x, y: b.y, px, width: b.width, align: "right", slot: o.valueSlot ?? "text", weight: o.weight ?? "regular" }),
  ];
}

export interface RingValueOpts {
  ring?: Partial<RingSpec>;
  /** The value's size as a share of the ring's width. */
  scale?: number;
  weight?: Weight;
  /** A second, smaller value under the first. */
  sub?: Role;
  valueSlot?: Slot;
}

/** A ring in the square, its role's value in the middle. */
export function ringValue(k: Kit, role: Role, sq: Box, o: RingValueOpts = {}): DisplayItem[] {
  const thickness = o.ring?.thickness ?? Math.max(4, Math.round(sq.width * 0.08));
  const px = Math.round(sq.width * (o.scale ?? 0.22));
  const subPx = Math.round(px * 0.42);
  const block = lineOf(px) * 0.82 + (o.sub ? lineOf(subPx) : 0);
  const top = sq.y + sq.height / 2 - block / 2 - px * 0.1;
  return [
    ring(k, role, sq, { thickness, ...o.ring }),
    value(k, role, { x: sq.x, y: top, px, width: sq.width, align: "center", weight: o.weight ?? "regular", slot: o.valueSlot }),
    ...(o.sub ? [value(k, o.sub, { x: sq.x, y: top + lineOf(px) * 0.82, px: subPx, width: sq.width, align: "center", slot: "subtext" })] : []),
  ];
}

export interface GaugeTileOpts {
  label: string;
  icon?: string;
  role: Role;
  sub?: Role;
  /** Two small values along the bottom, left and right. */
  foot?: readonly [Role, Role];
  ring?: Partial<RingSpec>;
  /** The tile's card; null draws none. */
  card?: Partial<CardSpec> | null;
  weight?: Weight;
  scale?: number;
}

/** Short labels for a role's value next to a ring or in a list. */
export const SHORT: Record<Role, string> = {
  "cpu.load": "Load", "cpu.temp": "Temp", "cpu.clock": "Clock", "cpu.power": "Power",
  "gpu.load": "Load", "gpu.temp": "Temp", "gpu.clock": "Clock", "gpu.power": "Power",
  "ram.load": "RAM", "ram.used": "Used", "disk.load": "Disk", "disk.temp": "Disk temp",
  "net.down": "Down", "net.up": "Up", uptime: "Up", "clock.second": "Second",
  fps: "FPS", "fps.low1": "1% low", "fps.low01": "0.1% low", frametime: "Frame time",
  "vram.used": "VRAM", "vram.total": "VRAM total", "vram.temp": "VRAM temp",
  "gpu.memclock": "Memory clock", "gpu.hotspot": "Hot spot", "gpu.fan": "Fan", "gpu.volt": "Voltage",
  "ram.total": "Total", "ram.free": "Free", "disk.free": "Free",
  "cpu.maxcore": "Busiest core", "cpu.ccd1": "CCD1", "cpu.ccd2": "CCD2",
  "psu.12v": "12V", "ups.power": "UPS", "ram.speed": "Speed",
};

/**
 * A card with a heading and a ring with its value. In a box much wider than tall, the other
 * values are listed beside the ring; otherwise `sub` sits under the value and `foot` along the bottom.
 */
export function gaugeTile(k: Kit, b: Box, o: GaugeTileOpts): DisplayItem[] {
  const p = padOf(k);
  const inner = inset(b, p);
  const head = heading(k, inner, o.label, { icon: o.icon });
  const area = { x: inner.x, y: inner.y + head.height + p * 0.4, width: inner.width, height: inner.height - head.height - p * 0.4 };
  const backing = o.card === null ? [] : [card(k, `${o.label} card`, b, o.card ?? {})];
  const extras = [o.sub, ...(o.foot ?? [])].filter((r): r is Role => r !== undefined);
  if (extras.length > 0 && area.width > area.height * 1.7) {
    const sq = square({ ...area, width: area.height });
    const right = { x: sq.x + sq.width + p * 1.5, y: area.y, width: area.x + area.width - (sq.x + sq.width + p * 1.5), height: area.height };
    const px = Math.max(9, Math.round(Math.min(right.height / (extras.length * 1.9), right.width * 0.11)));
    const step = Math.min(right.height / extras.length, lineOf(px) * 1.5);
    const top = right.y + (right.height - step * extras.length) / 2 + (step - lineOf(px)) / 2;
    return [
      ...backing,
      ...head.items,
      ...ringValue(k, o.role, sq, { ring: o.ring, weight: o.weight, scale: o.scale }),
      ...extras.flatMap((role, i) => row(k, { x: right.x, y: top + i * step, width: right.width, height: lineOf(px) }, SHORT[role], role, { px })),
    ];
  }
  const footPx = Math.max(9, Math.round(head.height * 0.7));
  const footH = o.foot ? lineOf(footPx) + p * 0.3 : 0;
  const sq = square({ ...area, height: area.height - footH });
  const fy = inner.y + inner.height - lineOf(footPx);
  const foot = o.foot
    ? [
        value(k, o.foot[0], { x: inner.x, y: fy, px: footPx, slot: "subtext" }),
        value(k, o.foot[1], { x: inner.x, y: fy, px: footPx, width: inner.width, align: "right", slot: "subtext" }),
      ]
    : [];
  return [...backing, ...head.items, ...ringValue(k, o.role, sq, { ring: o.ring, sub: o.sub, weight: o.weight, scale: o.scale }), ...foot];
}

export interface BarsEntry {
  label: string;
  role: Role;
  /** Draw a meter under the line (for values with a range, not rates). */
  meter?: boolean;
  fill?: Slot;
}

/** A card with a heading and a list: each line a label and value, with a bar (or LED bar) under it. */
export function barsTile(
  k: Kit,
  b: Box,
  o: { label: string; icon?: string; entries: readonly BarsEntry[]; card?: Partial<CardSpec> | null; led?: Partial<LedBarSpec> },
): DisplayItem[] {
  const p = padOf(k);
  const inner = inset(b, p);
  const head = heading(k, inner, o.label, { icon: o.icon });
  const body = { x: inner.x, y: inner.y + head.height + p * 0.5, width: inner.width, height: inner.height - head.height - p * 0.5 };
  const step = body.height / o.entries.length;
  const px = Math.max(9, Math.round(Math.min(step / 2.2, 15 * k.frame.u, body.width * 0.09)));
  const meterH = Math.max(3, Math.round(Math.min(step * 0.22, 8 * k.frame.u)));
  return [
    ...(o.card === null ? [] : [card(k, `${o.label} card`, b, o.card ?? {})]),
    ...head.items,
    ...o.entries.flatMap((e, i) => {
      const y = body.y + i * step + (step - lineOf(px) - (e.meter === false ? 0 : meterH + p * 0.3)) / 2;
      const line = row(k, { x: body.x, y, width: body.width, height: lineOf(px) }, e.label, e.role, { px });
      if (e.meter === false) return line;
      const m = { x: body.x, y: y + lineOf(px) + p * 0.3, width: body.width, height: meterH };
      return [...line, o.led ? ledbar(k, e.role, m, { ...o.led, ...(e.fill ? { fill: [ink(k, e.fill)] } : {}) }) : bar(k, e.role, m, e.fill)];
    }),
  ];
}

export interface MeterTileOpts {
  label: string;
  icon?: string;
  role: Role;
  /** The meter under the value: InfoPanel's bar, an LED bar, or a sparkline. */
  meter: "bar" | "led" | "spark";
  led?: Partial<LedBarSpec>;
  spark?: Partial<SparklineSpec>;
  /** A line under the meter: a label and a role's value. */
  extra?: readonly [string, Role];
  card?: Partial<CardSpec> | null;
  weight?: Weight;
  fill?: Slot;
}

/** A card with a heading, a big value, a meter and an optional extra line. */
export function meterTile(k: Kit, b: Box, o: MeterTileOpts): DisplayItem[] {
  const p = padOf(k);
  const inner = inset(b, p);
  const head = heading(k, inner, o.label, { icon: o.icon });
  const extraPx = Math.max(9, Math.round(head.height * 0.74));
  const extraH = o.extra ? lineOf(extraPx) + p * 0.3 : 0;
  const room = inner.height - head.height - extraH;
  const meterH = o.meter === "spark" ? Math.round(room * 0.42) : Math.max(4, Math.round(Math.min(room * 0.12, 12 * k.frame.u)));
  const px = Math.max(12, Math.round(Math.min((room - meterH - p * 0.6) / 1.35, inner.width * 0.3)));
  const vy = inner.y + head.height + (room - meterH - lineOf(px)) / 2 - p * 0.3;
  const meterBox = { x: inner.x, y: inner.y + inner.height - extraH - meterH, width: inner.width, height: meterH };
  const meter =
    o.meter === "bar"
      ? bar(k, o.role, meterBox, o.fill)
      : o.meter === "led"
        ? ledbar(k, o.role, meterBox, o.led)
        : sparkline(k, o.role, meterBox, o.spark);
  const extra = o.extra ? [...row(k, { x: inner.x, y: inner.y + inner.height - lineOf(extraPx), width: inner.width, height: lineOf(extraPx) }, o.extra[0], o.extra[1], { px: extraPx })] : [];
  return [
    ...(o.card === null ? [] : [card(k, `${o.label} card`, b, o.card ?? {})]),
    ...head.items,
    value(k, o.role, { x: inner.x, y: vy, px, weight: o.weight ?? "regular" }),
    meter,
    ...extra,
  ];
}

/** Download and upload, each a value over its sparkline, side by side (or stacked in a tall box). */
export function netTile(k: Kit, b: Box, o: { card?: Partial<CardSpec> | null; spark?: Partial<SparklineSpec>; icon?: boolean; up?: Slot } = {}): DisplayItem[] {
  const p = padOf(k);
  const inner = inset(b, p);
  const head = heading(k, inner, "Network", { icon: o.icon === false ? undefined : "network" });
  const body = { x: inner.x, y: inner.y + head.height + p * 0.4, width: inner.width, height: inner.height - head.height - p * 0.4 };
  const across = body.width >= body.height * 0.9;
  const halves = split(body, [1, 1], p, across);
  const part = (role: Role, h: Box, arrow: string, slot: Slot): DisplayItem[] => {
    const px = Math.max(10, Math.round(Math.min(h.height * 0.2, h.width * 0.15)));
    const iconS = Math.round(px * 0.9);
    return [
      icon(k, arrow, { x: h.x, y: Math.round(h.y + px * 0.68 - iconS / 2), width: iconS, height: iconS }, slot),
      value(k, role, { x: h.x + iconS + Math.round(px * 0.3), y: h.y, px, weight: "regular" }),
      sparkline(k, role, { x: h.x, y: h.y + lineOf(px) + p * 0.3, width: h.width, height: h.height - lineOf(px) - p * 0.3 }, { color: { color: k.palette[slot], slot }, ...o.spark }),
    ];
  };
  return [
    ...(o.card === null ? [] : [card(k, "Network card", b, o.card ?? {})]),
    ...head.items,
    ...part("net.down", halves[0], "arrow-down", "accent1"),
    ...part("net.up", halves[1], "arrow-up", o.up ?? "accent2"),
  ];
}

/** The time large, the date under it, and uptime last, centred in the box. */
export function clockTile(k: Kit, b: Box, o: { card?: Partial<CardSpec> | null; weight?: Weight; format?: string; uptime?: boolean } = {}): DisplayItem[] {
  const p = padOf(k);
  const inner = inset(b, p);
  const px = Math.max(14, Math.round(Math.min(inner.width * 0.24, inner.height * 0.36)));
  const datePx = Math.max(9, Math.round(px * 0.3));
  const upPx = Math.max(9, Math.round(px * 0.26));
  const block = lineOf(px) * 0.9 + lineOf(datePx) + (o.uptime === false ? 0 : lineOf(upPx) + p * 0.4);
  const top = inner.y + (inner.height - block) / 2;
  const up = top + lineOf(px) * 0.9 + lineOf(datePx) + p * 0.4;
  return [
    ...(o.card === null ? [] : [card(k, "Clock card", b, o.card ?? {})]),
    clock(k, o.format ?? "HH:mm", { x: inner.x, y: top, px, width: inner.width, align: "center", weight: o.weight ?? "light" }),
    clock(k, "dddd d MMMM", { x: inner.x, y: top + lineOf(px) * 0.9, px: datePx, width: inner.width, align: "center", slot: "subtext" }, true),
    ...(o.uptime === false
      ? []
      : [
          text(k, "Up", { x: inner.x, y: up, px: upPx, width: inner.width / 2 - p * 0.3, align: "right", slot: "subtext", upper: true, weight: "strong" }),
          value(k, "uptime", { x: inner.x + inner.width / 2 + p * 0.3, y: up, px: upPx, slot: "accent1" }),
        ]),
  ];
}
