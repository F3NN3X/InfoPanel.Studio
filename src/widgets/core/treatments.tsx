// The component treatments a Look's T3 asks for (src/looks/treatments.ts), as the markup hooks and the drawing the primitives share:
// tone slabs (`data-wp-slab`, painted by treatments.css, which src/index.css imports), the state a part shows (`data-state`), list rows (`data-part="row"`), a hero
// value at the readout scale fitted to its card, the hexagon a hex ring is drawn on and a cell meter's peak hold. Every hook is written
// only where the Look asks for it, so a Look that sets none (Classic, every pack before these) writes the markup it always did.
import { useLayoutEffect, useRef, useState, type CSSProperties, type ElementType, type HTMLAttributes, type ReactNode, type RefObject } from "react";
import { MotionText } from "@/looks/motion-render";
import { STATUS } from "@/looks/status";
import { SLAB_TONES, ownSlabVars, slabTexture, type SlabPart, type SlabTone } from "@/looks/treatments";
import { useSkin } from "./theme";
import type { ReadoutSpec, SkinContext, SlabSpec, Tone } from "./types";

type Sk = Partial<SkinContext>;

/** The card's slab colours: each tone resolved on the card (a part that is a slab redefines the card's text colours for what is on it), the ink, the texture and the notch. */
export function slabVars(slab: SlabSpec | undefined): CSSProperties | undefined {
  if (!slab) return undefined;
  return {
    "--wp-slab-ink": slab.ink,
    "--wp-slab-accent": "var(--w-accent)",
    "--wp-slab-info": slab.info,
    "--wp-slab-ok": `var(--w-ok, ${STATUS.ok})`,
    "--wp-slab-warn": `var(--w-warn, ${STATUS.warn})`,
    "--wp-slab-crit": `var(--w-crit, ${STATUS.crit})`,
    ...(slab.texture ? { "--wp-slab-tex": slabTexture(slab.ink) } : null),
    ...(slab.notch > 0 ? { "--wp-slab-cut": `${slab.notch}px` } : null),
  } as CSSProperties;
}

/**
 * Whether `part` is drawn as a slab and in which tone: the part's own warning or critical state wins, then the tone its token names; a
 * `current` row in the `slab-current` tone; a header or card whose token is `state` follows the card's state (`data-wp-slab-state`, read by the CSS from
 * the parts in it). Nothing for a part the Look draws no slab on.
 */
export function slabAttrs(sk: Sk, part: SlabPart, own?: Tone, current?: boolean): Record<string, string> {
  const role = sk.slab?.roles[part];
  if (!role) return {};
  if (own === "warn" || own === "crit") return { "data-wp-slab": own };
  if ((SLAB_TONES as readonly string[]).includes(role)) return { "data-wp-slab": role as SlabTone };
  if (role === "current") return current ? { "data-wp-slab": sk.slab?.current ?? "accent" } : {};
  return part === "header" || part === "card" ? { "data-wp-slab-state": "" } : {};
}

/** A reading's warning or critical state on its part (`data-state`), where the Look's slabs or frame follow the card's state; nothing otherwise. */
export function stateAttr(sk: Sk, t: Tone | undefined): Record<string, string> | undefined {
  return (sk.slab || sk.decor?.frame?.tone === "state") && (t === "warn" || t === "crit") ? { "data-state": t } : undefined;
}

/** A list or table row's hooks where the Look styles rows (`row-style`, `slab-row`): `data-part="row"` (`row-head` for a table's head), its state and whether it is the current row; nothing otherwise. */
export function rowAttrs(sk: Sk, o: { state?: Tone; current?: boolean; head?: boolean } = {}): Record<string, string> {
  if (!sk.rows && !sk.slab?.roles.row) return {};
  if (o.head) return { "data-part": "row-head" };
  return { "data-part": "row", ...(o.state && o.state !== "ok" ? { "data-state": o.state } : null), ...(o.current ? { "data-current": "" } : null), ...slabAttrs(sk, "row", o.state, o.current) };
}

/** A grid cell's hooks where the Look rules its rows (`row-style`): `data-part="cell"` and its state; nothing otherwise. */
export function cellAttrs(sk: Sk, state?: Tone): Record<string, string> {
  return sk.rows ? { "data-part": "cell", ...(state && state !== "ok" ? { "data-state": state } : null) } : {};
}

/**
 * A widget's row, table head, grid cell, avatar or accent slab with the part hooks the Look asks for (`rowAttrs`, `cellAttrs`, `avatar-shape`): the element itself is the widget's,
 * its classes and children unchanged, so a Look that styles no rows draws the markup it always did. A component, so it reads the card's skin
 * from inside the card (a widget's layout callback runs before the card's context is there).
 */
export function Part({ as, kind, state, current, ...rest }: { as?: ElementType; kind: "row" | "row-head" | "cell" | "avatar" | "slab"; state?: Tone; current?: boolean } & HTMLAttributes<HTMLElement> & Record<`data-${string}`, string | number | undefined>) {
  const sk = useSkin();
  const Tag = as ?? "div";
  if (kind === "slab") {
    // a layout variant's mark: the accent slab in the Look's ink, texture and notch where it draws slabs, else the app's own (`ownSlabVars`, set above the slab, which redefines the card's accent)
    const style = { ...(sk.slab?.notch ? null : { "--wp-slab-cut": "5px" }), ...rest.style } as CSSProperties;
    const slab = <Tag data-wp-slab="accent" {...rest} style={style} />;
    return sk.slab ? slab : <span className="contents" style={ownSlabVars("var(--w-accent)") as CSSProperties}>{slab}</span>;
  }
  if (kind === "avatar") {
    if (sk.avatar !== "hex") return <Tag {...rest} />;
    return <Tag data-part="avatar" data-avatar="hex" {...rest} style={{ ...rest.style, clipPath: HEX_CLIP }} />;
  }
  const hooks = kind === "cell" ? cellAttrs(sk, state) : rowAttrs(sk, { state, current, head: kind === "row-head" });
  return <Tag {...hooks} {...rest} />;
}

/** The kit's hexagon avatar (`avatar-shape: hex`): pointy-top, so a centred initial keeps its whole box. */
export const HEX_CLIP = "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)";

/** The warning and critical colours a frame that follows the card's state (`frame.tone: state`) takes, resolved where the card's are (the card and its host). */
export function frameToneVars(on: boolean): CSSProperties | undefined {
  return on ? ({ "--wp-tone-warn": `var(--w-warn, ${STATUS.warn})`, "--wp-tone-crit": `var(--w-crit, ${STATUS.crit})` } as CSSProperties) : undefined;
}

/** The card attributes the treatments' CSS reads: a slab on the card itself, ruled rows. */
export function cardTreatments(sk: Sk): Record<string, string> {
  return { ...slabAttrs(sk, "card"), ...(sk.rows ? { "data-wp-rows": sk.rows } : null) };
}

/** True when `el`, or an element between it and the card body, pokes out: out of the body's box, the body scrolling, or a parent narrower than what it holds. */
export function overflows(el: HTMLElement): boolean {
  const body = el.closest("[data-wp-body]") ?? el.closest('[data-part="card"]');
  if (!body) return false;
  const r = el.getBoundingClientRect();
  const b = body.getBoundingClientRect();
  if (r.left < b.left - 1 || r.top < b.top - 1 || r.right > b.right + 1 || r.bottom > b.bottom + 1) return true;
  if (body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1) return true;
  for (let p = el.parentElement; p && p !== body; p = p.parentElement) if (p.clientWidth > 0 && (p.scrollWidth > p.clientWidth + 1 || p.scrollHeight > p.clientHeight + 1)) return true;
  return false;
}

/** Each fitting step takes this share of the scale, until the value fits or is back at its own size. */
const FIT_STEP = 0.82;

/**
 * The scale a readout is drawn at: the Look's, stepped down before paint until nothing pokes out of the card (`overflows`), never under 1
 * (the widget's own size, which it already fits). It tries the Look's scale again when the text or the card's size changes.
 */
function useReadoutScale(want: number, text: string): [RefObject<HTMLSpanElement | null>, number] {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [scale, setScale] = useState(want);
  const [epoch, setEpoch] = useState(0);
  const tried = useRef("");
  useLayoutEffect(() => {
    const key = `${want}|${text}|${epoch}`;
    if (tried.current !== key) {
      tried.current = key;
      if (scale !== want) return void setScale(want);
    }
    const el = ref.current;
    if (el && scale > 1 && overflows(el)) setScale(Math.max(1, Math.floor(scale * FIT_STEP * 100) / 100));
  });
  useLayoutEffect(() => {
    const card = ref.current?.closest('[data-part="card"]');
    if (!card || typeof ResizeObserver === "undefined") return;
    let first = true;
    const ro = new ResizeObserver(() => {
      if (first) first = false;
      else setEpoch((n) => n + 1);
    });
    ro.observe(card);
    return () => ro.disconnect();
  }, []);
  return [ref, scale];
}

/** A plain number's whole part and its decimals ("412.8" is "412" and ".8"); undefined for anything else. */
export function splitDecimals(text: string): [string, string] | undefined {
  const m = /^(-?[\d,\s]*\d)(\.\d+)$/.exec(text);
  return m ? [m[1], m[2]] : undefined;
}

/**
 * A hero value at the Look's readout scale (`readout-scale`, fitted), its decimals at `readout-decimals` of its size; the unit, if given,
 * scales with it. An inline block one line tall, as the number it stands in for, so its larger type does not reach over the line under it.
 */
export function Readout({ spec, value, unit }: { spec: ReadoutSpec; value: ReactNode; unit?: ReactNode }) {
  const text = typeof value === "string" || typeof value === "number" ? String(value) : "";
  const [ref, scale] = useReadoutScale(spec.scale, text);
  const split = spec.decimals < 1 && text ? splitDecimals(text) : undefined;
  return (
    <span ref={ref} data-readout="" className="inline-block leading-none" style={scale !== 1 ? { fontSize: `${scale}em` } : undefined}>
      {split ? (
        <>
          <MotionText part="num">{split[0]}</MotionText>
          <span data-part="decimals" style={{ fontSize: `${spec.decimals}em` }}>{split[1]}</span>
        </>
      ) : (
        <MotionText part="num">{value}</MotionText>
      )}
      {unit}
    </span>
  );
}

/** The share of the under-bar drawn solid when the reading's share of its range is not known. */
const BAR_SOLID = 12;

/** The kit's under-bar (`readout-bar: rule`): solid up to the reading's share of its range (`pct`), a gap, then a dotted run, in the reading's colour. Decoration. */
export function ReadoutBar({ color, pct }: { color: string; pct?: number }) {
  const solid = `${Math.round(Math.min(100, Math.max(2, pct ?? BAR_SOLID)))}%`;
  return (
    <span
      aria-hidden
      data-part="readout-bar"
      className="mt-1.5 block h-0.75 w-full max-w-64 shrink-0"
      style={{ color, background: `linear-gradient(currentColor, currentColor) 0 0 / ${solid} 100% no-repeat, radial-gradient(circle, currentColor 45%, transparent 55%) 0 0 / 6px 100% repeat-x`, maskImage: `linear-gradient(90deg, currentColor ${solid}, transparent ${solid}, transparent calc(${solid} + 8px), currentColor calc(${solid} + 8px))` }}
    />
  );
}

/** A flat-topped hexagon of radius `r` (centre to corner) in the 100 x 100 drawing, from its top or bottom centre and round clockwise. */
export function hexPath(r: number, from: "top" | "bottom" = "top"): string {
  const h = (r * Math.sqrt(3)) / 2;
  const top: [number, number][] = [[50, 50 - h], [50 + r / 2, 50 - h], [50 + r, 50], [50 + r / 2, 50 + h], [50 - r / 2, 50 + h], [50 - r, 50], [50 - r / 2, 50 - h]];
  const bottom: [number, number][] = [[50, 50 + h], [50 - r / 2, 50 + h], [50 - r, 50], [50 - r / 2, 50 - h], [50 + r / 2, 50 - h], [50 + r, 50], [50 + r / 2, 50 + h]];
  return `M${(from === "top" ? top : bottom).map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L")} Z`;
}

/** How long a cell meter's peak cell stays lit after the value falls (`meter-peak: hold`). */
export const PEAK_HOLD_MS = 1500;

/** The highest value of the last `PEAK_HOLD_MS`, read when the value changes (no timer: a still value holds still); the value itself when `on` is false. */
export function usePeak(pct: number, on: boolean): number {
  const held = useRef({ at: pct, t: 0 });
  if (!on) return pct;
  const now = Date.now();
  if (pct >= held.current.at || now - held.current.t > PEAK_HOLD_MS) held.current = { at: pct, t: now };
  return held.current.at;
}
