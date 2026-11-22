// What the app draws of a pack's `frame` and `ornaments` (spec 03, L108): in the card chrome, over the card, never in a widget's box.
// Both are absolute, click-through layers marked `data-pack-decor`, drawn from the numbers pack.json gives (px, a corner, a name) and
// the Look's own accent, muted text and mono font; the text an ornament carries is a text node, never markup. The only thing that
// reaches the card itself is the clip-path of a `cut` or `notch` frame (`frameClip`), which the render check measures like any card clip.
import type { CSSProperties } from "react";
import { showsAt, sizeClassOf } from "./effects";
import type { Pack, PackSlots } from "./pack";
import { CORNERS, ORNAMENT_MAX, type Corner, type OrnamentAt, type PackFrame, type PackOrnament } from "./pack-json";

/** The frame and ornaments a pack draws on its cards (`Pack.frame`, `Pack.ornaments`). */
export interface PackDecorSpec {
  frame?: PackFrame;
  ornaments?: PackOrnament[];
}

/** A pack's slots with its frame and ornaments in them, for the widgets that wear it (the slots alone when it has neither). */
export function slotsWithDecor(pack: Pick<Pack, "slots" | "frame" | "ornaments"> | undefined): PackSlots | undefined {
  if (!pack || (!pack.frame && !pack.ornaments?.length)) return pack?.slots;
  return { ...pack.slots, decor: { frame: pack.frame, ornaments: pack.ornaments } };
}

const named =(frame: PackFrame): readonly Corner[] => frame.which ?? CORNERS;
const px = (n: number) => `${n}px`;

/** The card's clip-path for a frame that cuts or notches its corners (undefined for the others: they clip nothing). */
export function frameClip(frame: PackFrame | undefined): string | undefined {
  if (!frame || (frame.corners !== "cut" && frame.corners !== "notch") || frame.size <= 0) return undefined;
  const s = px(frame.size);
  const far = `calc(100% - ${s})`;
  const has = (c: Corner) => named(frame).includes(c);
  const notch = frame.corners === "notch";
  const pts: string[] = [];
  // clockwise from the top left; a corner that is named is replaced by its two cut points or its three notch points
  if (has("tl")) pts.push(...(notch ? [`0 ${s}`, `${s} ${s}`, `${s} 0`] : [`0 ${s}`, `${s} 0`]));
  else pts.push("0 0");
  if (has("tr")) pts.push(...(notch ? [`${far} 0`, `${far} ${s}`, `100% ${s}`] : [`${far} 0`, `100% ${s}`]));
  else pts.push("100% 0");
  if (has("br")) pts.push(...(notch ? [`100% ${far}`, `${far} ${far}`, `${far} 100%`] : [`100% ${far}`, `${far} 100%`]));
  else pts.push("100% 100%");
  if (has("bl")) pts.push(...(notch ? [`${s} 100%`, `${s} ${far}`, `0 ${far}`] : [`${s} 100%`, `0 ${far}`]));
  else pts.push("0 100%");
  return `polygon(${pts.join(", ")})`;
}

const FLIP: Record<Corner, { place: CSSProperties; flip: string }> = {
  tl: { place: { top: 0, left: 0 }, flip: "none" },
  tr: { place: { top: 0, right: 0 }, flip: "scaleX(-1)" },
  br: { place: { bottom: 0, right: 0 }, flip: "scale(-1, -1)" },
  bl: { place: { bottom: 0, left: 0 }, flip: "scaleY(-1)" },
};

/** The stroke at one corner, drawn as for the top left (the corner's own flip mirrors it), kept inside the card by half its width. */
function strokePath(frame: PackFrame, stroke: number): string {
  const s = frame.size;
  const h = stroke / 2;
  if (frame.corners === "cut") {
    const c = s + stroke / Math.SQRT2;
    return `M0 ${c} L${c} 0`;
  }
  if (frame.corners === "notch") return `M0 ${s + h} L${s + h} ${s + h} L${s + h} 0`;
  return `M${h} ${s} L${h} ${h} L${s} ${h}`;
}

/** The card's frame: a hairline for `square`, else a stroked mark at each corner `which` names. Nothing when it draws nothing. */
function Frame({ frame }: { frame: PackFrame }) {
  const stroke = frame.stroke ?? 1;
  if (stroke <= 0) return null;
  if (frame.corners === "square") return <div aria-hidden data-pack-decor="frame" className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ boxShadow: `inset 0 0 0 ${px(stroke)} var(--w-accent)` }} />;
  if (frame.size <= 0) return null;
  return (
    <div aria-hidden data-pack-decor="frame" className="pointer-events-none absolute inset-0">
      {named(frame).map((c) => (
        <svg key={c} width={frame.size} height={frame.size} viewBox={`0 0 ${frame.size} ${frame.size}`} style={{ position: "absolute", overflow: "visible", ...FLIP[c].place, transform: FLIP[c].flip }}>
          <path d={strokePath(frame, stroke)} fill="none" stroke="var(--w-accent)" strokeWidth={stroke} />
        </svg>
      ))}
    </div>
  );
}

/** Where an ornament's band sits: along an edge or in a corner, 1 px in, at most `ORNAMENT_MAX` tall. */
const place = (where: OrnamentAt, inset: number): CSSProperties => {
  const v = where === "tl" || where === "tr" || where === "top" ? { top: 1 } : { bottom: 1 };
  if (where === "top" || where === "bottom") return { ...v, left: "50%", transform: "translateX(-50%)" };
  return { ...v, ...(where === "tl" || where === "bl" ? { left: inset } : { right: inset }) };
};

function Ornament({ item, inset }: { item: PackOrnament; inset: number }) {
  const style: CSSProperties = { position: "absolute", height: ORNAMENT_MAX, maxHeight: ORNAMENT_MAX, overflow: "hidden", lineHeight: px(ORNAMENT_MAX), whiteSpace: "nowrap", ...place(item.at, inset) };
  if (item.kind === "ticks") return <div data-ornament="ticks" style={{ ...style, width: "36%", height: 4, background: "repeating-linear-gradient(90deg, var(--w-accent) 0 1px, transparent 1px 6px)", opacity: 0.8 }} />;
  if (item.kind === "reticle")
    return (
      <svg data-ornament="reticle" width={ORNAMENT_MAX} height={ORNAMENT_MAX} viewBox="0 0 10 10" style={{ ...style, width: ORNAMENT_MAX }}>
        <circle cx="5" cy="5" r="3" fill="none" stroke="var(--w-accent)" strokeWidth="1" />
        <path d="M5 0V10M0 5H10" stroke="var(--w-accent)" strokeWidth="0.75" />
      </svg>
    );
  const label = item.kind === "label";
  // the text is a text node in the Look's mono face and muted colour (the label in its text colour, upper case)
  return (
    <span data-ornament={item.kind} data-part="mono" style={{ ...style, maxWidth: "70%", textOverflow: "ellipsis", fontSize: label ? 9 : 8, letterSpacing: label ? "0.12em" : "0.06em", textTransform: label ? "uppercase" : undefined, color: label ? "var(--w-fg)" : "var(--w-muted)" }}>
      {item.text}
    </span>
  );
}

/** The card's ornaments that show at this screen's size class; a corner next to a cut or notched corner keeps clear of it. */
function Ornaments({ items, frame, screen }: { items: readonly PackOrnament[]; frame?: PackFrame; screen: { width: number; height: number } | undefined }) {
  const sizeClass = screen ? sizeClassOf(screen.width, screen.height) : undefined;
  const shown = items.filter((o) => showsAt(o.minSizeClass, sizeClass));
  if (!shown.length) return null;
  const clear = (where: OrnamentAt) => 4 + (frame && frame.corners !== "square" && (CORNERS as readonly string[]).includes(where) && named(frame).includes(where as Corner) ? frame.size : 0);
  return (
    <div aria-hidden data-pack-decor="ornaments" className="pointer-events-none absolute inset-0">
      {shown.map((o, i) => (
        <Ornament key={`${o.kind}-${o.at}-${i}`} item={o} inset={clear(o.at)} />
      ))}
    </div>
  );
}

/** A pack's frame and ornaments on one card: two click-through layers in the card chrome. `screen` is the page's size, for `minSizeClass` (the window's when unset). */
export function PackDecor({ decor, screen = typeof window === "undefined" ? undefined : { width: window.innerWidth, height: window.innerHeight } }: { decor: PackDecorSpec; screen?: { width: number; height: number } }) {
  return (
    <>
      {decor.frame && <Frame frame={decor.frame} />}
      {decor.ornaments?.length ? <Ornaments items={decor.ornaments} frame={decor.frame} screen={screen} /> : null}
    </>
  );
}
