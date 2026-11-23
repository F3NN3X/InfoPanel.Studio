// The demo pack script: a few particles rising over each card and a scan line that sweeps it, brighter as the card's value
// rises and in the warn or crit colour past its threshold. It reads only fx.signals() and draws only through fx.draw().
const particles = [];
const ACCENT = 0;
const WARN = 4;
const CRIT = 5;

const spawn = (card) => ({ x: card.x + fx.rand() * card.w, y: card.y + card.h, v: 0.3 + fx.rand() * 0.7, r: 1 + fx.rand() * 1.5 });

fx.onFrame((t) => {
  const s = fx.signals();
  const cmds = [];
  s.cards.forEach((card, i) => {
    const tone = card.state === "crit" ? CRIT : card.state === "warn" ? WARN : ACCENT;
    const strength = card.value === null ? 0.5 : 0.3 + card.value * 0.7;
    // the scan line: one pass every four seconds, offset per card
    const y = card.y + ((t / 4000 + i * 0.17) % 1) * card.h;
    cmds.push({ op: "rect", x: card.x, y, w: card.w, h: 2, fill: tone, alpha: 0.25 * strength });
    // the texts it crosses light for a moment: their boxes only, never their characters
    card.texts.forEach((b, k) => {
      if (Math.abs(y - (b.y + b.h / 2)) < b.h) cmds.push({ op: "glyph", card: i, text: k, fill: tone, alpha: 0.12 });
    });
    if (s.level === "calm") return;
    particles[i] ??= Array.from({ length: 6 }, () => spawn(card));
    particles[i] = particles[i].map((q) => {
      const p = q.y - q.v * 2 < card.y ? spawn(card) : { ...q, y: q.y - q.v * 2 };
      cmds.push({ op: "arc", x: p.x, y: p.y, r: p.r, fill: tone, alpha: 0.5 * strength });
      return p;
    });
  });
  fx.draw(cmds);
});
