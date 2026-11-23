// What draws a pack's motion (L117): one animation-frame loop for every text that scrambles and one timer for every repeat on
// the page, written straight to the DOM, so no effect renders React. The text a scramble covers stays in the page and in the
// accessibility tree (the host's own text, its ink hidden for the run); the noise is in an aria-hidden copy laid over it, so the
// line never changes width. The CSS that answers each attribute is index.css's (`app-mo-*`). Nothing runs while the page is hidden.
import { MOTION_GAP_MS, type MotionPlan } from "./motion";

/** Noise for a label (the kit's set) and for a number (digits, so a figure stays a figure). */
const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&/<>[]{}=+*";
const DIGITS = "0123456789";
/** At most this many texts scramble at once; past it a text simply shows (a page switch on a full screen). */
export const TEXT_JOBS_MAX = 24;
/** The noise changes at most this often, ms (about 30 a second). */
const FRAME_MS = 33;
/** A flicker run: two dips in this many ms. */
export const FLICKER_MS = 600;

const hidden = () => typeof document !== "undefined" && document.hidden;

interface Job {
  host: HTMLElement;
  copy: HTMLElement;
  text: string;
  /** Which characters churn (a number: those that changed). */
  churn: boolean[];
  number: boolean;
  start: number;
  ms: number;
  intensity: number;
  last: number;
}

const jobs = new Set<Job>();
let frame = 0;

const end = (job: Job) => {
  jobs.delete(job);
  job.host.removeAttribute("data-mo-on");
  job.copy.textContent = "";
};

function noise(job: Job, t: number): string {
  const { text, churn, number, intensity } = job;
  // a label decodes left to right with a short fringe of noise ahead of the wave and blanks beyond; a number's changed digits churn, then settle left to right
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

function step(now: number) {
  frame = 0;
  for (const job of jobs) {
    if (!job.host.isConnected) {
      end(job);
      continue;
    }
    const t = (now - job.start) / job.ms;
    if (t >= 1) end(job);
    else if (now - job.last >= FRAME_MS) {
      job.last = now;
      job.copy.textContent = noise(job, Math.max(0, t));
    }
  }
  if (jobs.size) frame = requestAnimationFrame(step);
}

/**
 * Scrambles `text` in `copy` over `host` for `ms`: a label (`from` unset) decodes, a number's characters that differ from `from`
 * churn. Returns what stops it. Nothing runs on a hidden page, for an empty text, past `TEXT_JOBS_MAX`, or for a number that did not change.
 */
export function scrambleText(host: HTMLElement, copy: HTMLElement, text: string, opts: { ms: number; intensity: number; from?: string }): () => void {
  const number = opts.from !== undefined;
  const churn = [...text].map((ch, i) => (number ? /\d/.test(ch) && (opts.from!.length !== text.length || opts.from![i] !== ch) : true));
  if (hidden() || !text || jobs.size >= TEXT_JOBS_MAX || typeof requestAnimationFrame === "undefined" || !churn.some(Boolean)) return () => {};
  const now = performance.now();
  const job: Job = { host, copy, text: [...text].join(""), churn, number, start: now, ms: opts.ms, intensity: opts.intensity, last: now };
  jobs.add(job);
  host.setAttribute("data-mo-on", "");
  copy.textContent = noise(job, 0);
  if (!frame) frame = requestAnimationFrame(step);
  return () => {
    if (jobs.has(job)) end(job);
  };
}

/** A card on the page: its element and what it draws. */
interface Card {
  el: HTMLElement;
  plan: MotionPlan;
}

const cards = new Set<Card>();
const due: Partial<Record<Repeat, number>> = {};
let timer: ReturnType<typeof setTimeout> | undefined;
let lastRun = -Infinity;
let watching = false;

type Repeat = "glitch" | "flicker" | "sweep";
const REPEATS: readonly Repeat[] = ["glitch", "flicker", "sweep"];
const periodOf = (card: Card, kind: Repeat): number => card.plan[kind]?.every ?? 0;
/** The texts a glitch tears: labels and titles. */
const TEXTS = '[data-part="label"], [data-part="header"]';

/** Sets `attr` on `el` for `ms`, so the CSS runs its animation once (a run already going is left to finish). */
function pulse(el: Element, attr: string, ms: number): void {
  if (el.hasAttribute(attr)) return;
  el.setAttribute(attr, "");
  setTimeout(() => el.removeAttribute(attr), ms + 50);
}

/** One run of a repeat on one card. */
function run(card: Card, kind: Repeat): void {
  const { el, plan } = card;
  if (kind === "glitch") {
    const texts = [...el.querySelectorAll(TEXTS)];
    const one = texts[(Math.random() * texts.length) | 0];
    if (one) pulse(one, "data-mo-glitch", plan.glitch!.ms);
  } else if (kind === "flicker") {
    const target = plan.flicker!.target === "label" ? [...el.querySelectorAll('[data-part="label"]')] : [el];
    const one = target[(Math.random() * target.length) | 0];
    if (one) pulse(one, "data-mo-flicker", FLICKER_MS);
  } else {
    const layer = el.querySelector("[data-mo-layer]");
    if (layer) pulse(layer, "data-mo-sweep", plan.sweep!.ms);
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

/** Puts a card on the page's motion: its glitch tears its texts once now, its repeats join the page's timer. Returns what takes it off. */
export function addMotionCard(el: HTMLElement, plan: MotionPlan): () => void {
  const card: Card = { el, plan };
  cards.add(card);
  watchVisibility();
  if (plan.glitch && !hidden()) for (const t of el.querySelectorAll(TEXTS)) pulse(t, "data-mo-glitch", plan.glitch.ms);
  schedule();
  return () => {
    cards.delete(card);
    schedule();
  };
}

/** Tests: how many cards and texts are on the motion now, and whether the timer is set. */
export const motionState = () => ({ cards: cards.size, texts: jobs.size, timer: timer !== undefined });
