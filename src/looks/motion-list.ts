// A pack's `list` motion (motion.ts) on a card's rows: the rows a list widget marks `data-mo-key` (its row's identity: a friend's
// name, a process, a session) come in, glide to a new place (FLIP: from where the same key stood, by `translate`, so nothing is laid
// out again), light once when their words change, and decode a new row's text. One observer per card, read once a frame at most and
// only when the card's DOM changed; every run is an attribute index.css answers (`data-mo-row-*`), never a React render. Digits do not
// count as a change (a reading that ticks is not news), and the lit rows share the page's flash budget (`flashOk`).
import { MOTION_RULES, ONE_SHOT_MAX_MS, type PlannedMotion } from "./motion";
import { flashOk, scrambleText } from "./motion-runtime";

/** At most this many rows of one card move in one change; past it a row simply shows where it is. */
export const LIST_ROWS_MAX = 8;
const ROW = "[data-mo-key]";

/** A row's words without its figures: a change of these lights it. */
const wordsOf = (row: Element): string => (row.textContent ?? "").replace(/[\d.,:%+-]/g, "");

/** Up to two texts of a row that are text alone (no element inside), for a new row's decode. */
function leavesOf(row: HTMLElement): HTMLElement[] {
  const all = [row, ...row.querySelectorAll<HTMLElement>("*")];
  return all.filter((el) => el.childNodes.length > 0 && [...el.childNodes].every((n) => n.nodeType === 3) && !!el.textContent?.trim() && !el.closest("[data-mo-text]")).slice(0, 2);
}

/** A new row's text decodes in an aria-hidden copy the runtime adds to it, and takes out again when the run ends. */
function decode(leaf: HTMLElement, intensity: number): void {
  const text = leaf.textContent ?? "";
  const copy = document.createElement("span");
  copy.setAttribute("data-mo-copy", "");
  copy.setAttribute("aria-hidden", "true");
  leaf.setAttribute("data-mo-text", "");
  leaf.append(copy);
  scrambleText(leaf, copy, text, {
    ms: MOTION_RULES.decode.def.ms!,
    intensity,
    done: () => {
      copy.remove();
      leaf.removeAttribute("data-mo-text");
    },
  });
}

/** Watches a card's rows for `list` (a planned effect). Returns what stops it. */
export function watchList(card: HTMLElement, list: PlannedMotion): () => void {
  let last: Map<string, { top: number; words: string }> | undefined;
  let queued = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const hold = (el: HTMLElement, attr: string, value: string, ms: number, done?: () => void) => {
    el.setAttribute(attr, value);
    const t = setTimeout(() => {
      timers.delete(t);
      el.removeAttribute(attr);
      done?.();
    }, ms + 50);
    timers.add(t);
  };
  const check = () => {
    queued = 0;
    const rows = [...card.querySelectorAll<HTMLElement>(ROW)];
    if (!rows.length && !last?.size) {
      last ??= new Map();
      return;
    }
    const origin = card.getBoundingClientRect().top;
    // a card zoomed past its design size moves its rows in its own px
    const zoom = Number.parseFloat(card.style.getPropertyValue("--wp-zoom")) || 1;
    const before = last;
    const next = new Map<string, { top: number; words: string }>();
    for (const row of rows) {
      const key = row.getAttribute("data-mo-key") ?? "";
      // a row with a run in it keeps the words it had: the copy's noise is not a change
      const words = row.querySelector("[data-mo-on]") ? (before?.get(key)?.words ?? wordsOf(row)) : wordsOf(row);
      next.set(key, { top: row.getBoundingClientRect().top - origin, words });
    }
    last = next;
    if (!before || document.hidden) return;
    let moved = 0;
    for (const row of rows) {
      if (moved >= LIST_ROWS_MAX) break;
      const key = row.getAttribute("data-mo-key") ?? "";
      const was = before.get(key);
      const now = next.get(key)!;
      if (!was) {
        if (list.enter && list.enter !== "none") hold(row, "data-mo-row-in", list.enter, list.ms);
        if (list.decode) for (const leaf of leavesOf(row)) decode(leaf, list.intensity);
        moved++;
      } else if (list.reorder && Math.abs(was.top - now.top) > 1) {
        row.style.setProperty("--mo-dy", `${(was.top - now.top) / zoom}px`);
        hold(row, "data-mo-row-move", "", list.ms, () => row.style.removeProperty("--mo-dy"));
        moved++;
      } else if (list.change && was.words !== now.words && flashOk()) {
        hold(row, "data-mo-row-hi", "", ONE_SHOT_MAX_MS);
        moved++;
      }
    }
  };
  // React commits, then this runs before the frame is painted: a moved row is drawn at its old place first, never at its new one
  const observer = new MutationObserver((records) => {
    // the runtime's own copies change each frame of a run: not a change of the rows
    if (!queued && records.some((r) => !(r.target.nodeType === 1 ? (r.target as Element) : r.target.parentElement)?.closest("[data-mo-copy]"))) queued = requestAnimationFrame(check);
  });
  observer.observe(card, { subtree: true, childList: true, characterData: true });
  check();
  return () => {
    observer.disconnect();
    if (queued) cancelAnimationFrame(queued);
    for (const t of timers) clearTimeout(t);
  };
}
