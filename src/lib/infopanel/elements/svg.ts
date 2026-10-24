/**
 * The static elements (card, glow, divider, icon) as SVG markup at their box's size: one renderer
 * for the editor, the kiosk and the PNG the export bakes. Every value written is a checked
 * number, a colour from `cssOf` or the icon set's own markup (never spec text); the icon set
 * loads on first use (`icons.ts`).
 */
import { clamp, fmt, rad } from "../gauges/geom.ts";
import type { DisplayItem } from "../schema.ts";
import { iconMarkupOf } from "./icons.ts";
import { cssOf, type Ink } from "./palette.ts";
import { elementOf, isStaticSpec, type CardSpec, type DividerSpec, type GlowSpec, type IconSpec, type StaticSpec } from "./spec.ts";
export type { StaticSpec } from "./spec.ts";


/** A static element's spec and drawn size, on an Image item; null for anything else. */
export function staticOf(item: DisplayItem | undefined): { spec: StaticSpec; width: number; height: number } | null {
  const spec = elementOf(item);
  if (item?.kind !== "Image" || !isStaticSpec(spec)) return null;
  return { spec, width: Math.max(1, item.Width), height: Math.max(1, item.Height) };
}

interface Ctx {
  id: string;
  defs: string[];
  n: number;
}

/** A fill: one colour, or a linear gradient over the shape's own box running at `angle` (0 is top to bottom). */
function paint(ctx: Ctx, fill: readonly Ink[], angle: number): string {
  if (fill.length < 2) return cssOf(fill[0]?.color ?? "#FF000000");
  const key = `${ctx.id}g${ctx.n++}`;
  const [dx, dy] = [Math.sin(rad(angle)) / 2, Math.cos(rad(angle)) / 2];
  const stops = fill.map((ink, i) => `<stop offset="${fmt((i / (fill.length - 1)) * 100)}%" style="stop-color:${cssOf(ink.color)}"/>`).join("");
  ctx.defs.push(`<linearGradient id="${key}" x1="${fmt(0.5 - dx)}" y1="${fmt(0.5 - dy)}" x2="${fmt(0.5 + dx)}" y2="${fmt(0.5 + dy)}">${stops}</linearGradient>`);
  return `url(#${key})`;
}

/** A blur over the whole image (a box-relative region would cut the blur off at the shape's edge). */
function blur(ctx: Ctx, w: number, h: number, sd: number): string {
  const key = `${ctx.id}b${ctx.n++}`;
  ctx.defs.push(`<filter id="${key}" filterUnits="userSpaceOnUse" x="0" y="0" width="${fmt(w)}" height="${fmt(h)}"><feGaussianBlur stdDeviation="${fmt(sd)}"/></filter>`);
  return `url(#${key})`;
}

function card(ctx: Ctx, s: CardSpec, w: number, h: number): string {
  const [x, y, cw, ch] = [s.pad, s.pad, Math.max(0, w - 2 * s.pad), Math.max(0, h - 2 * s.pad)];
  const r = clamp(s.radius, 0, Math.min(cw, ch) / 2);
  const rect = (dx: number, dy: number, style: string, extra = "") =>
    `<rect x="${fmt(x + dx)}" y="${fmt(y + dy)}" width="${fmt(cw)}" height="${fmt(ch)}" rx="${fmt(r)}" style="${style}"${extra}/>`;
  const out: string[] = [];
  if (s.glow) out.push(rect(0, 0, `fill:${cssOf(s.glow.color.color)}`, ` filter="${blur(ctx, w, h, s.glow.blur / 2)}"`));
  if (s.shadow) out.push(rect(s.shadow.dx, s.shadow.dy, `fill:${cssOf(s.shadow.color.color)}`, ` filter="${blur(ctx, w, h, s.shadow.blur / 2)}"`));
  out.push(rect(0, 0, `fill:${paint(ctx, s.fill, s.angle)}`));
  // A 1 px stroke inside the card's edge, on the pixel grid.
  if (s.stroke) {
    out.push(
      `<rect x="${fmt(x + 0.5)}" y="${fmt(y + 0.5)}" width="${fmt(Math.max(0, cw - 1))}" height="${fmt(Math.max(0, ch - 1))}" rx="${fmt(Math.max(0, r - 0.5))}" style="fill:none;stroke:${cssOf(s.stroke.color)};stroke-width:1"/>`,
    );
  }
  return out.join("");
}

function glow(ctx: Ctx, s: GlowSpec, w: number, h: number): string {
  const key = `${ctx.id}r${ctx.n++}`;
  const color = cssOf(s.color.color);
  ctx.defs.push(
    `<radialGradient id="${key}" gradientUnits="userSpaceOnUse" cx="${fmt(w / 2)}" cy="${fmt(h / 2)}" r="${fmt(s.radius)}">` +
      `<stop offset="0%" style="stop-color:${color};stop-opacity:${fmt(s.alpha)}"/>` +
      `<stop offset="45%" style="stop-color:${color};stop-opacity:${fmt(s.alpha * 0.45)}"/>` +
      `<stop offset="100%" style="stop-color:${color};stop-opacity:0"/></radialGradient>`,
  );
  return `<rect width="${fmt(w)}" height="${fmt(h)}" style="fill:url(#${key})"/>`;
}

function divider(ctx: Ctx, s: DividerSpec, w: number, h: number): string {
  return `<rect width="${fmt(w)}" height="${fmt(h)}" style="fill:${paint(ctx, s.fill, s.orientation === "vertical" ? 0 : 90)}"/>`;
}

function icon(s: IconSpec, w: number, h: number): string {
  const size = Math.min(w, h);
  const k = Math.round((size / 24) * 10000) / 10000;
  const color = cssOf(s.color.color);
  return (
    `<g transform="translate(${fmt((w - size) / 2)} ${fmt((h - size) / 2)}) scale(${k})"` +
    ` style="color:${color};fill:none;stroke:${color};stroke-width:2;stroke-linecap:round;stroke-linejoin:round">${iconMarkupOf(s.name)}</g>`
  );
}

/** The element drawn at `w` × `h`; `id` prefixes its gradient and filter ids (unique per drawing on a page). */
export function elementSvg(spec: StaticSpec, w: number, h: number, id = ""): string {
  const ctx: Ctx = { id: id.replace(/[^\w-]/g, "_"), defs: [], n: 0 };
  const [W, H] = [Math.max(1, Math.round(w)), Math.max(1, Math.round(h))];
  const body = spec.type === "card" ? card(ctx, spec, W, H) : spec.type === "glow" ? glow(ctx, spec, W, H) : spec.type === "divider" ? divider(ctx, spec, W, H) : icon(spec, W, H);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${ctx.defs.length ? `<defs>${ctx.defs.join("")}</defs>` : ""}${body}</svg>`;
}
