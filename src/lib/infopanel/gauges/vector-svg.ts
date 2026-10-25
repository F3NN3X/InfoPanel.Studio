/**
 * A vector gauge as SVG markup, one renderer for both uses: live in the studio
 * (theme colours as the widget variables, so the dashboard theme applies) and
 * baked into InfoPanel frames (theme colours as fixed values). Colours go in
 * `style` so `var(...)` works; every value written is a checked number, a
 * checked colour or escaped text (normalizeGauge).
 */
import { faceTile } from "../../effects/face.ts";
import { clamp, fmt } from "./geom.ts";
import { iconMarkup } from "./icon-markup.ts";
import { resolvePaint, templateVars, withValue, gaugePrims, type Paint, type PaintMode, type PatternPaint, type Prim, type VectorGauge } from "./vector.ts";

export interface SvgOptions {
  /** "bake" (default): fixed colours; "live": theme variables. */
  mode?: PaintMode;
  /** Prefix for gradient and filter ids, unique per drawing: ids share the page's one id space. */
  id?: string;
  /** Drawn size; the spec's size by default. A different size stretches it. */
  width?: number;
  height?: number;
  /** "face": only the ring's face (a static layer); "body": everything else. All of it by default. */
  layer?: "face" | "body";
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

  // Motion (drifting waves and patterns) only live; baked frames are still images.
  const moving = mode === "live";
  let n = 0;
  const common = (prim: Prim) => `${prim.opacity !== undefined ? ` opacity="${fmt(clamp(prim.opacity, 0, 1))}"` : ""}${prim.glow && glow ? ` filter="url(#${id}glow)"` : ""}`;
  const slide = (attr: string, dx: number, dy: number, seconds: number, additive = false) =>
    `<animateTransform attributeName="${attr}" type="translate" from="0 0" to="${fmt(dx)} ${fmt(dy)}" dur="${fmt(seconds)}s" repeatCount="indefinite"${additive ? ' additive="sum"' : ""}/>`;

  const patternDef = (pt: PatternPaint): string => {
    const key = `${id}p${n++}`;
    const s = pt.size;
    const color = paint(pt.color);
    const tile =
      pt.pattern === "dots"
        ? `<circle cx="${fmt(s / 2)}" cy="${fmt(s / 2)}" r="${fmt(s / 4)}" style="fill:${color}"/>`
        : pt.pattern === "chevrons"
          ? `<path d="M${fmt(s * 0.3)} ${fmt(s * 0.15)}L${fmt(s * 0.65)} ${fmt(s / 2)}L${fmt(s * 0.3)} ${fmt(s * 0.85)}" style="fill:none;stroke:${color};stroke-width:${fmt(s / 6)};stroke-linecap:round;stroke-linejoin:round"/>`
          : `<rect width="${fmt(s / 2)}" height="${fmt(s)}" style="fill:${color}"/>`;
    // The tile's x axis points along the fill; stripes lean 45°.
    const turn = { right: 0, down: 90, left: 180, up: -90 }[pt.along] + (pt.pattern === "stripes" ? 45 : 0);
    const drift = moving && pt.seconds > 0 ? slide("patternTransform", s, 0, pt.seconds, true) : "";
    defs.push(`<pattern id="${key}" patternUnits="userSpaceOnUse" width="${fmt(s)}" height="${fmt(s)}" patternTransform="rotate(${fmt(turn)})">${tile}${drift}</pattern>`);
    return `url(#${key})`;
  };

  const draw = (prim: Prim): string => {
    switch (prim.kind) {
      case "path": {
        const style = prim.fill ? `fill:${paint(prim.fill)}` : `fill:none;stroke:${paint(prim.stroke ?? "#000000")};stroke-width:${fmt(prim.width ?? 1)};stroke-linecap:${prim.cap ?? "butt"}`;
        if (!(moving && prim.rise && prim.rise.seconds > 0)) return `<path d="${prim.d}" style="${style}"${common(prim)}/>`;
        // Rising and fading in and out; a negative begin starts each one part way through its loop.
        const r = prim.rise;
        const timing = `dur="${fmt(r.seconds)}s" begin="${fmt(-r.delay)}s" repeatCount="indefinite"`;
        const peak = fmt(clamp(prim.opacity ?? 1, 0, 1));
        return (
          `<path d="${prim.d}" style="${style}"${common(prim)}>` +
          `<animateTransform attributeName="transform" type="translate" from="0 ${fmt(r.from)}" to="0 ${fmt(r.to)}" ${timing}/>` +
          `<animate attributeName="opacity" values="0;${peak};${peak};0" keyTimes="0;0.15;0.8;1" ${timing}/></path>`
        );
      }
      case "text": {
        const font = esc(prim.font.replace(/[^\w\s,'.-]/g, "") || DEFAULT_FONT);
        const anchor = prim.anchor === "start" || prim.anchor === "end" ? prim.anchor : "middle";
        return (
          `<text x="${fmt(prim.x)}" y="${fmt(prim.y)}" text-anchor="${anchor}" dominant-baseline="central"` +
          ` style="fill:${paint(prim.color)};font-family:${font};font-size:${fmt(prim.size)}px;font-weight:${Math.round(prim.weight)}"${common(prim)}>${esc(prim.text)}</text>`
        );
      }
      case "icon": {
        // Lucide's own markup (a fixed set, never spec text), scaled from its 24 px grid.
        const k = prim.size / 24;
        const color = paint(prim.color);
        return (
          `<g transform="translate(${fmt(prim.x - prim.size / 2)} ${fmt(prim.y - prim.size / 2)}) scale(${Math.round(k * 10000) / 10000})"` +
          ` style="color:${color};fill:none;stroke:${color};stroke-width:2;stroke-linecap:round;stroke-linejoin:round"${common(prim)}>${iconMarkup(prim.name)}</g>`
        );
      }
      case "face": {
        const f = prim.face;
        const key = `${id}f${n++}`;
        const tile = faceTile(f.pattern, f.size, paint(f.color));
        defs.push(
          `<pattern id="${key}" patternUnits="userSpaceOnUse" width="${fmt(tile.w)}" height="${fmt(tile.h)}" patternTransform="translate(${fmt(prim.cx)} ${fmt(prim.cy)})">` +
            `<g opacity="${fmt(clamp(f.opacity, 0, 1))}">${tile.markup}</g></pattern>`,
        );
        const disc = (fill: string) => `<circle cx="${fmt(prim.cx)}" cy="${fmt(prim.cy)}" r="${fmt(prim.r)}" style="fill:${fill}"/>`;
        return `<g${common(prim)}>${f.fill ? disc(paint(f.fill)) : ""}${disc(`url(#${key})`)}</g>`;
      }
      case "group": {
        const key = `${id}c${n++}`;
        defs.push(`<clipPath id="${key}"><path d="${prim.clip}"/></clipPath>`);
        const inner = prim.children.map(draw).join("");
        const drift = moving && prim.drift && prim.drift.seconds > 0 ? `<g>${slide("transform", prim.drift.dx, prim.drift.dy, prim.drift.seconds)}${inner}</g>` : inner;
        return `<g clip-path="url(#${key})"${common(prim)}>${drift}</g>`;
      }
      case "rect": {
        let fill: string;
        if (prim.fill === null) fill = "none";
        else if (typeof prim.fill === "string") fill = paint(prim.fill);
        else if ("pattern" in prim.fill) fill = patternDef(prim.fill);
        else {
          const lg = prim.fill;
          const key = `${id}g${n++}`;
          defs.push(
            `<linearGradient id="${key}" gradientUnits="userSpaceOnUse" x1="${fmt(lg.x1)}" y1="${fmt(lg.y1)}" x2="${fmt(lg.x2)}" y2="${fmt(lg.y2)}">` +
              [...lg.stops].sort((a, b) => a.at - b.at).map((s) => `<stop offset="${clamp(s.at, 0, 100)}%" style="stop-color:${paint(s.color)}"/>`).join("") +
              `</linearGradient>`,
          );
          fill = `url(#${key})`;
        }
        const stroke = prim.stroke ? `;stroke:${paint(prim.stroke)};stroke-width:${fmt(prim.width ?? 1)}` : "";
        return `<rect x="${fmt(prim.x)}" y="${fmt(prim.y)}" width="${fmt(Math.max(0, prim.w))}" height="${fmt(Math.max(0, prim.h))}" rx="${fmt(prim.r)}" style="fill:${fill}${stroke}"${common(prim)}/>`;
      }
    }
  };
  const prims = gaugePrims(g, p).filter((prim) => !opts.layer || (prim.kind === "face") === (opts.layer === "face"));
  const body = prims.map(draw).join("");

  const w = opts.width ?? g.width;
  const h = opts.height ?? g.height;
  const stretch = w !== g.width || h !== g.height ? ' preserveAspectRatio="none"' : "";
  const content = g.shadow ? `<g filter="url(#${id}shadow)">${body}</g>` : body;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(w)}" height="${fmt(h)}" viewBox="0 0 ${g.width} ${g.height}"${stretch}>` +
    `${defs.length ? `<defs>${defs.join("")}</defs>` : ""}${content}</svg>`
  );
}
