// Cyberspec's effect script, after the kit's HUD (Cyberspec by Agnel Nieves, MIT), on the v2 drawing API. Each card that arrives is
// scanned in (a band with a bright leading edge wipes down it, clipped to the card) while targeting brackets trace in round it; a
// circuit trace streams along the foot of every other card like the hex-stat's; a card whose state turns warn or crit bursts a stream
// of data points off its edge and breathes an outline in that colour; a value that moves shows a chevron in its corner. Over the page a
// slow scan bar passes, its edge lighting the text boxes it crosses. It reads only fx.signals() and draws only through fx.draw(), in
// palette indices, so a variant recolours it. Calm keeps the arrivals (they play once) and the pulse, runs the bar at half speed and
// drops the traces, bursts and chevrons.

// palette indices: the theme's own colours
const ACCENT = 0;
const WARN = 4;
const CRIT = 5;
const INFO = 6;

// arrival: the scan wipe and the brackets (ms), the bracket arm and how far outside the card it sits (px), the stagger between cards
const SCAN = 560;
const TRACE = 420;
const HOLD = 900;
const FADE = 500;
const ARM = 12;
const OUT = 3;
const STAGGER = 45;
// the page's scan bar: one pass every BAR ms at Full (twice that at Calm), BAR_H px of trail
const BAR = 9000;
const BAR_H = 64;
// the circuit trace's dash and how fast it streams (px a second)
const DASH = [10, 22];
const STREAM = 36;
// a state burst: how long, how many points; the pulse: one breath every so many ms
const BURST = 700;
const SPARKS = 28;
const PULSE = { warn: 2400, crit: 1400 };
// a value's chevron (ms)
const CHEVRON = 600;

/** Per card, in the signals' order: when it arrived, its burst (start, tone, seeds) and its last value move. */
let cards = [];
let last = null;

const ease = (p) => 1 - (1 - p) * (1 - p) * (1 - p);

/** New signals: read each card's event once. A card with no state yet starts with none. */
function react(signals, t) {
  let fresh = 0;
  cards = signals.cards.map((c, i) => {
    const was = cards[i] ?? { at: -1e9, burst: null, move: null };
    const e = c.event;
    if (!e) return was;
    const next = { ...was };
    if (e.arrived) next.at = t + Math.min(fresh++, 12) * STAGGER;
    if (e.state === "warn" || e.state === "crit") next.burst = { at: t, tone: e.state === "crit" ? CRIT : WARN, seed: Array.from({ length: SPARKS }, () => [fx.rand(), fx.rand()]) };
    if (e.value && !e.arrived) next.move = { at: t, up: e.value === "up" };
    return next;
  });
}

/** The four brackets round a box, `len` px along each arm. */
function brackets(list, c, len, alpha) {
  const l = c.x - OUT;
  const r = c.x + c.w + OUT;
  const top = c.y - OUT;
  const b = c.y + c.h + OUT;
  for (const [x, y, dx, dy] of [[l, top, 1, 1], [r, top, -1, 1], [l, b, 1, -1], [r, b, -1, -1]]) {
    list.push({ op: "path", points: [x, y + dy * len, x, y, x + dx * len, y], close: false, stroke: ACCENT, width: 1, alpha });
  }
}

/** The arrival scan: a band fading in behind a bright 1 px edge, wiping down the card once. */
function scan(list, c, i, p) {
  const y = c.y + ease(p) * c.h;
  const h = Math.min(48, c.h * 0.3);
  list.push({ op: "clip", card: i });
  list.push({ op: "gradient", id: 0, x0: 0, y0: y - h, x1: 0, y1: y, stops: [[0, ACCENT, 0], [1, ACCENT, 0.22]] });
  list.push({ op: "rect", x: c.x, y: y - h, w: c.w, h, fillGrad: 0 });
  list.push({ op: "rect", x: c.x, y: y - 1, w: c.w, h: 1, fill: INFO, alpha: 0.8 * (1 - p) + 0.2 });
  list.push({ op: "unclip" });
}

/** The circuit trace at a card's foot: a stepped line whose dashes stream along it. */
function trace(list, c, t) {
  const y = c.y + c.h - 6;
  const x0 = c.x + 8;
  const x1 = c.x + Math.min(c.w - 8, 160);
  list.push({ op: "style", dash: DASH, phase: -(t / 1000) * STREAM, cap: "square" });
  list.push({ op: "path", points: [x0, y - 10, x0 + 12, y - 10, x0 + 20, y, x1, y], close: false, stroke: INFO, alpha: 0.35, width: 1 });
  list.push({ op: "style" });
}

/** A state burst: data points thrown off the card's top edge, falling back as they fade. */
function burst(list, c, b, t) {
  const p = (t - b.at) / BURST;
  if (p >= 1) return false;
  const pts = [];
  for (const [u, v] of b.seed) pts.push(c.x + u * c.w, c.y - ease(p) * (8 + v * 26) + p * p * 18);
  list.push({ op: "points", points: pts, r: 1.5, shape: "square", fill: b.tone, alpha: 0.9 * (1 - p) });
  return true;
}

/** The pulse: an outline that breathes in the state's colour. */
function pulse(list, c, t, calm) {
  const period = PULSE[c.state] * (calm ? 2 : 1);
  const breath = 0.5 - 0.5 * Math.cos((2 * Math.PI * (t % period)) / period);
  list.push({ op: "rect", x: c.x + 1, y: c.y + 1, w: c.w - 2, h: c.h - 2, stroke: c.state === "crit" ? CRIT : WARN, width: 1.5, alpha: 0.15 + 0.4 * breath });
}

/** A value's chevron in the card's top-right corner, pointing the way it moved. */
function chevron(list, c, m, t) {
  const p = (t - m.at) / CHEVRON;
  if (p >= 1) return false;
  const x = c.x + c.w - 16;
  const y = c.y + 14 + (m.up ? -4 : 4) * ease(p);
  const d = m.up ? -3 : 3;
  list.push({ op: "path", points: [x - 4, y - d, x, y + d, x + 4, y - d], close: false, stroke: m.up ? INFO : WARN, width: 1.5, alpha: 1 - p });
  return true;
}

/** The page's scan bar: a soft trail and a bright edge down the whole screen; at Full the edge lights the text boxes it crosses. */
function bar(list, s, t, calm) {
  const edge = ((t / (calm ? BAR * 2 : BAR)) % 1) * (s.height + BAR_H);
  list.push({ op: "gradient", id: 1, x0: 0, y0: edge - BAR_H, x1: 0, y1: edge, stops: [[0, ACCENT, 0], [1, ACCENT, 0.05]] });
  list.push({ op: "rect", x: 0, y: edge - BAR_H, w: s.width, h: BAR_H, fillGrad: 1 });
  list.push({ op: "rect", x: 0, y: edge - 1, w: s.width, h: 1, fill: ACCENT, alpha: 0.14 });
  if (calm) return;
  s.cards.forEach((c, i) => {
    for (let k = 0; k < c.texts.length; k++) {
      const b = c.texts[k];
      if (edge >= b.y && edge - 12 <= b.y + b.h) list.push({ op: "glyph", card: i, text: k, fill: ACCENT, alpha: 0.1 });
    }
  });
}

fx.onFrame((t) => {
  const s = fx.signals();
  if (s !== last) {
    react(s, t);
    last = s;
  }
  const calm = s.level === "calm";
  const list = [];
  bar(list, s, t, calm);
  for (let i = 0; i < s.cards.length; i++) {
    const c = s.cards[i];
    const card = cards[i];
    if (!card) continue;
    const age = t - card.at;
    if (age >= 0 && age < SCAN) scan(list, c, i, age / SCAN);
    if (age >= 0 && age < TRACE + HOLD + FADE) brackets(list, c, ARM * ease(Math.min(1, age / TRACE)), age < TRACE + HOLD ? 0.85 : 0.85 * (1 - (age - TRACE - HOLD) / FADE));
    if (c.state === "warn" || c.state === "crit") pulse(list, c, t, calm);
    if (calm) continue;
    if (i % 2 === 0 && c.h >= 120) trace(list, c, t);
    if (card.burst && !burst(list, c, card.burst, t)) card.burst = null;
    if (card.move && !chevron(list, c, card.move, t)) card.move = null;
  }
  fx.draw(list);
});
