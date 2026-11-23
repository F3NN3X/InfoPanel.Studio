// Cyberspec's effect script, after the kit's HUD (Cyberspec by Agnel Nieves, MIT): targeting brackets that trace in round a card as
// it arrives and fade, a slow scan band down each card whose leading edge lights the texts it crosses, and a pulse round a card in
// warning or crisis. It reads only fx.signals() and draws only through fx.draw(), in palette indices, so a variant recolours it.
// Calm keeps the brackets (they play once) and runs the band on every other card at half speed; the app runs nothing at Off.

// palette indices: the theme's own colours (accent, warn, crit)
const ACCENT = 0;
const WARN = 4;
const CRIT = 5;

// the brackets: trace in, hold, fade (ms); arm length and how far outside the card they sit (px); the stagger between cards (ms)
const TRACE = 420;
const HOLD = 900;
const FADE = 500;
const ARM = 12;
const OUT = 3;
const STAGGER = 45;
// the band: one pass down a card every PASS ms at Full (twice that at Calm), at most BAND px tall
const PASS = 7000;
const BAND = 28;
// the pulse: one breath every so many ms at Full (twice that at Calm)
const PULSE = { warn: 2400, crit: 1400 };

/** Each card seen, by its box: when it arrived (its brackets start) and where its band starts; `cards` is the same, in the signals' order. */
let known = new Map();
let cards = [];
let last = null;

const keyOf = (c) => `${c.x},${c.y},${c.w},${c.h}`;

/** New signals: a card whose box was not there before has just arrived. */
function arrive(signals, t) {
  const next = new Map();
  let fresh = 0;
  cards = signals.cards.map((c) => {
    const key = keyOf(c);
    const card = known.get(key) ?? { at: t + Math.min(fresh++, 12) * STAGGER, phase: fx.rand() };
    next.set(key, card);
    return card;
  });
  known = next;
}

const ease = (p) => 1 - (1 - p) * (1 - p) * (1 - p);

/** The four brackets round a box, `len` px along each arm. */
function brackets(list, c, len, alpha) {
  const l = c.x - OUT;
  const r = c.x + c.w + OUT;
  const top = c.y - OUT;
  const b = c.y + c.h + OUT;
  for (const [x, y, dx, dy] of [
    [l, top, 1, 1],
    [r, top, -1, 1],
    [l, b, 1, -1],
    [r, b, -1, -1],
  ]) {
    list.push({ op: "path", points: [x, y + dy * len, x, y, x + dx * len, y], close: false, stroke: ACCENT, width: 1, alpha });
  }
}

/** The band: a soft trail and a bright leading edge, held to the card; the edge lights the texts it crosses (Full only). */
function band(list, c, i, t, calm, phase) {
  const pass = calm ? PASS * 2 : PASS;
  const h = Math.min(BAND, c.h * 0.25);
  const edge = c.y + (((t / pass + phase) % 1) * (c.h + h));
  const top = Math.max(c.y, edge - h);
  const bottom = Math.min(c.y + c.h, edge);
  if (bottom - top < 1) return;
  list.push({ op: "rect", x: c.x, y: top, w: c.w, h: bottom - top, fill: ACCENT, alpha: 0.05 });
  if (edge <= c.y + c.h) list.push({ op: "rect", x: c.x, y: edge - 1, w: c.w, h: 1, fill: ACCENT, alpha: 0.22 });
  if (calm) return;
  for (let k = 0; k < c.texts.length; k++) {
    const b = c.texts[k];
    if (edge >= b.y && edge - h <= b.y + b.h) list.push({ op: "glyph", card: i, text: k, fill: ACCENT, alpha: 0.1 });
  }
}

/** The pulse: an outline that breathes in the state's colour. */
function pulse(list, c, t, calm) {
  const period = PULSE[c.state] * (calm ? 2 : 1);
  const breath = 0.5 - 0.5 * Math.cos((2 * Math.PI * (t % period)) / period);
  list.push({ op: "rect", x: c.x + 1, y: c.y + 1, w: c.w - 2, h: c.h - 2, stroke: c.state === "crit" ? CRIT : WARN, width: 1.5, alpha: 0.15 + 0.4 * breath });
}

fx.onFrame((t) => {
  const s = fx.signals();
  if (s !== last) {
    arrive(s, t);
    last = s;
  }
  const calm = s.level === "calm";
  const list = [];
  for (let i = 0; i < s.cards.length; i++) {
    const c = s.cards[i];
    const card = cards[i];
    const age = t - card.at;
    if (age >= 0 && age < TRACE + HOLD + FADE) {
      const alpha = age < TRACE + HOLD ? 0.85 : 0.85 * (1 - (age - TRACE - HOLD) / FADE);
      brackets(list, c, ARM * ease(Math.min(1, age / TRACE)), alpha);
    }
    if (!calm || i % 2 === 0) band(list, c, i, t, calm, card.phase);
    if (c.state === "warn" || c.state === "crit") pulse(list, c, t, calm);
  }
  fx.draw(list);
});
