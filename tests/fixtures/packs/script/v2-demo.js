// The effect-script API v2 demo: one use of every drawing primitive added after the first four shapes. Gradients (linear, radial,
// alpha stops), dashed lines with caps, joins and a moving phase, a glow, the composite modes, a clip to the card, text boxes
// highlighted, underlined and wiped (boxes only), 500 particles in one `points` command, and a reaction to a card's event.
const ACCENT = 0;
const INFO = 6;
const WARN = 4;
const SPARKS = 500;
const sparks = Array.from({ length: SPARKS }, () => ({ x: fx.rand(), y: fx.rand(), v: 0.0002 + fx.rand() * 0.0006 }));
const flash = new Map();
let seen = null;

fx.onFrame((t) => {
  const s = fx.signals();
  const list = [];
  if (s !== seen) {
    seen = s;
    s.cards.forEach((c, i) => {
      if (c.event && (c.event.arrived || c.event.value || c.event.state)) flash.set(i, t);
    });
  }
  s.cards.forEach((c, i) => {
    // a scan reveal: a gradient band with a bright leading edge, clipped to the card
    const y = c.y + ((t / 3000 + i / 7) % 1) * c.h;
    list.push({ op: "clip", card: i });
    list.push({ op: "gradient", id: 0, x0: 0, y0: y - 40, x1: 0, y1: y, stops: [[0, ACCENT, 0], [1, ACCENT, 0.25]] });
    list.push({ op: "rect", x: c.x, y: y - 40, w: c.w, h: 40, fillGrad: 0 });
    list.push({ op: "style", mode: "screen" });
    list.push({ op: "rect", x: c.x, y, w: c.w, h: 1, fill: ACCENT, alpha: 0.8 });
    list.push({ op: "style" });
    // a radial bloom in the corner
    list.push({ op: "gradient", id: 1, x0: c.x + c.w, y0: c.y, r0: 0, x1: c.x + c.w, y1: c.y, r1: 60, stops: [[0, INFO, 0.35], [1, INFO, 0]] });
    list.push({ op: "arc", x: c.x + c.w, y: c.y, r: 60, fillGrad: 1 });
    list.push({ op: "unclip" });
    // a circuit trace: dashed, round caps and joins, its phase moving, with a glow
    list.push({ op: "style", dash: [6, 4], phase: -t / 40, cap: "round", join: "round", blur: 6, glow: ACCENT, mode: "lighter" });
    list.push({ op: "path", points: [c.x + 8, c.y + c.h - 8, c.x + 40, c.y + c.h - 8, c.x + 52, c.y + c.h - 20, c.x + c.w - 8, c.y + c.h - 20], close: false, stroke: ACCENT, alpha: 0.7, width: 2 });
    list.push({ op: "style" });
    // the text boxes: the first lit, the second underlined, the number wiped in by the card's value
    if (c.texts[0]) list.push({ op: "textbox", card: i, text: 0, kind: "highlight", fill: ACCENT, alpha: 0.08, pad: 2 });
    if (c.texts[1]) list.push({ op: "textbox", card: i, text: 1, kind: "underline", fill: ACCENT, alpha: 0.6, width: 1, pad: 1 });
    if (c.texts[2]) list.push({ op: "textbox", card: i, text: 2, kind: "wipe", p: c.value || 0, side: "left", fill: WARN, alpha: 0.15 });
    // a card that just changed flashes its frame for 300 ms
    const at = flash.get(i);
    if (at !== undefined && t - at < 300) list.push({ op: "rect", x: c.x, y: c.y, w: c.w, h: c.h, stroke: c.event && c.event.state === "crit" ? 5 : ACCENT, alpha: 1 - (t - at) / 300, width: 2 });
  });
  // particles drifting up the whole screen: all of them are one command
  if (s.level === "full") {
    const pts = [];
    for (const p of sparks) {
      p.y = (p.y - p.v * 16 + 1) % 1;
      pts.push(p.x * s.width, p.y * s.height);
    }
    list.push({ op: "points", points: pts, r: 1.2, fill: ACCENT, alpha: 0.5 });
  }
  fx.draw(list);
});
