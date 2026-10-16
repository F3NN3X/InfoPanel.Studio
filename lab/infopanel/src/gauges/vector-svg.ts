/**
 * A vector gauge as SVG markup, one renderer for both uses: live in the studio
 * (theme colours as the widget variables, so the dashboard theme applies) and
 * baked into InfoPanel frames (theme colours as fixed values). Colours go in
 * `style` so `var(...)` works; every value written is a checked number, a
 * checked colour or escaped text (normalizeGauge).
 */
import { clamp, fmt } from "./geom.ts";
import { resolvePaint, templateVars, withValue, gaugePrims, type Paint, type PaintMode, type Prim, type VectorGauge } from "./vector.ts";

export interface SvgOptions {
  /** "bake" (default): fixed colours; "live": theme variables. */
  mode?: PaintMode;
  /** Prefix for gradient and filter ids, unique per drawing: ids share the page's one id space. */
  id?: string;
  /** Drawn size; the spec's size by default. A different size stretches it. */
  width?: number;
  height?: number;
}

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
const DEFAULT_FONT = "system-ui, 'Segoe UI', sans-serif";

export function gaugeSvg(g: VectorGauge, p: number, opts: SvgOptions = {}): string {
  if (g.shape === "svg") return withValue(g.template ?? "", templateVars(g, p));
  const mode = opts.mode ?? "bake";
  const id = (opts.id ?? "").replace(/[^\w-]/g, "_");
  const paint = (v: Paint) => esc(resolvePaint(v, mode));
  const defs: string[] = [];
  const glow = (g.glow ?? 0) > 0;
  // Filter regions over the whole frame and a margin: a stroke reaches past its path's bounding box,
  // so a box-relative region would cut thick strokes off.
  const region = (margin: number) =>
    `filterUnits="userSpaceOnUse" x="${fmt(-margin)}" y="${fmt(-margin)}" width="${fmt(g.width + 2 * margin)}" height="${fmt(g.height + 2 * margin)}"`;
  if (glow) {
    defs.push(
      `<filter id="${id}glow" ${region(g.glow! * 2)}><feGaussianBlur in="SourceGraphic" stdDeviation="${fmt(g.glow! / 2)}" result="b"/>` +
        `<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
    );
  }
  if (g.shadow) {
    const s = g.shadow;
    defs.push(
      `<filter id="${id}shadow" ${region(s.blur * 2 + Math.max(Math.abs(s.dx), Math.abs(s.dy)))}>` +
        `<feDropShadow dx="${fmt(s.dx)}" dy="${fmt(s.dy)}" stdDeviation="${fmt(s.blur / 2)}" style="flood-color:${paint(s.color)};flood-opacity:${fmt(s.opacity)}"/></filter>`,
    );
  }

  const common = (prim: Prim) => `${prim.opacity !== undefined ? ` opacity="${fmt(clamp(prim.opacity, 0, 1))}"` : ""}${prim.glow && glow ? ` filter="url(#${id}glow)"` : ""}`;
  const body = gaugePrims(g, p)
    .map((prim, i) => {
      if (prim.kind === "path") {
        const style = prim.fill ? `fill:${paint(prim.fill)}` : `fill:none;stroke:${paint(prim.stroke ?? "#000000")};stroke-width:${fmt(prim.width ?? 1)};stroke-linecap:${prim.cap ?? "butt"}`;
        return `<path d="${prim.d}" style="${style}"${common(prim)}/>`;
      }
      if (prim.kind === "text") {
        const font = esc(prim.font.replace(/[^\w\s,'.-]/g, "") || DEFAULT_FONT);
        const anchor = prim.anchor === "start" || prim.anchor === "end" ? prim.anchor : "middle";
        return (
          `<text x="${fmt(prim.x)}" y="${fmt(prim.y)}" text-anchor="${anchor}" dominant-baseline="central"` +
          ` style="fill:${paint(prim.color)};font-family:${font};font-size:${fmt(prim.size)}px;font-weight:${Math.round(prim.weight)}"${common(prim)}>${esc(prim.text)}</text>`
        );
      }
      let fill: string;
      if (prim.fill === null) fill = "none";
      else if (typeof prim.fill === "string") fill = paint(prim.fill);
      else {
        const lg = prim.fill;
        defs.push(
          `<linearGradient id="${id}g${i}" gradientUnits="userSpaceOnUse" x1="${fmt(lg.x1)}" y1="${fmt(lg.y1)}" x2="${fmt(lg.x2)}" y2="${fmt(lg.y2)}">` +
            [...lg.stops].sort((a, b) => a.at - b.at).map((s) => `<stop offset="${clamp(s.at, 0, 100)}%" style="stop-color:${paint(s.color)}"/>`).join("") +
            `</linearGradient>`,
        );
        fill = `url(#${id}g${i})`;
      }
      const stroke = prim.stroke ? `;stroke:${paint(prim.stroke)};stroke-width:${fmt(prim.width ?? 1)}` : "";
      return `<rect x="${fmt(prim.x)}" y="${fmt(prim.y)}" width="${fmt(Math.max(0, prim.w))}" height="${fmt(Math.max(0, prim.h))}" rx="${fmt(prim.r)}" style="fill:${fill}${stroke}"${common(prim)}/>`;
    })
    .join("");

  const w = opts.width ?? g.width;
  const h = opts.height ?? g.height;
  const stretch = w !== g.width || h !== g.height ? ' preserveAspectRatio="none"' : "";
  const content = g.shadow ? `<g filter="url(#${id}shadow)">${body}</g>` : body;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(w)}" height="${fmt(h)}" viewBox="0 0 ${g.width} ${g.height}"${stretch}>` +
    `${defs.length ? `<defs>${defs.join("")}</defs>` : ""}${content}</svg>`
  );
}
