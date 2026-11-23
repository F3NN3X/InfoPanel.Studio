// The draw command API of a pack script (pack-script/limits.ts): what `fx.draw([...])` may hold, checked here before anything is
// drawn, and the replay of the checked list onto the overlay's 2D context. A command is plain data; a colour is an index into the
// palette the app gives (the Look's own colours), never a CSS string, so a script names no URL, font or filter. Anything out of
// shape is dropped, a number out of range is clamped, and past `COMMANDS_MAX` or the point caps the rest of the frame is dropped.
import { COMMANDS_MAX, COORD_MAX, FRAME_POINTS_MAX, LINE_MAX, PATH_POINTS_MAX, SCALE_MAX, type CardSignal } from "./limits";

/** How a shape is painted: a palette index to fill and/or to stroke, an alpha 0 to 1, a line width 0 to `LINE_MAX`. */
export interface Paint {
  fill?: number;
  stroke?: number;
  alpha: number;
  width: number;
}

export type DrawCommand =
  | ({ op: "rect"; x: number; y: number; w: number; h: number } & Paint)
  | ({ op: "arc"; x: number; y: number; r: number; start: number; end: number } & Paint)
  /** `points` is x0, y0, x1, y1, … */
  | ({ op: "path"; points: number[]; close: boolean } & Paint)
  /** The box of one of a card's texts (`fx.signals().cards[card].texts[text]`), painted: the reveal stays the app's, the script never has the characters. */
  | ({ op: "glyph"; card: number; text: number } & Paint)
  /** A transform for the commands after it: scale and skew at most `SCALE_MAX`, a move held to the coordinate range. */
  | { op: "transform"; m: [number, number, number, number, number, number] }
  | { op: "reset" };

/** What the checker knows of the frame: how many palette colours there are and which cards and texts there are. */
export interface FrameShape {
  palette: number;
  cards: readonly Pick<CardSignal, "texts">[];
}

/** The checked list, how many commands were dropped as out of shape, and whether a cap cut the frame short. */
export interface Checked {
  commands: DrawCommand[];
  refused: number;
  capped: boolean;
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const coord = (v: unknown): number | undefined => (num(v) ? clamp(v, -COORD_MAX, COORD_MAX) : undefined);
const length = (v: unknown): number | undefined => (num(v) ? clamp(v, 0, COORD_MAX) : undefined);
const index = (v: unknown, n: number): number | undefined => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < n ? (v as number) : undefined);

/** The paint of a command: undefined when it names a colour that is not in the palette, or paints nothing. */
function paintOf(c: Record<string, unknown>, palette: number): Paint | undefined {
  const fill = c.fill === undefined ? undefined : index(c.fill, palette);
  const stroke = c.stroke === undefined ? undefined : index(c.stroke, palette);
  if ((c.fill !== undefined && fill === undefined) || (c.stroke !== undefined && stroke === undefined) || (fill === undefined && stroke === undefined)) return undefined;
  const alpha = c.alpha === undefined ? 1 : num(c.alpha) ? clamp(c.alpha, 0, 1) : undefined;
  const width = c.width === undefined ? 1 : num(c.width) ? clamp(c.width, 0, LINE_MAX) : undefined;
  if (alpha === undefined || width === undefined) return undefined;
  return { ...(fill !== undefined ? { fill } : null), ...(stroke !== undefined ? { stroke } : null), alpha, width };
}

/** One command checked: undefined when it is out of shape. `points` is what a path spends of the frame's points. */
function checkOne(raw: unknown, frame: FrameShape, points: number): DrawCommand | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const c = raw as Record<string, unknown>;
  if (c.op === "reset") return { op: "reset" };
  if (c.op === "transform") {
    const m = Array.isArray(c.m) && c.m.length === 6 && c.m.every(num) ? (c.m as number[]) : undefined;
    if (!m) return undefined;
    const s = (v: number) => clamp(v, -SCALE_MAX, SCALE_MAX);
    return { op: "transform", m: [s(m[0]), s(m[1]), s(m[2]), s(m[3]), clamp(m[4], -COORD_MAX, COORD_MAX), clamp(m[5], -COORD_MAX, COORD_MAX)] };
  }
  const paint = paintOf(c, frame.palette);
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
    const p = c.points;
    if (!Array.isArray(p) || p.length < 4 || p.length % 2 || p.length / 2 > PATH_POINTS_MAX || points + p.length / 2 > FRAME_POINTS_MAX || !p.every(num)) return undefined;
    return { op: "path", points: p.map((v: number) => clamp(v, -COORD_MAX, COORD_MAX)), close: c.close === true, ...paint };
  }
  if (c.op === "glyph") {
    const card = index(c.card, frame.cards.length);
    const text = card === undefined ? undefined : index(c.text, frame.cards[card].texts.length);
    return card === undefined || text === undefined ? undefined : { op: "glyph", card, text, ...paint };
  }
  return undefined;
}

/** A frame's `fx.draw` lists as the host draws them (`raw` is whatever the guest gave: it is not trusted to be an array). */
export function checkCommands(raw: unknown, frame: FrameShape): Checked {
  const list = Array.isArray(raw) ? raw : [];
  const commands: DrawCommand[] = [];
  let refused = Array.isArray(raw) ? 0 : 1;
  let points = 0;
  for (const item of list.slice(0, COMMANDS_MAX)) {
    const c = checkOne(item, frame, points);
    if (!c) refused++;
    else {
      if (c.op === "path") points += c.points.length / 2;
      commands.push(c);
    }
  }
  return { commands, refused, capped: list.length > COMMANDS_MAX };
}

/** The parts of a 2D context the replay uses (an OffscreenCanvas's in the worker, a fake in the tests). */
export type Ctx2D = Pick<OffscreenCanvasRenderingContext2D, "setTransform" | "beginPath" | "rect" | "arc" | "moveTo" | "lineTo" | "closePath" | "fill" | "stroke"> & {
  globalAlpha: number;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
};

/** Draws a checked list: every transform is on top of `base` (the device pixel scale), so a script cannot leave the overlay's scale behind. */
export function replay(ctx: Ctx2D, commands: readonly DrawCommand[], palette: readonly string[], cards: readonly Pick<CardSignal, "texts">[], base = 1): void {
  ctx.setTransform(base, 0, 0, base, 0, 0);
  const paint = (p: Paint) => {
    ctx.globalAlpha = p.alpha;
    if (p.fill !== undefined) {
      ctx.fillStyle = palette[p.fill];
      ctx.fill();
    }
    if (p.stroke !== undefined && p.width > 0) {
      ctx.strokeStyle = palette[p.stroke];
      ctx.lineWidth = p.width;
      ctx.stroke();
    }
  };
  for (const c of commands) {
    if (c.op === "reset") ctx.setTransform(base, 0, 0, base, 0, 0);
    else if (c.op === "transform") ctx.setTransform(c.m[0] * base, c.m[1] * base, c.m[2] * base, c.m[3] * base, c.m[4] * base, c.m[5] * base);
    else {
      ctx.beginPath();
      if (c.op === "rect") ctx.rect(c.x, c.y, c.w, c.h);
      else if (c.op === "arc") ctx.arc(c.x, c.y, c.r, c.start, c.end);
      else if (c.op === "glyph") {
        const b = cards[c.card].texts[c.text];
        ctx.rect(b.x, b.y, b.w, b.h);
      } else {
        ctx.moveTo(c.points[0], c.points[1]);
        for (let i = 2; i < c.points.length; i += 2) ctx.lineTo(c.points[i], c.points[i + 1]);
        if (c.close) ctx.closePath();
      }
      paint(c);
    }
  }
  ctx.globalAlpha = 1;
}
