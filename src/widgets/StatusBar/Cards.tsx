import { Fragment, type CSSProperties } from "react";
import { Num, Ring, RingStack, TONES, hue, fmt } from "../kit";
import { lineSize, rowCount, rowPx, sizeOf, type Accent, type Card, type CardRow } from "./card-model";

/** The three accents follow the theme's: the first is the accent itself, the others turn its hue. */
const ACCENT: Record<Accent, string> = { 1: TONES.ok, 2: hue(55), 3: hue(-70) };

/** The inner ring's colour by temperature: yellow, then the warn and crit tones. */
const heatOf = (c: number): string => (c >= 80 ? TONES.crit : c >= 60 ? TONES.warn : "#FFD60A");

const caption = (color: string, px: number): CSSProperties => ({ color, fontSize: px, fontWeight: 700, letterSpacing: "0.05em", lineHeight: 1.1 });
const quiet = (px: number): CSSProperties => ({ color: "var(--w-muted)", fontSize: px, lineHeight: 1.1 });

/** The label with the temperature big under it, and optionally a small line. */
function Lines({ label, accent, temp, small, end, u }: { label: string; accent: Accent; temp?: string; small?: string; end: boolean; u: number }) {
  const z = sizeOf(u);
  return (
    <div className="flex min-w-0 flex-col justify-center whitespace-nowrap" style={{ textAlign: end ? "right" : "left" }}>
      <span style={caption(ACCENT[accent], z.cap)}>{label}</span>
      {temp && <Num style={{ fontSize: z.big, lineHeight: 1.05 }}>{temp}</Num>}
      {small && <span style={quiet(z.small)}>{small}</span>}
    </div>
  );
}

/** A thin bar that fills to `pct` in the card's accent. */
function Thin({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-[2px] w-full overflow-hidden rounded-full bg-[color:var(--w-track)]">
      <div className="h-full w-full origin-left rounded-full transition-transform duration-500" style={{ background: color, transform: `scaleX(${Math.min(1, Math.max(0, pct / 100))})` }} />
    </div>
  );
}

function Rows({ rows, color, u }: { rows: CardRow[]; color: string; u: number }) {
  const z = sizeOf(u);
  return (
    <div className="flex min-w-0 flex-col justify-center" style={{ gap: Math.max(2, u * 0.03) }}>
      {rows.map((r) => (
        <div key={r.label} className="flex min-w-0 flex-col whitespace-nowrap" style={{ gap: 1 }}>
          <div className="flex items-baseline justify-between" style={{ gap: z.gap, fontSize: rowPx(u), lineHeight: 1.1 }}>
            <span style={{ color: "var(--w-muted)" }}>{r.label}</span>
            <Num weight={600}>{r.text}</Num>
          </div>
          <Thin pct={r.pct} color={color} />
        </div>
      ))}
    </div>
  );
}

/** One drawn item of the bar. `end` puts the ring at the slot's outer right end, with the text to its left. */
export function CardView({ card, u, end }: { card: Card; u: number; end: boolean }) {
  const z = sizeOf(u);
  const color = ACCENT[card.accent];
  switch (card.kind) {
    case "ring":
      return (
        <div className="flex min-w-0 items-center" style={{ gap: z.gap, flexDirection: end ? "row-reverse" : "row" }}>
          <div className="shrink-0" style={{ width: z.ring, height: z.ring }}>
            <Ring value={card.load} thickness={9} color={color} className="h-full w-full" ipKey={card.loadKey}>
              <Num style={{ fontSize: z.ring * 0.3 }}>{fmt(card.load, 0)}</Num>
            </Ring>
          </div>
          <Lines label={card.label} accent={card.accent} temp={card.temp} small={card.power} end={end} u={u} />
        </div>
      );
    case "dual": {
      const rows = card.rows.slice(0, rowCount(u, card.rows.length));
      return (
        <div className="flex min-w-0 items-center" style={{ gap: z.gap * 1.5 }}>
          <div className="flex min-w-0 items-center" style={{ gap: z.gap }}>
            <div className="shrink-0" style={{ width: z.ring, height: z.ring }}>
              <RingStack rings={[{ v: card.load, color, ipKey: card.loadKey }, { v: card.heat, color: heatOf(card.heat) }]} thickness={9} gap={3} className="h-full w-full">
                <Num style={{ fontSize: z.ring * 0.26 }}>{fmt(card.load, 0)}</Num>
              </RingStack>
            </div>
            <Lines label={card.label} accent={card.accent} temp={card.temp} end={false} u={u} />
          </div>
          {rows.length > 0 && <Rows rows={rows} color={color} u={u} />}
        </div>
      );
    }
    case "stat": {
      const one = (label: string, value: string, c: string, idle = false) => (
        <div className="flex min-w-0 flex-col items-center whitespace-nowrap" style={{ opacity: idle ? 0.4 : 1 }}>
          <span style={caption(c, z.cap)}>{label}</span>
          <Num style={{ fontSize: z.stat, lineHeight: 1.05 }}>{value}</Num>
        </div>
      );
      return (
        <div className="flex min-w-0 items-center" style={{ gap: z.gap * 2 }}>
          {one(card.label, card.value, color, card.idle)}
          {card.low && one("1% low", card.low, "var(--w-muted)")}
        </div>
      );
    }
    case "line": {
      const px = lineSize(u);
      return (
        <span className="flex min-w-0 items-baseline whitespace-nowrap" style={{ gap: px * 0.4, fontSize: px }}>
          <span style={{ color, fontWeight: 700 }}>{card.label}</span>
          {card.values.map((v, i) => (
            <Fragment key={i}>
              {i > 0 && <span aria-hidden style={{ color: "var(--w-faint)" }}>·</span>}
              <Num weight={600}>{v}</Num>
            </Fragment>
          ))}
        </span>
      );
    }
  }
}
