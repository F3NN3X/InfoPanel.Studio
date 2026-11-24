// What draws a pack's motion (L117): one animation-frame loop for every text that scrambles or counts and one timer for every
// repeat on the page, written straight to the DOM, so no effect renders React. The text a run covers stays in the page and in the
// accessibility tree (the host's own text, its ink hidden for the run); the noise, the count or the roll is in an aria-hidden copy
// laid over it, so the line never changes width. A page's boot staggers its cards' arrival once per page. The CSS that answers each
// attribute is index.css's (`app-mo-*`). Nothing runs while the page is hidden.
import { MOTION_GAP_MS, MOTION_RULES, ONE_SHOT_MAX_MS, type MotionPlan, type ValueMark, type ValueStyle } from "./motion";
import { countAt, countOf, rollOf } from "./motion-value";

/** Noise for a label (the kit's set) and for a number (digits, so a figure stays a figure). */
const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&/<>[]{}=+*";
const DIGITS = "0123456789";
/** At most this many texts run at once (scrambles, decodes, counts and rolls); past it a text simply shows (a page switch on a full screen). */
export const TEXT_JOBS_MAX = 12;
/** At most this many numbers start a scramble in any second, over the whole page: a screen of readings that change each tick stays mostly still (measured on a 20-card page, L117). */
export const NUMBER_STARTS_PER_S = 3;
/** At most this many numbers start a count or a roll in any second, over the whole page (a count writes its copy each frame: 6 a second cost a 20-card page about 300 ms of main-thread work a second, measured). */
export const VALUE_STARTS_PER_S = 3;
/** At most this many change marks (a number's flash or underline, a list row lit) in any second, over the whole page: with the one repeat a second, never over three flashes a second. */
export const FLASH_STARTS_PER_S = 2;
/** The noise changes at most this often, ms (about 12 a second); a count about 15 times a second, which reads as counting and lays the text out half as often as 30. */
const FRAME_MS = 80;
const COUNT_FRAME_MS = 66;
/** A flicker run: two dips in this many ms. */
export const FLICKER_MS = 600;

const hidden = () => typeof document !== "undefined" && document.hidden;

interface Job {
  host: HTMLElement;
  copy: HTMLElement;
  start: number;
  ms: number;
  /** The copy's text at `t` (0 to 1); undefined leaves it as it is (a roll is drawn once, by CSS). */
  draw: (t: number) => string | undefined;
  frame: number;
  last: number;
  /** What the run leaves behind to take away (a copy the runtime added). */
  done?: () => void;
}

const jobs = new Map<HTMLElement, Job>();
let frame = 0;

/** A rolling count of starts in the last second; `take` says whether one more fits under `max` and counts it. */
function limiter(max: number) {
  const starts: number[] = [];
  return (now: number): boolean => {
    while (starts.length && !(now - starts[0] < 1000 && now >= starts[0])) starts.shift();
    if (starts.length >= max) return false;
    starts.push(now);
    return true;
  };
}
const numberStart = limiter(NUMBER_STARTS_PER_S);
const valueStart = limiter(VALUE_STARTS_PER_S);
const flashStart = limiter(FLASH_STARTS_PER_S);

/** Whether a change mark may light now (and counts it): at most `FLASH_STARTS_PER_S` a second over the page. */
export const flashOk = (): boolean => !hidden() && flashStart(performance.now());

const end = (job: Job) => {
  if (jobs.get(job.host) === job) jobs.delete(job.host);
  job.host.removeAttribute("data-mo-on");
  job.copy.textContent = "";
  job.done?.();
};

function step(now: number) {
  frame = 0;
  for (const job of jobs.values()) {
    // a host React took away, or a copy it wrote over (a row's text changed under its decode): the run is over
    if (!job.host.isConnected || !job.copy.isConnected) {
      end(job);
      continue;
    }
    const t = (now - job.start) / job.ms;
    if (t >= 1) end(job);
    else if (now - job.last >= job.frame) {
      job.last = now;
      const text = job.draw(Math.max(0, t));
      if (text !== undefined) job.copy.textContent = text;
    }
  }
  if (jobs.size) frame = requestAnimationFrame(step);
}

/** Whether a new run on `host` may start: a visible page, a frame loop, room under `TEXT_JOBS_MAX` (a run already on the host makes way). */
const room = (host: HTMLElement) => !hidden() && typeof requestAnimationFrame !== "undefined" && (jobs.has(host) || jobs.size < TEXT_JOBS_MAX);

/**
 * Starts a run on `host`. `draw` writes the copy on the frame loop; `timed` runs no frame loop at all (the copy is drawn once and
 * CSS animates it: a roll, a glitch), and a timer ends it.
 */
function begin(host: HTMLElement, copy: HTMLElement, ms: number, draw: Job["draw"], opts: { frame?: number; done?: () => void; now?: number; timed?: boolean } = {}): () => void {
  const prev = jobs.get(host);
  if (prev) end(prev);
  const now = opts.now ?? performance.now();
  const job: Job = { host, copy, start: now, ms, draw, frame: opts.frame ?? FRAME_MS, last: now, done: opts.done };
  jobs.set(host, job);
  host.setAttribute("data-mo-on", "");
  const first = draw(0);
  if (first !== undefined) copy.textContent = first;
  if (opts.timed) setTimeout(() => jobs.get(host) === job && end(job), ms);
  else if (!frame) frame = requestAnimationFrame(step);
  return () => {
    if (jobs.get(host) === job) end(job);
  };
}

/** The noise of a scramble at `t`: a label decodes left to right with a short fringe of noise ahead of the wave and blanks beyond; a number's changed digits churn, then settle left to right. */
function noise(text: string, churn: boolean[], number: boolean, intensity: number, t: number): string {
  const settled = Math.floor(t * text.length);
  const fringe = Math.max(1, Math.round(4 * intensity));
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (i < settled || !churn[i] || /\s/.test(ch)) out += ch;
    else if (number) out += Math.random() < intensity ? DIGITS[(Math.random() * 10) | 0] : ch;
    else out += i < settled + fringe ? GLYPHS[(Math.random() * GLYPHS.length) | 0] : " ";
  }
  return out;
}

/**
 * Scrambles `text` in `copy` over `host` for `ms`: a label (`from` unset) decodes, a number's characters that differ from `from`
 * churn. Returns what stops it. Nothing runs on a hidden page, for an empty text, past `TEXT_JOBS_MAX`, for a number that did not change,
 * or for a number past `NUMBER_STARTS_PER_S`. `done` runs when it ends, or at once when it does not start (a copy the caller added
 * comes out again either way).
 */
export function scrambleText(host: HTMLElement, copy: HTMLElement, text: string, opts: { ms: number; intensity: number; from?: string; done?: () => void }): () => void {
  const number = opts.from !== undefined;
  const chars = [...text];
  const churn = chars.map((ch, i) => (number ? /\d/.test(ch) && (opts.from!.length !== text.length || opts.from![i] !== ch) : true));
  const now = performance.now();
  if (!text || !room(host) || !churn.some(Boolean) || (number && !numberStart(now))) {
    opts.done?.();
    return () => {};
  }
  const joined = chars.join("");
  return begin(host, copy, opts.ms, (t) => noise(joined, churn, number, opts.intensity, t), { done: opts.done, now });
}

/** The roll's cells in the copy: each changed digit a reel from the old digit to the new one (index.css `app-mo-roll`), the rest as it is. */
function rollCopy(copy: HTMLElement, from: string, to: string): boolean {
  const cells = rollOf(from, to);
  if (!cells.some((c) => c.from !== undefined)) return false;
  copy.replaceChildren(
    ...cells.map((c) => {
      if (c.from === undefined) return document.createTextNode(c.ch);
      const cell = document.createElement("span");
      cell.setAttribute("data-mo-cell", "");
      const reel = document.createElement("span");
      reel.setAttribute("data-mo-reel", "");
      const a = document.createElement("span");
      a.textContent = c.from;
      const b = document.createElement("span");
      b.textContent = c.ch;
      reel.append(a, b);
      cell.append(reel);
      return cell;
    })
  );
  return true;
}

/**
 * A number that changed from `from` to `to`: a figure counts to the new reading (`tween`), any other text, or a `roll`, rolls its
 * changed digits; with a `mark`, it flashes or is underlined once. Returns what stops it. Nothing runs on a hidden page, past
 * `TEXT_JOBS_MAX` or `VALUE_STARTS_PER_S`; a mark past `FLASH_STARTS_PER_S` is left out, the run kept.
 */
export function valueText(host: HTMLElement, copy: HTMLElement, to: string, from: string, opts: { ms: number; style: ValueStyle; mark: ValueMark }): () => void {
  if (!to || to === from || !room(host)) return () => {};
  const now = performance.now();
  const count = opts.style === "tween" ? countOf(from, to) : undefined;
  if (!count && !rollOf(from, to).some((c) => c.from !== undefined)) return () => {};
  if (!valueStart(now)) return () => {};
  // a roll is drawn once and animated by CSS: no frame loop
  const stop = count ? begin(host, copy, opts.ms, (t) => countAt(count, t), { frame: COUNT_FRAME_MS, now }) : begin(host, copy, opts.ms, () => undefined, { now, timed: true });
  if (!count) rollCopy(copy, from, to);
  if (opts.mark !== "none" && flashStart(now)) {
    // the phosphor ghost is the old reading, drawn from this attribute (index.css)
    if (opts.mark === "phosphor") host.setAttribute("data-mo-was", from);
    host.setAttribute("data-mo-mark", opts.mark);
    setTimeout(() => {
      host.removeAttribute("data-mo-mark");
      host.removeAttribute("data-mo-was");
    }, Math.max(ONE_SHOT_MAX_MS, opts.ms) + 50);
  }
  return stop;
}

/**
 * A number's glitch: its text in the copy, torn by the label glitch's keyframes (index.css `app-mo-glitch`) for `ms`, while the real
 * value stays in the page under it, so neither it nor the width changes. Nothing on a hidden page, past `TEXT_JOBS_MAX`, or on a number
 * already running (its count or roll is left to finish).
 */
export function glitchValue(host: HTMLElement, ms: number): void {
  const copy = host.querySelector<HTMLElement>(":scope > [data-mo-copy]");
  const text = host.firstChild?.nodeType === 3 ? (host.firstChild.nodeValue ?? "") : "";
  if (!copy || !text || jobs.has(host) || !room(host)) return;
  begin(host, copy, ms, () => undefined, { timed: true, done: () => copy.removeAttribute("data-mo-glitch") });
  copy.textContent = text;
  copy.setAttribute("data-mo-glitch", "");
}

// ---- the boot ----------------------------------------------------------------------------------------------------------

/** A page's cards boot when the page's grid (or the studio's canvas, or the document) first draws them, and for this long after (cards that load late join in). */
export const BOOT_WINDOW_MS = 1500;
/** The last card of a boot starts at most this long after the first. */
export const BOOT_SPAN_MAX_MS = 1200;
const BOOT_SCOPE = "[data-page-grid], [data-studio-page]";
const booted = new WeakMap<Element, { start: number; n: number }>();
let batch: Card[] = [];

/** The cards that joined in one task, in page order (top to bottom, then left to right), each at its place in its page's boot. */
function flushBoot(): void {
  const list = batch;
  batch = [];
  const now = performance.now();
  const placed = list.filter((c) => c.el.isConnected && cards.has(c)).map((c) => ({ c, r: c.el.getBoundingClientRect() }));
  placed.sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left);
  for (const { c } of placed) {
    const scope = c.el.closest(BOOT_SCOPE) ?? document.documentElement;
    let page = booted.get(scope);
    if (!page) booted.set(scope, (page = { start: now, n: 0 }));
    else if (now - page.start > BOOT_WINDOW_MS) continue;
    if (hidden()) continue;
    runBoot(c, Math.min(BOOT_SPAN_MAX_MS, page.n++ * c.plan.boot!.stagger!));
  }
}

/** One card's boot after `delay` ms: its arrival (index.css `data-mo-boot`), the line across it and its title decoding. */
function runBoot(card: Card, delay: number): void {
  const { el, plan } = card;
  const boot = plan.boot!;
  el.style.setProperty("--mo-boot-delay", `${delay}ms`);
  el.setAttribute("data-mo-boot", boot.style ?? "fade");
  const layer = boot.line ? el.querySelector(":scope > [data-mo-layer]") : null;
  layer?.setAttribute("data-mo-boot-line", "");
  card.timers.push(
    setTimeout(() => {
      el.removeAttribute("data-mo-boot");
      el.style.removeProperty("--mo-boot-delay");
      layer?.removeAttribute("data-mo-boot-line");
    }, delay + boot.ms * 2 + 50)
  );
  if (boot.decode) {
    card.timers.push(
      setTimeout(() => {
        for (const host of el.querySelectorAll<HTMLElement>('[data-part="header"] [data-mo-text]')) {
          const copy = host.querySelector<HTMLElement>(":scope > [data-mo-copy]");
          const text = host.firstChild?.nodeType === 3 ? (host.firstChild.nodeValue ?? "") : "";
          if (copy && text) scrambleText(host, copy, text, { ms: plan.decode?.ms ?? MOTION_RULES.decode.def.ms!, intensity: boot.intensity });
        }
      }, delay)
    );
  }
}

// ---- the repeats --------------------------------------------------------------------------------------------------------

/** A card on the page: its element, what it draws, and the timers of its boot. */
interface Card {
  el: HTMLElement;
  plan: MotionPlan;
  timers: ReturnType<typeof setTimeout>[];
}

const cards = new Set<Card>();
const due: Partial<Record<Repeat, number>> = {};
let timer: ReturnType<typeof setTimeout> | undefined;
let lastRun = -Infinity;
let watching = false;

type Repeat = "glitch" | "flicker" | "sweep" | "tear";
const REPEATS: readonly Repeat[] = ["glitch", "flicker", "sweep", "tear"];
const periodOf = (card: Card, kind: Repeat): number => card.plan[kind]?.every ?? 0;
/** The texts a glitch tears: labels and titles, and the numbers (their copy: `glitchValue`). */
const TEXTS = '[data-part="label"], [data-part="header"]';
const NUMBERS = '[data-part="num"] [data-mo-text]';
/** The marks a glitch tears with the titles (`data-mo-tear`: the page rail's logo), by slicing and shifting the element itself. */
const MARKS = "[data-mo-tear]";
const tearable = (target: string | undefined) => (target === "value" ? NUMBERS : target === "all" ? `${TEXTS}, ${MARKS}, ${NUMBERS}` : `${TEXTS}, ${MARKS}`);
/** One glitch on a text: a label's or title's own (`data-mo-glitch`), a number's in its copy. */
const tear = (el: Element, ms: number) => (el.matches(NUMBERS) ? glitchValue(el as HTMLElement, ms) : pulse(el, "data-mo-glitch", ms));

/** Sets `attr` on `el` (to `value`) for `ms`, so the CSS runs its animation once (a run already going is left to finish). */
function pulse(el: Element, attr: string, ms: number, value = ""): void {
  if (el.hasAttribute(attr)) return;
  el.setAttribute(attr, value);
  setTimeout(() => el.removeAttribute(attr), ms + 50);
}

/** One run of a repeat on one card. */
function run(card: Card, kind: Repeat): void {
  const { el, plan } = card;
  if (kind === "glitch") {
    const texts = [...el.querySelectorAll(tearable(plan.glitch!.target))];
    const one = texts[(Math.random() * texts.length) | 0];
    if (one) tear(one, plan.glitch!.ms);
  } else if (kind === "flicker") {
    const target = plan.flicker!.target === "label" ? [...el.querySelectorAll('[data-part="label"]')] : [el];
    const one = target[(Math.random() * target.length) | 0];
    if (one) pulse(one, "data-mo-flicker", FLICKER_MS);
  } else if (kind === "tear") {
    // the card's content, split at 25 to 75 % of its height and shifted 6 to 14 px either way
    const body = el.querySelector<HTMLElement>("[data-mo-body]") ?? el;
    if (body.hasAttribute("data-mo-torn")) return;
    body.style.setProperty("--mo-tear-at", `${Math.round(25 + Math.random() * 50)}%`);
    body.style.setProperty("--mo-tear-dx", `${Math.round((6 + Math.random() * 8) * (Math.random() < 0.5 ? -1 : 1) * plan.tear!.intensity)}px`);
    body.style.setProperty("--mo-tear-ms", `${plan.tear!.ms}ms`);
    pulse(body, "data-mo-torn", plan.tear!.ms);
    // the split and the shift go with the run, so the card's markup is as it was
    setTimeout(() => {
      for (const v of ["--mo-tear-at", "--mo-tear-dx", "--mo-tear-ms"]) body.style.removeProperty(v);
      if (!body.getAttribute("style")) body.removeAttribute("style");
    }, plan.tear!.ms + 60);
  } else {
    const layer = el.querySelector("[data-mo-layer]");
    if (layer) pulse(layer, "data-mo-sweep", plan.sweep!.ms, plan.sweep!.style ?? "band");
  }
}

/** The next time each repeat runs: its shortest period on the page, give or take 30 %. */
const jitter = (seconds: number) => seconds * 1000 * (0.7 + Math.random() * 0.6);

function schedule(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  if (!cards.size || hidden()) return;
  const now = performance.now();
  let next = Infinity;
  for (const kind of REPEATS) {
    const periods = [...cards].map((c) => periodOf(c, kind)).filter((s) => s > 0);
    if (!periods.length) {
      delete due[kind];
      continue;
    }
    due[kind] ??= now + jitter(Math.min(...periods));
    next = Math.min(next, due[kind]!);
  }
  if (next < Infinity) timer = setTimeout(tick, Math.max(0, next - now));
}

function tick(): void {
  timer = undefined;
  const now = performance.now();
  const kind = REPEATS.filter((k) => due[k] !== undefined).sort((a, b) => due[a]! - due[b]!)[0];
  if (kind && due[kind]! <= now) {
    if (now - lastRun < MOTION_GAP_MS) due[kind] = lastRun + MOTION_GAP_MS;
    else {
      const holders = [...cards].filter((c) => periodOf(c, kind) > 0 && c.el.isConnected);
      const card = holders[(Math.random() * holders.length) | 0];
      if (card) run(card, kind);
      lastRun = now;
      delete due[kind];
    }
  }
  schedule();
}

function watchVisibility(): void {
  if (watching || typeof document === "undefined") return;
  watching = true;
  // a hidden page runs nothing; back in view, each repeat waits a period again rather than catching up
  document.addEventListener("visibilitychange", () => {
    if (hidden()) for (const k of REPEATS) delete due[k];
    schedule();
  });
}

/**
 * Puts a card on the page's motion: its glitch tears its texts once now, its boot joins its page's (in page order, once per page),
 * its repeats join the page's timer. Returns what takes it off.
 */
export function addMotionCard(el: HTMLElement, plan: MotionPlan): () => void {
  const card: Card = { el, plan, timers: [] };
  cards.add(card);
  watchVisibility();
  if (plan.glitch && !hidden()) for (const t of el.querySelectorAll(tearable(plan.glitch.target))) tear(t, plan.glitch.ms);
  if (plan.boot) {
    batch.push(card);
    if (batch.length === 1) queueMicrotask(flushBoot);
  }
  schedule();
  return () => {
    cards.delete(card);
    for (const t of card.timers) clearTimeout(t);
    if (card.timers.length) {
      el.removeAttribute("data-mo-boot");
      el.style.removeProperty("--mo-boot-delay");
    }
    schedule();
  };
}

/** Tests: how many cards and texts are on the motion now, and whether the timer is set. */
export const motionState = () => ({ cards: cards.size, texts: jobs.size, timer: timer !== undefined });

