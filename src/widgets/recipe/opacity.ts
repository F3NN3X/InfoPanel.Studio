// Opacity steps on a recipe's text (format 2, builder audit G22): the owner's condition was "no opacity until a contrast check exists",
// so a text is never drawn under 4.5:1 on the card it sits on. The check is the app's own (`contrastOf` in looks/status.ts, the one
// that darkens accent text on light cards): at render time a faded text takes the lowest step from the one asked for that keeps every
// colour it draws at 4.5:1, on the active Look and surface. A mark (a ring's arc, a bar, a sparkline, heatmap cells) takes its step as
// it is. Colours are read as the browser computes them, so any CSS colour a Look writes is read the one way.
import { contrastOf } from "@/looks/status";
import type { OpacityStep } from "./types";

/** The steps a text may be raised through, lowest first; 100 is unset. */
export const OPACITY_STEPS = [40, 60, 80, 100] as const;
export type DrawnStep = OpacityStep | 100;
/** Text holds this on its card (the pack validator's `TEXT_MIN`, the chrome's page text, `accentInk`'s default). */
const TEXT_MIN = 4.5;

/** A colour as drawn: its 0-255 channels and its alpha. */
export interface Ink {
  rgb: readonly [number, number, number];
  alpha: number;
}

const hex = (c: readonly number[]): string => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
/** `ink` laid over `ground` at `alpha` (0-1). */
const over = (ink: readonly number[], alpha: number, ground: readonly number[]): [number, number, number] => [0, 1, 2].map((k) => ink[k] * alpha + ground[k] * (1 - alpha)) as [number, number, number];

/**
 * The step a text is drawn at: the lowest from `want` up at which every ink, laid over `ground` at its own alpha times the step,
 * holds 4.5:1 on it. 100 when none does (a text that is under 4.5:1 even whole is drawn as it is today, never fainter).
 */
export function readableStep(want: DrawnStep, inks: readonly Ink[], ground: readonly [number, number, number]): DrawnStep {
  const fits = (step: number) => inks.every((i) => (contrastOf(hex(over(i.rgb, (i.alpha * step) / 100, ground)), hex(ground)) ?? 0) >= TEXT_MIN);
  return OPACITY_STEPS.find((step) => step >= want && fits(step)) ?? 100;
}

/** A computed colour, as a browser gives it: an rgb or rgba function, or `color(srgb r g b / a)` (a `color-mix` in srgb); undefined for any other form. */
export function inkOf(value: string): Ink | undefined {
  const v = value.trim();
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(v);
  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i.exec(v);
  const m = rgb ?? srgb;
  if (!m) return v === "transparent" ? { rgb: [0, 0, 0], alpha: 0 } : undefined;
  const a = m[4];
  const alpha = a === undefined ? 1 : a.endsWith("%") ? parseFloat(a) / 100 : Number(a);
  return { rgb: [1, 2, 3].map((k) => Number(m[k]) * (srgb ? 255 : 1)) as [number, number, number], alpha };
}

/**
 * The colours `computed` has read, by value and the card's colour scheme. Reading one adds a probe to the card and forces a style
 * pass, and `drawnStep` runs after every render: with live data re-rendering the stage on each reading, the probes cost more than a
 * slow machine has between readings, the readings queued up and a click waited behind them for seconds (seen on CI, run 44196588297).
 * A card's colour values change with the Look, not the reading, so each is read once. A value that names `currentColor` is read
 * each time: it depends on the card's own text colour.
 */
const seen = new Map<string, Ink | undefined>();

/** A CSS colour (a custom property's value: hex, an hsl function, a `color-mix`) as the browser computes it, read in the card. */
function computed(card: HTMLElement, value: string, scheme: string): Ink | undefined {
  if (!value.trim()) return undefined;
  const key = /currentcolor/i.test(value) ? undefined : `${value}|${scheme}`;
  if (key !== undefined && seen.has(key)) return seen.get(key);
  const ink = probed(card, value);
  if (key !== undefined) seen.set(key, ink);
  return ink;
}

function probed(card: HTMLElement, value: string): Ink | undefined {
  const probe = document.createElement("span");
  probe.style.display = "none";
  probe.style.color = value;
  if (!probe.style.color) return undefined;
  card.append(probe);
  const ink = inkOf(getComputedStyle(probe).color);
  probe.remove();
  return ink;
}

/**
 * The step `el`'s text is drawn at on the card it is in: the card's flat colour (its material's export colour, else its fill), with
 * every background between the card and the text laid over it (a nested card's track or raised surface), against each colour a text
 * of `el` draws in. Anything it cannot read (a gradient, a colour space it does not know, a see-through card) draws the text whole.
 */
export function drawnStep(el: HTMLElement, want: DrawnStep): DrawnStep {
  const card = el.closest<HTMLElement>("[data-part='card']");
  if (!card || want === 100) return 100;
  const cs = getComputedStyle(card);
  const face = ["--w-mat-export", "--w-fill"].map((name) => computed(card, cs.getPropertyValue(name), cs.colorScheme)).find((c) => c && c.alpha >= 0.5);
  if (!face) return 100;
  let ground = face.rgb;
  const between: HTMLElement[] = [];
  for (let p = el.parentElement; p && p !== card; p = p.parentElement) between.push(p);
  for (const p of between.reverse()) {
    const bg = inkOf(getComputedStyle(p).backgroundColor);
    if (!bg) return 100;
    if (bg.alpha > 0) ground = over(bg.rgb, bg.alpha, ground);
  }
  const inks: Ink[] = [];
  for (const t of [el, ...el.querySelectorAll<HTMLElement>("*")]) {
    if (![...t.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())) continue;
    const ink = inkOf(getComputedStyle(t).color);
    if (!ink) return 100;
    inks.push(ink);
  }
  return readableStep(want, inks, ground);
}
