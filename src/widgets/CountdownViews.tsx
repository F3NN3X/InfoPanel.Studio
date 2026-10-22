import { unitWord, type Part } from "@/lib/countdown";
import { Num } from "./kit";

export type CountdownView = "inline" | "tiles" | "big";

/** What the views draw: the units left (or the "Happening now" line), the event name and the date line. */
export interface CountdownBody {
  /** The units, largest first; empty while the event is happening. */
  parts: Part[];
  name: string;
  dateLine: string;
  size: string;
  w: number;
  h: number;
}

const MIN_PX = 14;
const TIER_PX: Record<string, number> = { xs: 28, sm: 40, md: 56, lg: 76 };
const TILE_GAP = 6;
/** One digit's width and the unit word's, in em of the number. */
const DIGIT = 0.62;
const WORD = 0.23;

const digits = (p: Part): number => String(p.value).length;
/** What `shown` takes in width: em of the number, plus the fixed px between tiles. */
type Cost = (p: Part) => number;

/** The units that fit `w` at no less than MIN_PX, dropping the smallest first, and the number size they get (a tier's, less where the width or `hLimit` asks). */
export function fitParts(parts: readonly Part[], w: number, cap: number, hLimit: number, cost: Cost, fixed: (n: number) => number): { shown: Part[]; px: number } {
  const size = (n: number) => {
    const byW = w > 0 ? (w - fixed(n)) / parts.slice(0, n).reduce((s, p) => s + cost(p), 0) : Infinity;
    return Math.floor(Math.min(cap, byW, hLimit));
  };
  let n = parts.length;
  while (n > 1 && size(n) < MIN_PX) n--;
  return { shown: parts.slice(0, n), px: Math.max(MIN_PX, size(n)) };
}

const lineMeta = (size: string) => (size === "xs" ? 0 : 20);

function Name({ name, size }: { name: string; size: string }) {
  if (!name || size === "xs") return null;
  return <span className="max-w-full truncate text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--w-muted)]">{name}</span>;
}

function DateLine({ text, size }: { text: string; size: string }) {
  return text ? <span className={`max-w-full truncate text-[color:var(--w-muted)] ${size === "xs" ? "text-[10px]" : "text-xs"}`}>{text}</span> : null;
}

/** The big accent line while the event is happening (width-fitted to the box). */
function HappeningNow({ body }: { body: CountdownBody }) {
  const px = Math.max(MIN_PX, Math.floor(Math.min(TIER_PX[body.size] ?? 40, body.w > 0 ? body.w / 7.4 : Infinity, body.h > 0 ? body.h - lineMeta(body.size) * 2 - 8 : Infinity)));
  return (
    <Num className="max-w-full truncate leading-none text-[color:var(--accent)]" style={{ fontSize: px }}>
      Happening now
    </Num>
  );
}

/** The numbers row of a view: its parts, and the size they are drawn at. */
function numbers(body: CountdownBody, view: CountdownView) {
  const { size, w, h } = body;
  const cap = TIER_PX[size] ?? 40;
  const chrome = (body.name ? lineMeta(size) : 0) + (body.dateLine ? lineMeta(size) : 0) + 8;
  const room = h > 0 ? h - chrome : Infinity;
  if (view === "tiles") return fitParts(body.parts, w, cap, room - 26, (p) => Math.max(2, digits(p)) * DIGIT + 0.8, (n) => TILE_GAP * (n - 1));
  if (view === "big") return fitParts(body.parts.slice(0, 1), w, cap * 1.8, room, (p) => digits(p) * DIGIT + WORD * unitWord(p).length + 0.15, () => 0);
  return fitParts(body.parts, w, cap, room / 1.1, (p) => digits(p) * DIGIT + WORD * unitWord(p).length + 0.57, () => 0);
}

/** Inline / Tiles / Big number: the event name above, the numbers, the date line below. */
export function CountdownBodyView({ body, view }: { body: CountdownBody; view: CountdownView }) {
  const now = body.parts.length === 0;
  const { shown, px } = now ? { shown: [] as Part[], px: 0 } : numbers(body, view);
  return (
    <div className="flex h-full min-w-0 flex-col items-center justify-center gap-1.5 text-center">
      <Name name={body.name} size={body.size} />
      {now ? (
        <HappeningNow body={body} />
      ) : view === "tiles" ? (
        <div className="flex max-w-full items-start justify-center" style={{ gap: TILE_GAP }}>
          {shown.map((p) => (
            <div key={p.unit} className="flex flex-col items-center gap-1">
              <div className="rounded-lg bg-[color:var(--w-track)] px-[0.3em] py-[0.15em] text-center" style={{ minWidth: `${2 * DIGIT + 0.6}em`, fontSize: px }}>
                <Num className="block leading-none">{p.value}</Num>
              </div>
              <span className="text-[10px] text-[color:var(--w-muted)]">{unitWord(p)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex max-w-full items-baseline justify-center whitespace-nowrap leading-none" style={{ gap: px * 0.45 }}>
          {shown.map((p) => (
            <span key={p.unit} className="flex items-baseline" style={{ gap: px * 0.12 }}>
              <Num style={{ fontSize: px }}>{p.value}</Num>
              <span className="text-[color:var(--w-muted)]" style={{ fontSize: px * 0.4 }}>
                {unitWord(p)}
              </span>
            </span>
          ))}
        </div>
      )}
      <DateLine text={body.dateLine} size={body.size} />
    </div>
  );
}
