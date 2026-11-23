// What a pack script may read of the page (the privacy boundary of pack-scripts-and-signing.md, "Data rules"): each card's box,
// its bound value as 0 to 1 in hundredths and its threshold state (the first bar or ring that says them, `data-fx-value` and
// `data-fx-state`, primitives.tsx, written only on a card that wears a scripted pack), and its texts as boxes with a glyph count, never a character. A card that blurs a value for
// privacy, or sits in a zone marked quiet (agent and chat widgets, `data-fx-quiet`), sends nothing: its box is one the host
// erases from the overlay instead. The host reads this at most `SIGNAL_MS` apart.
import { CARDS_MAX, TEXTS_MAX, type Box, type CardSignal, type Signals } from "./limits";

/** A value 0 to 1 in hundredths; null for anything that is not a finite number. */
export function round01(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

const STATES = new Set(["ok", "warn", "crit"]);
/** The cards a script never reads: one that blurs a value for privacy, or one in a quiet zone. */
const QUIET = "[data-fx-quiet], .blur-xs";
const TEXTS = '[data-part="header"], [data-part="label"], [data-part="num"]';

/** The signals of the cards under `root`, boxes relative to `overlay` (its page box, and the page's scale when the studio zooms it), and the boxes of the quiet cards. */
export function readSignals(root: ParentNode, overlay: { rect: DOMRect; scale: number }, level: Signals["level"]): { signals: Signals; quiet: Box[] } {
  const { rect, scale } = overlay;
  const box = (r: DOMRect): Box => ({ x: Math.round((r.left - rect.left) / scale), y: Math.round((r.top - rect.top) / scale), w: Math.round(r.width / scale), h: Math.round(r.height / scale) });
  const cards: CardSignal[] = [];
  const quiet: Box[] = [];
  for (const card of root.querySelectorAll<HTMLElement>('[data-part="card"]')) {
    const b = box(card.getBoundingClientRect());
    if (b.w <= 0 || b.h <= 0) continue;
    if (card.closest("[data-fx-quiet]") || card.querySelector(QUIET)) {
      quiet.push(b);
      continue;
    }
    if (cards.length >= CARDS_MAX) continue;
    const mark = card.querySelector("[data-fx-value]");
    const state = mark?.getAttribute("data-fx-state") ?? null;
    const texts = [...card.querySelectorAll<HTMLElement>(TEXTS)].slice(0, TEXTS_MAX).flatMap((t) => {
      const tb = box(t.getBoundingClientRect());
      return tb.w > 0 && tb.h > 0 ? [{ ...tb, n: [...(t.textContent ?? "").trim()].length }] : [];
    });
    cards.push({ ...b, value: round01(mark?.getAttribute("data-fx-value")), state: state && STATES.has(state) ? (state as CardSignal["state"]) : null, texts });
  }
  return { signals: { level, width: Math.round(rect.width / scale), height: Math.round(rect.height / scale), cards }, quiet };
}
