// The draw command API of a pack script (pack-script/limits.ts): what `fx.draw([...])` may hold, checked here before anything is
// drawn, and the replay of the checked list onto the overlay's 2D context. A command is plain data; a colour is an index into the
// palette the app gives (the Look's own colours), never a CSS string, so a script names no URL, font or filter. Anything out of
// shape is dropped, a number out of range is clamped, and past `COMMANDS_MAX`, `COST_MAX` or the point caps the rest of the frame is dropped.
import {
  BLUR_MAX,
  COMMANDS_MAX,
  COORD_MAX,
  COST_MAX,
  DASH_MAX,
  DOT_R_MAX,
  DOTS_MAX,
  FRAME_DOTS_MAX,
  FRAME_POINTS_MAX,
  GRADIENTS_MAX,
  LINE_MAX,
  PAD_MAX,
  PATH_POINTS_MAX,
  SCALE_MAX,
  STOPS_MAX,
  type Box,
  type CardSignal,
} from "./limits";

/** How a shape is painted: a palette index or a gradient (`gradient` op, by id) to fill and/or to stroke, an alpha 0 to 1, a line width 0 to `LINE_MAX`. */
export interface Paint {
  fill?: number;
  stroke?: number;
  fillGrad?: number;
  strokeGrad?: number;
  alpha: number;
  width: number;
}

/** The composite modes a script may use: the safe set (it never erases or inverts the page under the overlay). */
export type Mode = "source-over" | "lighter" | "screen";
const MODES: readonly Mode[] = ["source-over", "lighter", "screen"];
const CAPS = ["butt", "round", "square"] as const;
const JOINS = ["miter", "round", "bevel"] as const;
const KINDS = ["highlight", "underline", "wipe"] as const;
const SIDES = ["left", "right", "top", "bottom"] as const;

/** The line and composite state the shapes after a `style` command draw with. */
export interface Style {
  /** On and off lengths of a dashed line, px. */
  dash?: [number, number];
  /** Where in the dash the line starts, px: moving it over time makes a stream. */
  phase: number;
  cap: (typeof CAPS)[number];
  join: (typeof JOINS)[number];
  /** A glow round each shape, px (0 to `BLUR_MAX`), in the palette colour `glow` (the shape's own when unset). */
  blur: number;
  glow?: number;
  mode: Mode;
}

/** A gradient colour stop: where (0 to 1), which palette colour, how opaque. */
export interface Stop {
  at: number;
  color: number;
  alpha: number;
}

export type DrawCommand =
  | ({ op: "rect"; x: number; y: number; w: number; h: number } & Paint)
  | ({ op: "arc"; x: number; y: number; r: number; start: number; end: number } & Paint)
  /** `points` is x0, y0, x1, y1, … */
  | ({ op: "path"; points: number[]; close: boolean } & Paint)
  /** The box of one of a card's texts (`fx.signals().cards[card].texts[text]`), painted: the reveal stays the app's, the script never has the characters. */
  | ({ op: "glyph"; card: number; text: number } & Paint)
  /** A text box lit (`highlight`), underlined, or wiped (`p` of it from `side`): still only the box, `pad` px larger. */
  | ({ op: "textbox"; card: number; text: number; kind: (typeof KINDS)[number]; p: number; side: (typeof SIDES)[number]; pad: number } & Paint)
  /** Dots (`round`) or squares of radius `r` at x0, y0, x1, y1, …, all in one paint. */
  | ({ op: "points"; points: number[]; r: number; round: boolean } & Paint)
  /** A gradient for the shapes after it that name its `id`; it holds to the end of the frame. */
  | { op: "gradient"; id: number; stops: Stop[]; x0: number; y0: number; x1: number; y1: number; r0?: number; r1?: number }
  | ({ op: "style" } & Style)
  /** Draws nothing outside the card's box until `unclip`. */
  | { op: "clip"; card: number }
  | { op: "unclip" }
  /** A transform for the commands after it: scale and skew at most `SCALE_MAX`, a move held to the coordinate range. */
  | { op: "transform"; m: [number, number, number, number, number, number] }
  | { op: "reset" };

/** What the checker knows of the frame: how many palette colours there are and which cards and texts there are. */
export interface FrameShape {
  palette: number;
  cards: readonly Pick<CardSignal, "texts">[];
}

/** The checked list, how many commands were dropped as out of shape, whether a cap cut the frame short, and what it cost (limits.ts `COST_MAX`). */
export interface Checked {
  commands: DrawCommand[];
  refused: number;
  capped: boolean;
  cost: number;
}

/** What the checker carries from one command to the next. */
interface Run {
  points: number;
  dots: number;
  cost: number;
  blur: number;
  grads: Set<number>;
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const coord = (v: unknown): number | undefined => (num(v) ? clamp(v, -COORD_MAX, COORD_MAX) : undefined);
const length = (v: unknown): number | undefined => (num(v) ? clamp(v, 0, COORD_MAX) : undefined);
const index = (v: unknown, n: number): number | undefined => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < n ? (v as number) : undefined);
const oneOf = <T extends string>(v: unknown, set: readonly T[]): T | undefined => (set.includes(v as T) ? (v as T) : undefined);

/** The paint of a command: undefined when it names a colour not in the palette, a gradient not defined, or paints nothing. */
function paintOf(c: Record<string, unknown>, frame: FrameShape, run: Run): Paint | undefined {
  const pick = (solid: unknown, grad: unknown): { ok: boolean; solid?: number; grad?: number } => {
    if (solid !== undefined && grad !== undefined) return { ok: false };
    const s = solid === undefined ? undefined : index(solid, frame.palette);
    const g = grad === undefined ? undefined : index(grad, GRADIENTS_MAX);
    if ((solid !== undefined && s === undefined) || (grad !== undefined && (g === undefined || !run.grads.has(g)))) return { ok: false };
    return { ok: true, solid: s, grad: g };
  };
  const f = pick(c.fill, c.fillGrad);
  const k = pick(c.stroke, c.strokeGrad);
  if (!f.ok || !k.ok || (f.solid === undefined && f.grad === undefined && k.solid === undefined && k.grad === undefined)) return undefined;
  const alpha = c.alpha === undefined ? 1 : num(c.alpha) ? clamp(c.alpha, 0, 1) : undefined;
  const width = c.width === undefined ? 1 : num(c.width) ? clamp(c.width, 0, LINE_MAX) : undefined;
  if (alpha === undefined || width === undefined) return undefined;
  return {
    ...(f.solid !== undefined ? { fill: f.solid } : null),
    ...(k.solid !== undefined ? { stroke: k.solid } : null),
    ...(f.grad !== undefined ? { fillGrad: f.grad } : null),
    ...(k.grad !== undefined ? { strokeGrad: k.grad } : null),
    alpha,
    width,
  };
}

/** A number list read as x, y pairs, held to the coordinate range (undefined unless it is an even run of at least `min` numbers and at most `max` pairs). */
function pairs(p: unknown, min: number, max: number): number[] | undefined {
  if (!Array.isArray(p) || p.length < min || p.length % 2 || p.length / 2 > max || !p.every(num)) return undefined;
  return p.map((v: number) => clamp(v, -COORD_MAX, COORD_MAX));
}

/** A `style` command: every field is optional, one that is given and wrong refuses the command. */
function styleOf(c: Record<string, unknown>, frame: FrameShape): Style | undefined {
  const cap = c.cap === undefined ? "butt" : oneOf(c.cap, CAPS);
  const join = c.join === undefined ? "miter" : oneOf(c.join, JOINS);
  const mode = c.mode === undefined ? "source-over" : oneOf(c.mode, MODES);
  const blur = c.blur === undefined ? 0 : num(c.blur) ? clamp(c.blur, 0, BLUR_MAX) : undefined;
  const phase = c.phase === undefined ? 0 : num(c.phase) ? clamp(c.phase, -DASH_MAX * 8, DASH_MAX * 8) : undefined;
  const glow = c.glow === undefined ? undefined : index(c.glow, frame.palette);
  if (!cap || !join || !mode || blur === undefined || phase === undefined || (c.glow !== undefined && glow === undefined)) return undefined;
  let dash: [number, number] | undefined;
  if (c.dash !== undefined) {
    if (!Array.isArray(c.dash) || c.dash.length !== 2 || !c.dash.every(num)) return undefined;
    const [on, off] = c.dash.map((v: number) => clamp(v, 0, DASH_MAX));
    if (on + off >= 0.5) dash = [on, off];
  }
  return { ...(dash ? { dash } : null), phase, cap, join, blur, ...(glow !== undefined ? { glow } : null), mode };
}

/** A `gradient` command: linear from (x0, y0) to (x1, y1), or radial (with `r0` and `r1`), 2 to `STOPS_MAX` stops of `[at, colour, alpha]`. */
function gradientOf(c: Record<string, unknown>, frame: FrameShape): DrawCommand | undefined {
  const id = index(c.id, GRADIENTS_MAX);
  const [x0, y0, x1, y1] = [coord(c.x0), coord(c.y0), coord(c.x1), coord(c.y1)];
  if (id === undefined || x0 === undefined || y0 === undefined || x1 === undefined || y1 === undefined) return undefined;
  const raw = c.stops;
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > STOPS_MAX) return undefined;
  const stops: Stop[] = [];
  for (const s of raw) {
    if (!Array.isArray(s) || s.length < 2 || s.length > 3 || !num(s[0])) return undefined;
    const color = index(s[1], frame.palette);
    const alpha = s[2] === undefined ? 1 : num(s[2]) ? clamp(s[2], 0, 1) : undefined;
    if (color === undefined || alpha === undefined) return undefined;
    stops.push({ at: clamp(s[0], 0, 1), color, alpha });
  }
  if (c.r0 === undefined && c.r1 === undefined) return { op: "gradient", id, stops, x0, y0, x1, y1 };
  const [r0, r1] = [length(c.r0), length(c.r1)];
  return r0 === undefined || r1 === undefined ? undefined : { op: "gradient", id, stops, x0, y0, x1, y1, r0, r1 };
}

/** What one command costs of `COST_MAX` (limits.ts), given the glow it draws under. */
function costOf(c: DrawCommand, blur: number): number {
  if (c.op === "reset" || c.op === "transform" || c.op === "style" || c.op === "clip" || c.op === "unclip") return 1;
  if (c.op === "gradient") return 2;
  const grad = c.fillGrad !== undefined || c.strokeGrad !== undefined ? 1 : 0;
  return 1 + grad + blur + (c.op === "points" ? Math.ceil(c.points.length / 100) : 0);
}

/** One command checked: undefined when it is out of shape. */
function checkOne(raw: unknown, frame: FrameShape, run: Run): DrawCommand | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const c = raw as Record<string, unknown>;
  if (c.op === "reset") return { op: "reset" };
  if (c.op === "unclip") return { op: "unclip" };
  if (c.op === "transform") {
    const m = Array.isArray(c.m) && c.m.length === 6 && c.m.every(num) ? (c.m as number[]) : undefined;
    if (!m) return undefined;
    const s = (v: number) => clamp(v, -SCALE_MAX, SCALE_MAX);
    return { op: "transform", m: [s(m[0]), s(m[1]), s(m[2]), s(m[3]), clamp(m[4], -COORD_MAX, COORD_MAX), clamp(m[5], -COORD_MAX, COORD_MAX)] };
  }
  if (c.op === "style") {
    const style = styleOf(c, frame);
    return style ? { op: "style", ...style } : undefined;
  }
  if (c.op === "clip") {
    const card = index(c.card, frame.cards.length);
    return card === undefined ? undefined : { op: "clip", card };
  }
  if (c.op === "gradient") return gradientOf(c, frame);
  const paint = paintOf(c, frame, run);
  if (!paint) return undefined;
  if (c.op === "rect") {
    const [x, y, w, h] = [coord(c.x), coord(c.y), length(c.w), length(c.h)];
    return x === undefined || y === undefined || w === undefined || h === undefined ? undefined : { op: "rect", x, y, w, h, ...paint };
  }
  if (c.op === "arc") {
    const [x, y, r] = [coord(c.x), coord(c.y), length(c.r)];
    const start = c.start === undefined ? 0 : num(c.start) ? clamp(c.start, -4 * Math.PI, 4 * Math.PI) : undefined;
    const end = c.end === undefined ? 2 * Math.PI : num(c.end) ? clamp(c.end, -4 * Math.PI, 4 * Math.PI) : undefined;
    return x === undefined || y === undefined || r === undefined || start === undefined || end === undefined ? undefined : { op: "arc", x, y, r, start, end, ...paint };
  }
  if (c.op === "path") {
    const points = pairs(c.points, 4, PATH_POINTS_MAX);
    if (!points || run.points + points.length / 2 > FRAME_POINTS_MAX) return undefined;
    return { op: "path", points, close: c.close === true, ...paint };
  }
  if (c.op === "points") {
    const points = pairs(c.points, 2, DOTS_MAX);
    const r = c.r === undefined ? 1 : num(c.r) ? clamp(c.r, 0, DOT_R_MAX) : undefined;
    if (!points || r === undefined || run.dots + points.length / 2 > FRAME_DOTS_MAX) return undefined;
    return { op: "points", points, r, round: c.shape !== "square", ...paint };
  }
  if (c.op === "glyph" || c.op === "textbox") {
    const card = index(c.card, frame.cards.length);
    const text = card === undefined ? undefined : index(c.text, frame.cards[card].texts.length);
    if (card === undefined || text === undefined) return undefined;
    if (c.op === "glyph") return { op: "glyph", card, text, ...paint };
    const kind = oneOf(c.kind, KINDS);
    const side = c.side === undefined ? "left" : oneOf(c.side, SIDES);
    const p = c.p === undefined ? 1 : num(c.p) ? clamp(c.p, 0, 1) : undefined;
    const pad = c.pad === undefined ? 0 : num(c.pad) ? clamp(c.pad, 0, PAD_MAX) : undefined;
    return !kind || !side || p === undefined || pad === undefined ? undefined : { op: "textbox", card, text, kind, p, side, pad, ...paint };
  }
  return undefined;
}

/** A frame's `fx.draw` lists as the host draws them (`raw` is whatever the guest gave: it is not trusted to be an array). */
export function checkCommands(raw: unknown, frame: FrameShape): Checked {
  const list = Array.isArray(raw) ? raw : [];
  const commands: DrawCommand[] = [];
  let refused = Array.isArray(raw) ? 0 : 1;
  const run: Run = { points: 0, dots: 0, cost: 0, blur: 0, grads: new Set() };
  let capped = list.length > COMMANDS_MAX;
  for (const item of list.slice(0, COMMANDS_MAX)) {
    const c = checkOne(item, frame, run);
    if (!c) {
      refused++;
      continue;
    }
    const cost = costOf(c, run.blur);
    if (run.cost + cost > COST_MAX) {
      capped = true;
      break;
    }
    run.cost += cost;
    if (c.op === "path") run.points += c.points.length / 2;
    else if (c.op === "points") run.dots += c.points.length / 2;
    else if (c.op === "gradient") run.grads.add(c.id);
    else if (c.op === "style") run.blur = c.blur;
    commands.push(c);
  }
  return { commands, refused, capped, cost: run.cost };
}

/** The parts of a 2D context the replay uses (an OffscreenCanvas's in the worker, a fake in the tests). */
export type Ctx2D = Pick<
  OffscreenCanvasRenderingContext2D,
  "setTransform" | "beginPath" | "rect" | "arc" | "moveTo" | "lineTo" | "closePath" | "fill" | "stroke" | "save" | "restore" | "clip" | "setLineDash" | "createLinearGradient" | "createRadialGradient"
> & {
  globalAlpha: number;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineDashOffset: number;
  lineCap: string;
  lineJoin: string;
  globalCompositeOperation: string;
  shadowBlur: number;
  shadowColor: string;
};

/** A palette colour at an alpha: `color-mix` keeps whatever notation the palette is in (a stop is the one place a colour is not painted as is). */
const withAlpha = (color: string, alpha: number): string => (alpha >= 1 ? color : `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`);

const IDENTITY: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];

/** Draws a checked list: every transform is on top of `base` (the device pixel scale), so a script cannot leave the overlay's scale behind, and the style, glow and clip it leaves are undone at the end. */
export function replay(ctx: Ctx2D, commands: readonly DrawCommand[], palette: readonly string[], cards: readonly (Pick<CardSignal, "texts"> & Partial<Box>)[], base = 1): void {
  let m = IDENTITY;
  let style: Style | undefined;
  let clipped = false;
  let styled = false;
  const gradients: unknown[] = [];
  const place = () => ctx.setTransform(m[0] * base, m[1] * base, m[2] * base, m[3] * base, m[4] * base, m[5] * base);
  const setStyle = (s: Style | undefined) => {
    styled = true;
    ctx.setLineDash(s?.dash ?? []);
    ctx.lineDashOffset = s?.phase ?? 0;
    ctx.lineCap = s?.cap ?? "butt";
    ctx.lineJoin = s?.join ?? "miter";
    ctx.globalCompositeOperation = s?.mode ?? "source-over";
  };
  const unclip = () => {
    if (!clipped) return;
    clipped = false;
    ctx.restore();
    place();
    if (style) setStyle(style);
  };
  place();
  const paint = (p: Paint) => {
    ctx.globalAlpha = p.alpha;
    const glow = style && style.blur > 0 ? style : undefined;
    if (glow) {
      ctx.shadowBlur = glow.blur * base;
      ctx.shadowColor = palette[glow.glow ?? p.stroke ?? p.fill ?? 0];
    }
    if (p.fill !== undefined || p.fillGrad !== undefined) {
      ctx.fillStyle = p.fillGrad !== undefined ? gradients[p.fillGrad] : palette[p.fill as number];
      ctx.fill();
    }
    if ((p.stroke !== undefined || p.strokeGrad !== undefined) && p.width > 0) {
      ctx.strokeStyle = p.strokeGrad !== undefined ? gradients[p.strokeGrad] : palette[p.stroke as number];
      ctx.lineWidth = p.width;
      ctx.stroke();
    }
    if (glow) ctx.shadowBlur = 0;
  };
  for (const c of commands) {
    if (c.op === "reset") {
      m = IDENTITY;
      place();
    } else if (c.op === "transform") {
      m = c.m;
      place();
    } else if (c.op === "style") {
      style = c;
      setStyle(c);
    } else if (c.op === "unclip") unclip();
    else if (c.op === "clip") {
      unclip();
      const b = cards[c.card];
      clipped = true;
      ctx.save();
      ctx.setTransform(base, 0, 0, base, 0, 0);
      ctx.beginPath();
      ctx.rect(b.x ?? 0, b.y ?? 0, b.w ?? 0, b.h ?? 0);
      ctx.clip();
      place();
    } else if (c.op === "gradient") {
      const g = c.r0 === undefined || c.r1 === undefined ? ctx.createLinearGradient(c.x0, c.y0, c.x1, c.y1) : ctx.createRadialGradient(c.x0, c.y0, c.r0, c.x1, c.y1, c.r1);
      for (const s of c.stops) g.addColorStop(s.at, withAlpha(palette[s.color], s.alpha));
      gradients[c.id] = g;
    } else {
      ctx.beginPath();
      if (c.op === "rect") ctx.rect(c.x, c.y, c.w, c.h);
      else if (c.op === "arc") ctx.arc(c.x, c.y, c.r, c.start, c.end);
      else if (c.op === "glyph") {
        const b = cards[c.card].texts[c.text];
        ctx.rect(b.x, b.y, b.w, b.h);
      } else if (c.op === "textbox") {
        const b = cards[c.card].texts[c.text];
        const [x, y, w, h] = [b.x - c.pad, b.y - c.pad, b.w + 2 * c.pad, b.h + 2 * c.pad];
        if (c.kind === "highlight") ctx.rect(x, y, w, h);
        else if (c.kind === "underline") ctx.rect(x, y + h, w, Math.max(1, c.width));
        else if (c.side === "left") ctx.rect(x, y, w * c.p, h);
        else if (c.side === "right") ctx.rect(x + w * (1 - c.p), y, w * c.p, h);
        else if (c.side === "top") ctx.rect(x, y, w, h * c.p);
        else ctx.rect(x, y + h * (1 - c.p), w, h * c.p);
      } else if (c.op === "points") {
        for (let i = 0; i < c.points.length; i += 2) {
          const [x, y] = [c.points[i], c.points[i + 1]];
          if (c.round) {
            ctx.moveTo(x + c.r, y);
            ctx.arc(x, y, c.r, 0, 2 * Math.PI);
          } else ctx.rect(x - c.r, y - c.r, 2 * c.r, 2 * c.r);
        }
      } else {
        ctx.moveTo(c.points[0], c.points[1]);
        for (let i = 2; i < c.points.length; i += 2) ctx.lineTo(c.points[i], c.points[i + 1]);
        if (c.close) ctx.closePath();
      }
      paint(c);
    }
  }
  unclip();
  if (styled) setStyle(undefined);
  ctx.globalAlpha = 1;
}
