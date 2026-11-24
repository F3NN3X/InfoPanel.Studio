// Shared layouts: CompactView (tile / strip / column), StudioView (variant="studio") and the per-skin headers.
// Text and track colours come from the shell's --w-* variables; label case follows the look (`--wp-label-case`).
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { labelStyle } from "@/components/widget-style";
import { MotionText } from "@/looks/motion-render";
import { clamp, fmt } from "./data";
import { fitRows, tileHero } from "./layout";
import { mix } from "./tokens";
import { useSkin, TONES, numGlowStyle } from "./theme";
import { Icon, Bar, Ring, Spark, Img, Unit, RING_TEXT, isWordUnit } from "./primitives";
import { motionOf, scaleX, scaleY, slideY } from "./motion";
import type { Compact, Shape, Studio } from "./types";
import { Readout, slabAttrs, stateAttr } from "./treatments";

const NUM_TINT: CSSProperties = { color: "color-mix(in oklab, var(--w-accent) 55%, var(--w-fg))" };
/** A reading that has no value yet ("–" from `fmt`, or nothing): drawn quiet, not as a bright full-weight dash. */
const isNoValue = (v: unknown): boolean => v == null || v === "" || v === "–" || v === "—";
/** A text value with no spaces (an IP address) cannot wrap: shrink it to the width instead of cutting it off. */
const tokenFit = (v: unknown, avail: number, base: number): CSSProperties | undefined =>
  typeof v === "string" && v.length > 0 && !/\s/.test(v) ? { fontSize: Math.max(11, Math.min(base, avail / (v.length * 0.6))) } : undefined;
const NO_VALUE: CSSProperties = { color: "var(--w-faint)", fontWeight: 400, textShadow: "none", WebkitTextStroke: "0" };

/* Compact views — rendered automatically for tile / strip / column shapes when a widget passes `compact`.
   compact = { label, value, unit, d, sub, icon, t, pct, hist, img, kind: 'spark' | 'bar' | 'ring' | 'text' } */
export function CompactView({ c, shape, w, h, icon }: { c: Compact; shape: Shape; w: number; h: number; icon?: string }) {
  const sk = useSkin();
  // A count handed over as text ("7" with unit "online") is still a number: the text layout would drop its unit.
  const counted = c.unit && typeof c.value === "string" && /^-?\d[\d,]*(\.\d+)?$/.test(c.value.trim());
  const kind = c.kind ?? (c.hist ? "spark" : Number.isFinite(c.pct) ? "bar" : counted ? "value" : "text");
  const val = typeof c.value === "number" ? fmt(c.value, c.d ?? 0) : c.value;
  const none = isNoValue(val);
  // numbers shrink to fit the available width instead of overflowing (text values clamp instead)
  // a word unit ("games") is not drawn beside the number: it is a caption under it
  const word = isWordUnit(c.unit);
  const inlineUnit = word ? undefined : c.unit;
  const textLen = String(val ?? "–").length + (inlineUnit ? String(inlineUnit).length * 0.4 : 0);
  // a Look's readout scale (`readout-*`) draws the value larger than it is fitted here, then fits it to the card itself
  const readout = none ? undefined : sk.readout;
  const fit = (base: number, avail: number) => ({ fontSize: Math.round(Math.max(13, Math.min(base, avail / (Math.max(2.5, textLen) * 0.62 * (sk.numWide ?? 1))))) });
  const value = (cls: string, base?: number, avail = 0) => (
    <span data-part="num" {...c.ip} {...stateAttr(sk, c.t)} className={`${cls} ${c.blur ? "blur-xs hover:blur-0" : ""} block max-w-full overflow-x-clip whitespace-nowrap font-semibold leading-none tracking-tight tabular-nums`} style={{ ...(base ? fit(base, avail) : null), fontFamily: sk.num, fontWeight: sk.numWeight, ...(sk.numGlow || sk.numFill || sk.numChroma ? { ...(sk.numChroma && !sk.numGlow && !sk.numFill ? null : NUM_TINT), ...numGlowStyle(sk) } : null), ...(c.t && c.t !== "ok" ? { color: TONES[c.t] } : null), ...(none ? NO_VALUE : null) }}>
      {readout ? <Readout spec={readout} value={val ?? "–"} unit={inlineUnit && <Unit>{inlineUnit}</Unit>} /> : <MotionText part="num">{val ?? "–"}</MotionText>}
      {!readout && inlineUnit && !none && <Unit>{inlineUnit}</Unit>}
    </span>
  );
  const caption = word && !none && <span className="truncate text-micro text-[color:var(--w-muted)]">{c.unit}</span>;
  // a 1x1 whose label would be cut ("ACHIEVEM…") shows the icon alone, faint, and keeps the label as its title
  const iconOnly = shape === "tile" && w < 140 && typeof c.label === "string" && c.label.length * 7.6 > w - 46;
  // a narrow card sets a caption it would cut tighter, and drops the icon when the text still would not fit beside it
  const { tight: narrow, bare: bareLabel } = captionFit(c.label, w, w - 46);
  const label = c.label && (iconOnly ? (
    <div role="img" aria-label={String(c.label)} title={String(c.label)} className="flex min-w-0 items-center">
      <Icon name={c.icon ?? icon} className="text-lead text-[color:var(--w-faint)]" />
    </div>
  ) : (
    <div className={`flex min-w-0 items-center gap-1.5 text-micro font-medium uppercase ${narrow ? "tracking-[0.04em]" : "tracking-[0.08em]"} text-[color:var(--w-muted)]`} style={labelStyle()}>
      {!bareLabel && <Icon name={c.icon ?? icon} className="text-lead text-[color:var(--w-accent)]" />}
      <span data-part="label" className="truncate"><MotionText part="label">{c.label}</MotionText></span>
    </div>
  ));
  const textVal = kind === "text";
  // Over a cover image the text sits on a black scrim, so it stays light on every surface.
  if (c.img && shape !== "strip")
    return (
      <div className="absolute inset-0 text-zinc-100">
        <Img src={c.img} icon={c.icon ?? icon} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgb(0 0 0 / 0.78) 0, rgb(0 0 0 / 0.55) 45%, transparent 85%)" }} />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-3">
          <span {...c.ip} className="line-clamp-2 text-sm font-semibold leading-tight">{val}</span>
          {c.sub && <span className="truncate text-micro text-zinc-300">{c.sub}</span>}
          {c.viz ? <div className="mt-1.5">{c.viz("h-6")}</div> : Number.isFinite(c.pct) && <Bar value={c.pct!} className="mt-1.5 h-1" track="bg-white/20" />}
        </div>
      </div>
    );
  if (c.idle && shape !== "strip" && h >= 180)
    return (
      <div className="flex h-full min-w-0 flex-col items-center justify-center gap-1 text-center text-[color:var(--w-faint)]">
        <Icon name={c.icon ?? icon} className="text-3xl" />
        <span className="text-sm text-[color:var(--w-fg)]">{c.idle}</span>
      </div>
    );
  if (shape === "strip")
    return (
      <div className="flex h-full min-w-0 items-center gap-4">
        {c.img ? <Img src={c.img} icon={c.icon ?? icon} className="aspect-square h-full max-h-20 shrink-0 rounded-lg" /> : null}
        <div className={`flex min-w-0 flex-col gap-1.5 ${textVal || c.img ? "flex-1" : "shrink-0"}`}>
          {label}
          {textVal ? value("truncate text-base") : value("", h < 130 ? 24 : 30, w * 0.38)}
          {caption}
          {c.sub && <span className="truncate text-micro text-[color:var(--w-faint)]">{c.sub}</span>}
        </div>
        {kind === "spark" && <Spark values={c.hist} min={c.min} max={c.max} color={c.color} className="h-[70%] min-w-0 flex-1" />}
        {kind === "bar" && (
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Bar value={c.pct!} t={c.t} className="h-2" />
          </div>
        )}
        {kind === "ring" && <Ring value={c.pct!} t={c.t} color={c.color} className="h-[78%] shrink-0" />}
        {c.viz ? <div className="min-w-0 flex-1">{c.viz("h-[56%] max-h-14")}</div> : textVal && Number.isFinite(c.pct) && <Bar value={c.pct!} className="h-1 w-1/4 shrink-0" />}
      </div>
    );
  if (shape === "column")
    return (
      <div className="flex h-full min-w-0 flex-col gap-2">
        {label}
        {textVal ? <span {...c.ip} className="line-clamp-3 text-base font-semibold leading-tight" style={tokenFit(val, w - 26, 16)}>{val}</span> : value("", w < 150 ? 24 : 36, w - 26)}
        {caption}
        {c.sub && <span className="line-clamp-2 text-micro text-[color:var(--w-faint)]">{c.sub}</span>}
        <div className="relative mt-auto min-h-0 flex-1">
          {kind === "spark" && <Spark values={c.hist} min={c.min} max={c.max} color={c.color} className="absolute inset-0 h-full" />}
          {(kind === "bar" || kind === "ring") && (
            <div data-qa-bleed className="absolute inset-y-0 left-0 right-0 mx-auto flex w-full max-w-14 flex-col justify-end overflow-hidden rounded-xl bg-[color:var(--w-track)]">
              {/* the fill slides by transform (no layout per tick); the track clips it on purpose, so the probe skips it */}
              <div className="h-full w-full rounded-xl transition-transform duration-700 ease-out" style={{ ...slideY(clamp(c.pct!)), background: TONES[c.t ?? "ok"] }} />
            </div>
          )}
        </div>
      </div>
    );
  // tile (1×1) — w/h are the outer size; below ~130px drop the sub line so value + graph always fit
  const tiny = h < 132 || w < 132;
  // a 2x2 centres a hero of about a quarter of the height between the label and the graph, not at the bottom edge
  const hero = tileHero(w, h);
  return (
    <div className="flex h-full min-w-0 flex-col">
      {label}
      {kind === "ring" ? (
        // a size container: the ring takes the smaller side, so a tall box (Summary card: Always) cannot push it past the width
        <div className="flex min-h-0 flex-1 items-center justify-center pt-1.5" style={{ containerType: "size" }}>
          <div className="shrink-0" style={{ width: "100cqmin" }}>
            <Ring value={c.pct!} t={c.t} color={c.color}>
              <span {...c.ip} className="font-semibold tabular-nums" style={{ ...RING_TEXT.value, ...(none ? NO_VALUE : null) }}>
                {val}
                {!none && <span className="text-[color:var(--w-muted)]" style={RING_TEXT.unit}>{c.unit}</span>}
              </span>
            </Ring>
          </div>
        </div>
      ) : (
        <>
          <div className={`${hero ? "my-auto" : "mt-auto"} flex flex-col gap-1`}>
            {textVal ? <span {...c.ip} className={`${tiny ? "text-body" : "text-sm"} ${c.blur ? "blur-xs hover:blur-0" : ""} line-clamp-2 font-semibold leading-tight`}>{val}</span> : (hero && c.lead ? <div className="flex min-w-0 items-center gap-3">{c.lead}{value("", Math.round(h * 0.26), w - 26 - 52)}</div> : value("", tiny ? 22 : hero ? Math.round(h * 0.26) : w < 160 || h < 160 ? 24 : 34, w - 26))}
            {caption}
            {c.sub && !(tiny && (kind === "spark" || kind === "bar" || textVal)) && <span className="truncate text-micro text-[color:var(--w-faint)]">{c.sub}</span>}
          </div>
          {kind === "spark" && <Spark values={c.hist} min={c.min} max={c.max} color={c.color} className={`${tiny ? "mt-1.5 h-[22%]" : "mt-2 h-[28%]"} shrink-0`} />}
          {kind === "bar" && <Bar value={c.pct!} t={c.t} className={`${tiny ? "mt-2" : "mt-2.5"} h-1.5 shrink-0`} />}
        </>
      )}
    </div>
  );
}

/* ───────── Studio variant ─────────
   Minimal stat-first layout from the Studio app: mono micro-label, big tight value anchored low, quiet sub, 3px bar.
   Driven by the widget's `studio` descriptor (falls back to `compact`):
   { label, value, unit, d, sub, t, pct, hist, img, live, right, kind: 'text'|'value',
     rows: [{ n, v, pct?, dot? }], meters: [{ n, v 0-100 }], cells: [0-100…], progress: { a, b, pct } } */
export function StudioView({ c, w, h, icon }: { c: Studio; w: number; h: number; icon?: string }) {
  const sk = useSkin();
  const val = typeof c.value === "number" ? fmt(c.value, c.d ?? 0) : c.value;
  // The skin's UI face, else the shell's (the look's Font or the page font): no fixed mono, so the summary follows the styling.
  const mono = sk.font ? { fontFamily: sk.font } : undefined;
  const glow = numGlowStyle(sk);
  const toneC = c.t && c.t !== "ok" ? TONES[c.t] : undefined;
  const label = (className = "") => (c.label || c.right || c.live != null) && (
    <div className={`flex min-w-0 shrink-0 items-center gap-1.5 text-micro uppercase tracking-[0.06em] text-[color:var(--w-muted)] ${className}`} style={{ ...mono, ...labelStyle() }}>
      {c.live != null && <span className="h-1.25 w-1.25 shrink-0 rounded-full" style={{ background: c.live ? "oklch(0.75 0.15 150)" : "#52525b" }} />}
      {c.label && <span data-part="label" className="truncate"><MotionText part="label">{c.label}</MotionText></span>}
      {c.right && <span className="ml-auto shrink-0 normal-case tracking-normal text-[color:var(--w-muted)]">{c.right}</span>}
    </div>
  );
  const thin = (pct: number, className = "") => (
    <div className={`h-0.75 shrink-0 overflow-hidden rounded-2 bg-[color:var(--w-track)] ${className}`}>
      <div className="h-full w-full transition-transform duration-500" style={{ ...scaleX(clamp(pct)), background: toneC ?? "var(--w-accent)" }} />
    </div>
  );
  const len = String(val ?? "–").length + (c.unit ? String(c.unit).length * 0.5 : 0);
  const fitPx = (max: number) => Math.round(Math.max(11, Math.min(max, (w - 26) / (Math.max(2.5, len) * 0.68 * (sk.numWide ?? 1)))));
  const big = (max: number): ReactNode =>
    c.kind === "text" ? (
      <span {...c.ip} className="line-clamp-2 text-title font-semibold leading-snug">{val ?? "—"}</span>
    ) : (
      <span data-part="num" {...c.ip} className="block max-w-full overflow-x-clip whitespace-nowrap font-semibold leading-[1.05] tracking-[-0.02em] tabular-nums" style={{ fontSize: fitPx(max), fontFamily: sk.num, fontWeight: sk.numWeight ?? 600, color: toneC, ...glow, ...(isNoValue(val) ? NO_VALUE : null) }}>
        <MotionText part="num">{val ?? "–"}</MotionText>
        {c.unit && !isNoValue(val) && <Unit>{c.unit}</Unit>}
      </span>
    );
  // single-row zones: label ← → value
  if (h < 100 || (w / h >= 2.6 && h < 130))
    return (
      <div className="flex h-full min-w-0 items-center gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          {label()}
          {c.sub && w > 260 && <span className="truncate text-micro text-[color:var(--w-muted)]">{c.sub}</span>}
        </div>
        {c.hist && w > 300 ? <Spark values={c.hist} min={c.min} max={c.max} graph="line" fill={false} className="h-[46%] min-w-0 flex-1 opacity-80" /> : Number.isFinite(c.pct) && w > 300 ? thin(c.pct!, "min-w-0 flex-1") : <span className="flex-1" />}
        <span {...c.ip} className="shrink-0 whitespace-nowrap text-title font-semibold tracking-[-0.01em] tabular-nums" style={{ fontFamily: sk.num, color: toneC, ...glow }}>
          {val ?? "–"}
          {c.unit && <span className="ml-0.5 text-micro font-medium text-[color:var(--w-muted)]">{c.unit}</span>}
        </span>
      </div>
    );
  const bigMax = h >= 280 ? 44 : h >= 190 ? 34 : 26;
  if (c.img) {
    const pr = c.progress;
    return (
      <div className="flex h-full min-w-0 flex-col">
        <div className="flex min-h-0 flex-1 items-center gap-2.5">
          <div className="aspect-square h-full max-h-40 shrink-0 overflow-hidden rounded-md" style={{ maxWidth: Math.max(24, Math.round((w - 26) * 0.5)) }}>
            <Img src={c.img} icon={c.icon ?? icon} className="h-full w-full" />
          </div>
          <div className="flex min-w-0 flex-col gap-0.75">
            <span {...c.ip} className={`${h > 200 ? "text-[17px]" : "text-sm"} line-clamp-2 font-semibold leading-tight`}>{val}</span>
            {c.sub && <span className="truncate text-micro text-[color:var(--w-muted)]">{c.sub}</span>}
          </div>
        </div>
        {c.viz && <div className="mt-2 shrink-0">{c.viz("h-7")}</div>}
        {(pr || Number.isFinite(c.pct)) && (
          <div className="mt-2 flex shrink-0 items-center gap-2 text-micro text-[color:var(--w-muted)]" style={mono}>
            {pr?.a && <span className="min-w-0 truncate">{pr.a}</span>}
            {thin(pr?.pct ?? c.pct ?? 0, "min-w-6 flex-1")}
            {pr?.b && <span className="shrink-0">{pr.b}</span>}
          </div>
        )}
      </div>
    );
  }
  if (c.meters && h >= 120) {
    const n = Math.max(1, Math.min(c.meters.length, Math.floor((w + 8) / 26)));
    return (
      <div className="flex h-full min-w-0 flex-col">
        {label()}
        <div className="mt-2 flex min-h-0 flex-1 gap-2">
          {c.meters.slice(0, n).map((m, i) => (
            <div key={i} className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="relative min-h-0 flex-1 overflow-hidden rounded-3 bg-[color:var(--w-track)]">
                <div className="absolute inset-0 transition-transform duration-300" style={{ ...scaleY(clamp(m.v)), background: "var(--w-accent)", ...motionOf(sk, "base") }} />
              </div>
              <span className="truncate text-center text-micro text-[color:var(--w-muted)]">{m.n}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (c.rows && h >= 130) {
    const head = h >= 210 && c.value != null;
    // a row is the 10.5px line + 3px bar (≈22px) with a 7px gap
    const n = fitRows(h - (head ? 86 : 34), 22, 7);
    return (
      <div className="flex h-full min-w-0 flex-col">
        {label()}
        {head && <div className="mt-2">{big(26)}</div>}
        <div className="mt-auto flex flex-col gap-1.75 pt-2">
          {c.rows.slice(0, n).map((r, i) => (
            <div key={i} className="flex min-w-0 flex-col gap-0.75">
              <div className="flex min-w-0 items-baseline justify-between gap-2 text-micro">
                <span className="flex min-w-0 items-center gap-1.5 font-medium">
                  {r.dot != null && <span className="h-1.25 w-1.25 shrink-0 rounded-full" style={{ background: r.dot ? "oklch(0.75 0.15 150)" : "#52525b" }} />}
                  <span className="truncate">{r.n}</span>
                </span>
                <span className="min-w-0 truncate tabular-nums text-[color:var(--w-muted)]">{r.v}</span>
              </div>
              {Number.isFinite(r.pct) && thin(r.pct!)}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (c.cells && h >= 120) {
    const cols = Math.max(2, Math.min(c.cells.length, Math.round(Math.sqrt(c.cells.length * (w / Math.max(1, h - 60))))));
    return (
      <div className="flex h-full min-w-0 flex-col">
        {label()}
        <div className="mt-2 grid min-h-0 flex-1 gap-0.75" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridAutoRows: "minmax(0,1fr)" }}>
          {c.cells.map((v, i) => (
            <span key={i} className="rounded-3" style={{ background: `color-mix(in oklab, var(--w-accent) ${8 + clamp(v) * 0.92}%, var(--w-track))` }} />
          ))}
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2">
          {big(22)}
          {c.sub && <span className="truncate text-micro text-[color:var(--w-muted)]">{c.sub}</span>}
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full min-w-0 flex-col">
      {label()}
      {c.hist && h >= 150 && (
        <div className="relative mt-2 min-h-0 flex-1">
          <Spark values={c.hist} min={c.min} max={c.max} graph="line" fill={false} className="absolute inset-0 h-full opacity-70" />
        </div>
      )}
      <div className={`${c.hist && h >= 150 ? "mt-2" : "mt-auto"} flex min-w-0 flex-col`}>
        {big(bigMax)}
        {c.sub && <span className="mt-1 truncate text-micro text-[color:var(--w-muted)]">{c.sub}</span>}
        {Number.isFinite(c.pct) && thin(c.pct!, "mt-1.5")}
      </div>
    </div>
  );
}

/**
 * A card narrower than this, px, whose caption would be cut at the normal 0.08em tracking sets it at 0.04em, and
 * drops the icon before the text when it would still be cut. Estimates of ~7.6 / 7px a character; other nodes fit.
 */
export const NARROW_CARD = 160;
const captionFits = (text: ReactNode, room: number, px: number): boolean => typeof text !== "string" || text.length * px <= room;
/** The caption's tracking and whether its icon goes, for a card `w` wide with `room` px for the icon and text. */
function captionFit(text: ReactNode, w: number, room: number): { tight: boolean; bare: boolean } {
  const tight = w > 0 && w < NARROW_CARD && !captionFits(text, room, 7.6);
  return { tight, bare: tight && !captionFits(text, room, 7) };
}

export interface SkinHeaderProps {
  kind?: string;
  title: ReactNode;
  icon?: string;
  right?: ReactNode;
  bleed?: boolean;
  /** What the tui header patches paint over the box edge: the surface background. */
  bg?: string;
  /** The card's width, px: a narrow one (`NARROW_CARD`) sets its caption tighter. */
  w?: number;
}
/** Whether the tui header's right slot fits on the box edge beside the title; it is dropped when it does not. */
function useTuiRightFits(on: boolean) {
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  // the slot's last measured width, kept while it is dropped so a wider box can bring it back
  const rightW = useRef(0);
  const [fits, setFits] = useState(true);
  useLayoutEffect(() => {
    const left = leftRef.current;
    const host = left?.parentElement;
    if (!on || !left || !host) return;
    const check = () => {
      if (rightRef.current) rightW.current = rightRef.current.offsetWidth;
      // both slots sit 12px in from the edges (left-3 / right-3), 8px apart
      setFits(left.offsetWidth + rightW.current + 8 <= host.clientWidth - 24);
    };
    const ro = new ResizeObserver(check);
    ro.observe(host);
    ro.observe(left);
    if (rightRef.current) ro.observe(rightRef.current);
    check();
    return () => ro.disconnect();
  }, [on, fits]);
  return { leftRef, rightRef, fits };
}

/** The most space under a section header the look's gap may add. */
export const HEADER_GAP_MAX = 12;

export function SkinHeader({ kind, title: text, icon, right, bleed, bg = "#0b0b0d", w }: SkinHeaderProps) {
  const sk = useSkin();
  // The title decodes when it arrives on a pack with motion (`MotionText`; the plain text otherwise); its length and fit read the text itself.
  const title = <MotionText part="label">{text}</MotionText>;
  // a Look's header slab (`slab-header`): a tone, or the card's state
  const slab = slabAttrs(sk, "header");
  const tuiRight = useTuiRightFits(kind === "tui" && !!right);
  // The look's gap replaces the space under the header (capped: a wide gap is for the items, and the body's
  // own rows are counted without it); its label case applies to every header.
  const st = (def: "uppercase" | "none"): CSSProperties => ({ ...labelStyle(def), ...(sk.gap !== undefined ? { marginBottom: Math.min(sk.gap, HEADER_GAP_MAX) } : null) });
  const r = right && <span className="ml-auto flex shrink-0 items-center gap-1.5 normal-case tracking-normal">{right}</span>;
  if (kind === "tui")
    return (
      <>
        <div ref={tuiRight.leftRef} data-part="header" {...slab} className="absolute left-3 top-1.25 z-10 flex max-w-[70%] -translate-y-1/2 items-center px-1 text-[11px] leading-none" style={{ background: bg }}>
          <span style={{ color: mix(55, "#52525b") }}>┐</span>
          <span className="truncate px-0.5 font-semibold lowercase text-[color:var(--w-accent)]" style={{ textTransform: "var(--wp-label-case, lowercase)" as CSSProperties["textTransform"] }}>{title}</span>
          <span style={{ color: mix(55, "#52525b") }}>┌</span>
        </div>
        {right && tuiRight.fits && <div ref={tuiRight.rightRef} className="absolute right-3 top-1.25 z-10 flex -translate-y-1/2 items-center gap-1 px-1 text-micro leading-none text-[color:var(--w-muted)]" style={{ background: bg }}>{right}</div>}
      </>
    );
  const base = "relative z-10 flex min-w-0 items-center";
  if (kind === "macos")
    return (
      <header data-part="header" {...slab} className={`${base} mb-2 gap-1.5 text-[13px] font-semibold text-[color:var(--w-accent)]`} style={st("none")}>
        {icon && <Icon name={icon} fill className="text-head" />}
        <span className="truncate">{title}</span>
        {r && <span className="ml-auto text-[12px] font-normal text-[color:var(--w-muted)]">{right}</span>}
      </header>
    );
  if (kind === "fluent")
    return (
      <header data-part="header" {...slab} className={`${base} mb-2 gap-2 text-[12px] font-medium text-[color:var(--w-fg)]`} style={st("none")}>
        {icon && <Icon name={icon} className="text-head text-[color:var(--w-accent)]" />}
        <span className="truncate">{title}</span>
        {r}
      </header>
    );
  if (kind === "hud")
    return (
      <header data-part="header" {...slab} className={`${base} mb-2 gap-2 text-micro uppercase tracking-[0.28em] text-[color:var(--w-accent)]`} style={st("uppercase")}>
        <span className="truncate">{title}</span>
        <span className="h-px min-w-3 flex-1" style={{ background: mix(35) }} />
        {right && <span className="shrink-0 tracking-[0.1em] text-[color:var(--w-muted)]">{right}</span>}
      </header>
    );
  if (kind === "ink")
    return (
      <header data-part="header" {...slab} className={`${base} mb-3 gap-2 text-micro uppercase tracking-[0.22em] text-[color:var(--w-faint)]`} style={st("uppercase")}>
        <span className="truncate">{title}</span>
        {r}
      </header>
    );
  if (kind === "ios")
    return (
      <header data-part="header" {...slab} className={`${base} mb-1.5 gap-1.5 text-small font-semibold text-[color:var(--w-accent)]`} style={st("none")}>
        {icon && <Icon name={icon} fill className="text-[15px]" />}
        <span className="truncate">{title}</span>
        {r && <span className="ml-auto text-[12px] font-medium text-[color:var(--w-faint)]">{right}</span>}
      </header>
    );
  if (kind === "android")
    return (
      <header data-part="header" {...slab} className={`${base} mb-2.5 gap-2 text-[13px] font-medium`} style={{ color: mix(55, "var(--w-fg)"), ...st("none") }}>
        {icon && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: mix(28, "#1b1b1f") }}>
            <Icon name={icon} fill className="text-head" />
          </span>
        )}
        <span className="truncate">{title}</span>
        {r}
      </header>
    );
  if (kind === "prompt")
    return (
      <header data-part="header" {...slab} className={`${base} mb-2 gap-1.5 font-mono text-micro text-[color:var(--w-accent)]`} style={st("none")}>
        <span aria-hidden>&gt;</span>
        <span className="truncate">{title}</span>
        {r}
      </header>
    );
  // The title on an ink tab (a Look's `tab-label`). The tab's padding is taken back with a negative margin, so the header keeps its height and the body does not move.
  // `label-bar` is the same bar in the accent with its right end cut at an angle (P11: Overdrive).
  if (kind === "tab-label" || kind === "label-bar")
    return (
      <header data-part="header" {...slab} className={`${base} mb-2 gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]`} style={st("uppercase")}>
        <span data-part="tab" {...slabAttrs(sk, "tab")} className={`-my-0.5 flex min-w-0 items-center gap-1.5 rounded-2 px-2 py-0.5${kind === "label-bar" ? " pr-3" : ""}`} style={{ background: sk.headerFill ?? (kind === "label-bar" ? "var(--w-accent)" : "var(--w-fg)"), color: bg, ...(kind === "label-bar" ? { clipPath: "polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%)" } : null) }}>
          {icon && <Icon name={icon} className="text-[13px]" />}
          <span className="truncate">{title}</span>
        </span>
        {r}
      </header>
    );
  // The title in the card's top border, like a fieldset legend (a Look's `box-legend`; the tui header's padding and patches are not used). The header stays in flow at its normal height and the legend is lifted by the card's padding (`--wp-pad`, screen px) onto the frame's line 6 px in, so the body does not move; the header sits in the zoomed content, so the lift is divided by the zoom (`--wp-zoom`).
  if (kind === "box-legend")
    return (
      <header data-part="header" {...slab} className={`${base} mb-2 gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em]`} style={st("uppercase")}>
        {/* the header keeps the line it has without a legend: an unseen copy of the title holds its height */}
        <span aria-hidden className="invisible truncate">{text}</span>
        <span data-part="legend" className="absolute left-2 max-w-[70%] -translate-y-1/2 truncate px-1.5 leading-none text-[color:var(--w-accent)]" style={{ top: "calc((6px - var(--wp-pad, 12px)) / var(--wp-zoom, 1))", background: bg }}>{title}</span>
        {r}
      </header>
    );
  // The title between square brackets and a line to the right edge (a Look's `bracket-line`); the line is the header's own height, so the body does not move.
  if (kind === "bracket-line")
    return (
      <header data-part="header" {...slab} className={`${base} mb-2 gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--w-muted)]`} style={st("uppercase")}>
        <span aria-hidden>[</span>
        <span className="truncate">{title}</span>
        <span aria-hidden>]</span>
        <span aria-hidden className="h-px min-w-2 flex-1" style={{ background: mix(35) }} />
        {right && <span className="shrink-0 normal-case tracking-normal">{right}</span>}
      </header>
    );
  // An index number (a CSS counter over the page's headers, index.css) before the title and a hairline under the row (a Look's `index`).
  if (kind === "index")
    return (
      <header data-part="header" {...slab} data-hdr="index" className={`${base} mb-2 gap-2 text-[11px] font-medium tracking-[0.02em] text-[color:var(--w-muted)]`} style={st("none")}>
        <span className="truncate">{title}</span>
        {r}
        <i aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-1 h-px" style={{ background: mix(25) }} />
      </header>
    );
  if (kind === "icon-badge")
    return (
      <header data-part="header" {...slab} className={`${base} mb-2 gap-2 text-[13px] font-medium text-[color:var(--w-fg)]`} style={st("none")}>
        {icon && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: mix(22), color: "var(--w-accent)" }}>
            <Icon name={icon} className="text-lead" />
          </span>
        )}
        <span className="truncate">{title}</span>
        {r}
      </header>
    );
  if (kind === "synth")
    return (
      <header data-part="header" {...slab} className={`${base} mb-2 gap-2 text-[11px] font-bold uppercase italic tracking-[0.18em]`} style={st("uppercase")}>
        <span className="truncate bg-clip-text text-transparent" style={{ backgroundImage: sk.headerFill }}>{title}</span>
        {r}
      </header>
    );
  if (kind === "brutal")
    return (
      <header data-part="header" {...slab} className={`${base} -mx-0.5 -mt-0.5 mb-3 gap-2`} style={st("uppercase")}>
        <span className="truncate bg-[var(--w-accent)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-black">{title}</span>
        {r}
      </header>
    );
  if (kind === "cyber")
    return (
      <header data-part="header" {...slab} className={`${base} mb-2 gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--w-accent)]`} style={st("uppercase")}>
        <span className="h-3 w-1 shrink-0 bg-[var(--w-accent)]" />
        <span className="truncate">{title}</span>
        <span className="text-micro font-normal text-[color:var(--w-faint)]">{"//"}{String(text).length.toString(16).padStart(2, "0")}</span>
        {r}
      </header>
    );
  if (kind === "nixie")
    return (
      <header data-part="header" {...slab} className={`${base} mb-2 gap-2 text-micro uppercase tracking-[0.3em]`} style={{ color: sk.headerInk, ...st("uppercase") }}>
        <span className="truncate">{title}</span>
        {r}
      </header>
    );
  if (kind === "instrument")
    return (
      <header data-part="header" {...slab} className={`${base} mb-3 items-baseline gap-2.5`} style={st("none")}>
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-tight text-[color:var(--w-fg)]">{title}</span>
        {r}
      </header>
    );
  if (kind === "retro")
    return (
      <header data-part="header" {...slab} className={`${base} mb-1.5 gap-1 text-[17px] uppercase leading-none text-[color:var(--w-accent)]`} style={st("uppercase")}>
        <span className="truncate">&gt; {title}</span>
        <span className="wp-blink">_</span>
        {r}
      </header>
    );
  // the card's padding and the icon with its gap (24 and 21px) come off the room; the icon goes first
  const { tight: narrow, bare } = captionFit(text, w ?? 0, (w ?? 0) - 24 - 21);
  return (
    <header data-part="header" {...slab} className={`${base} mb-2 gap-1.5 text-[11px] font-medium uppercase ${narrow ? "tracking-[0.04em]" : "tracking-[0.08em]"} text-[color:var(--w-muted)] ${bleed ? "px-4 pt-3" : ""}`} style={st("uppercase")}>
      {icon && !bare && <Icon name={icon} className="text-[15px] text-[color:var(--w-accent)]" />}
      <span className="truncate">{title}</span>
      {r}
    </header>
  );
}
