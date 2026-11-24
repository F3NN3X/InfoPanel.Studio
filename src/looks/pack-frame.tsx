// What the app draws of a pack's `frame` and `ornaments` (spec 03, L108): in the card chrome, over the card, never in a widget's box.
// Both are absolute, click-through layers marked `data-pack-decor`, drawn from the numbers pack.json gives (px, a corner, a name) and
// the Look's own accent, muted text and mono font; the text an ornament carries is a text node, never markup. The only thing that
// reaches the card itself is the clip-path of a `cut` or `notch` frame (`frameClip`), which the render check measures like any card clip.
import { createContext, useContext, type CSSProperties } from "react";
import { showsAt, sizeClassOf } from "./effects";
import type { Pack, PackSlots } from "./pack";
import { CORNERS, FRAME_DOUBLE_GAP, ORNAMENT_MAX, type Corner, type FrameCorners, type FrameEdge, type OrnamentAt, type PackFrame, type PackOrnament } from "./pack-json";

/** The tone a frame's lines are drawn in: the accent, or (`tone: state`) the card's warning or critical colour while it shows one (treatments.css sets `--wp-frame-ink`). */
export const frameInk = (frame: Pick<PackFrame, "tone">): string => (frame.tone === "state" ? "var(--wp-frame-ink, var(--w-accent))" : "var(--w-accent)");

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

const named = (frame: PackFrame): readonly Corner[] => frame.which ?? CORNERS;

/** The colour of a frame's lines and spine: the accent, laid over the card at the frame's `alpha` (the kit's 55 % panel line); the tab stays solid. */
export const lineColour = (frame: PackFrame): string => (frame.alpha === undefined || frame.alpha >= 1 ? frameInk(frame) : `color-mix(in srgb, ${frameInk(frame)} ${Math.round(frame.alpha * 100)}%, transparent)`);
/** The tone at `share` (0 to 1) over the card: the tint, the band, the grid's dots. */
const wash = (frame: PackFrame, share: number): string => `color-mix(in srgb, ${frameInk(frame)} ${Math.round(share * 100)}%, transparent)`;
const px = (n: number) => `${n}px`;

/** What a corner of the frame is: its own kind, else the frame's where `which` names it, else plain. */
const kindAt = (frame: PackFrame, corner: Corner): FrameCorners => frame.byCorner?.[corner] ?? (named(frame).includes(corner) ? frame.corners : "square");

/** The card's clip-path for a frame that cuts or notches its corners (undefined for the others: they clip nothing). */
export function frameClip(frame: PackFrame | undefined): string | undefined {
  if (!frame || frame.size <= 0 || !CORNERS.some((c) => kindAt(frame, c) === "cut" || kindAt(frame, c) === "notch")) return undefined;
  const s = px(frame.size);
  const far = `calc(100% - ${s})`;
  const pts: string[] = [];
  // clockwise from the top left; a corner that is cut or notched is replaced by its two cut points or its three notch points
  const at = (c: Corner, cut: string[], notch: string[], plain: string) => pts.push(...(kindAt(frame, c) === "cut" ? cut : kindAt(frame, c) === "notch" ? notch : [plain]));
  at("tl", [`0 ${s}`, `${s} 0`], [`0 ${s}`, `${s} ${s}`, `${s} 0`], "0 0");
  at("tr", [`${far} 0`, `100% ${s}`], [`${far} 0`, `${far} ${s}`, `100% ${s}`], "100% 0");
  at("br", [`100% ${far}`, `${far} 100%`], [`100% ${far}`, `${far} ${far}`, `${far} 100%`], "100% 100%");
  at("bl", [`${s} 100%`, `0 ${far}`], [`${s} 100%`, `${s} ${far}`, `0 ${far}`], "0 100%");
  return `polygon(${pts.join(", ")})`;
}

const FLIP: Record<Corner, { place: CSSProperties; flip: string }> = {
  tl: { place: { top: 0, left: 0 }, flip: "none" },
  tr: { place: { top: 0, right: 0 }, flip: "scaleX(-1)" },
  br: { place: { bottom: 0, right: 0 }, flip: "scale(-1, -1)" },
  bl: { place: { bottom: 0, left: 0 }, flip: "scaleY(-1)" },
};

/** The stroke at one corner, drawn as for the top left (the corner's own flip mirrors it), kept inside the card by half its width; `inset` px further in for the second line of a double frame. */
function strokePath(kind: FrameCorners, size: number, stroke: number, inset = 0): string {
  const s = size;
  const h = stroke / 2;
  if (kind === "cut") {
    const c = s + stroke / Math.SQRT2 + inset * Math.SQRT2;
    return `M0 ${c} L${c} 0`;
  }
  if (kind === "notch") return `M0 ${s + h + inset} L${s + h + inset} ${s + h + inset} L${s + h + inset} 0`;
  return `M${h + inset} ${s} L${h + inset} ${h + inset} L${s} ${h + inset}`;
}

const EDGE_BOX: Record<FrameEdge, (w: number) => CSSProperties> = {
  left: (w) => ({ top: 0, bottom: 0, left: 0, width: w }),
  right: (w) => ({ top: 0, bottom: 0, right: 0, width: w }),
  top: (w) => ({ left: 0, right: 0, top: 0, height: w }),
  bottom: (w) => ({ left: 0, right: 0, bottom: 0, height: w }),
};

/**
 * The card's frame: a hairline for `square`, a stroked mark at each corner that is cut, bracketed or notched, a second line inside
 * the first (`double`), an accent bar along an edge (`spine`) and a solid tab (`tab`). Nothing when it draws nothing. `pad` is the
 * card's padding: what would reach into the content (a spine, a tab, a second line) is left out.
 */
function Frame({ frame, pad }: { frame: PackFrame; pad?: number }) {
  const stroke = frame.stroke ?? 1;
  const roomFor = (n: number) => pad === undefined || pad >= n;
  const double = !!frame.double && stroke > 0 && roomFor(2 * stroke + FRAME_DOUBLE_GAP);
  const line = stroke > 0 && (frame.corners === "square" || frame.size > 0);
  const marks = line && frame.size > 0 ? CORNERS.filter((c) => kindAt(frame, c) !== "square") : [];
  const { spine, tab, band, tint, grid } = frame;
  const spineShown = spine && roomFor(spine.width);
  // a tab drawn outside the card is the outside layer's (`PackFrameOut`)
  const tabShown = tab && !tab.out && roomFor(tab.height);
  // a band draws at most the padding wide, so it never reaches the content
  const bandWidth = band ? Math.min(band.width, pad ?? band.width) : 0;
  if (!(line && (frame.corners === "square" || marks.length > 0)) && !spineShown && !tabShown && !bandWidth && !tint && !grid) return null;
  const ink = lineColour(frame);
  const ring = (inset: number): CSSProperties => ({ position: "absolute", inset, borderRadius: "inherit", boxShadow: `inset 0 0 0 ${px(stroke)} ${ink}` });
  const tabInset = tab && frame.size > 0 && (kindAt(frame, tab.at) === "cut" || kindAt(frame, tab.at) === "notch") ? frame.size : 0;
  return (
    <div aria-hidden data-pack-decor="frame" className={`pointer-events-none absolute inset-0${frame.corners === "square" ? " rounded-[inherit]" : ""}`} style={frame.corners === "square" && line ? { boxShadow: `inset 0 0 0 ${px(stroke)} ${ink}` } : undefined}>
      {tint ? <div data-frame-part="tint" style={{ position: "absolute", inset: 0, background: wash(frame, tint) }} /> : null}
      {grid && <div data-frame-part="grid" style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(circle, ${wash(frame, grid.alpha ?? 0.3)} 1px, transparent 1.5px)`, backgroundSize: `${grid.size}px ${grid.size}px`, backgroundPosition: `${grid.size / 2}px ${grid.size / 2}px` }} />}
      {bandWidth > 0 && band && <div data-frame-part="band" style={{ position: "absolute", top: 0, bottom: 0, width: bandWidth, ...(band.edge === "left" ? { left: 0 } : { right: 0 }), background: wash(frame, 0.14), boxShadow: `${band.edge === "left" ? "inset -1px" : "inset 1px"} 0 0 ${ink}` }} />}
      {frame.corners === "square" && double && <div style={ring(stroke + FRAME_DOUBLE_GAP)} />}
      {marks.map((c) => {
        const kind = kindAt(frame, c);
        return (
          <svg key={c} width={frame.size} height={frame.size} viewBox={`0 0 ${frame.size} ${frame.size}`} style={{ position: "absolute", overflow: "visible", ...FLIP[c].place, transform: FLIP[c].flip }}>
            <path d={strokePath(kind, frame.size, stroke)} fill="none" stroke={ink} strokeWidth={stroke} />
            {double && <path d={strokePath(kind, frame.size, stroke, stroke + FRAME_DOUBLE_GAP)} fill="none" stroke={ink} strokeWidth={stroke} />}
          </svg>
        );
      })}
      {spineShown && <div data-frame-part="spine" style={{ position: "absolute", background: ink, ...EDGE_BOX[spine.edge](spine.width) }} />}
      {tabShown && (
        <div data-frame-part="tab" style={{ position: "absolute", background: "var(--w-accent)", width: tab.width, height: tab.height, ...(tab.at === "tl" || tab.at === "tr" ? { top: 0 } : { bottom: 0 }), ...(tab.at === "tl" || tab.at === "bl" ? { left: tabInset } : { right: tabInset }) }} />
      )}
    </div>
  );
}

/**
 * What a frame draws outside its card: a glow round it, a caption above it and a tab that protrudes from its edge (`framesOutside`). One
 * click-through layer the card's own size, in the card's host (Widget.tsx), so no card or body rect changes: the glow is its box-shadow, the
 * caption and the tab its pseudo-elements (treatments.css), the caption's text an attribute, never markup. `style` carries the card's accent
 * and muted text, which are set on the card and not on its host.
 */
export function PackFrameOut({ frame, style }: { frame: PackFrame; style?: CSSProperties }) {
  const { glow, caption, tab } = frame;
  const out = tab?.out ? tab : undefined;
  const tabInset = out && frame.size > 0 && (kindAt(frame, out.at) === "cut" || kindAt(frame, out.at) === "notch") ? frame.size : 0;
  return (
    <div
      aria-hidden
      data-pack-decor="frame-out"
      data-caption={caption?.text}
      data-caption-at={caption ? (caption.at ?? "tl") : undefined}
      data-tab-at={out?.at}
      className="pointer-events-none absolute inset-0"
      style={{
        ...style,
        ...(glow ? { boxShadow: `0 0 ${px(glow.radius)} ${wash(frame, glow.alpha ?? 0.35)}` } : null),
        ...(out ? ({ "--wp-tab-w": px(out.width), "--wp-tab-h": px(out.height), "--wp-tab-x": px(tabInset) } as CSSProperties) : null),
      }}
    />
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

/** The card's ornaments that show at this screen's size class; a corner ornament keeps clear of a cut or notched corner and of a spine on its side. */
function Ornaments({ items, frame, screen }: { items: readonly PackOrnament[]; frame?: PackFrame; screen: { width: number; height: number } | undefined }) {
  const sizeClass = screen ? sizeClassOf(screen.width, screen.height) : undefined;
  const shown = items.filter((o) => showsAt(o.minSizeClass, sizeClass));
  if (!shown.length) return null;
  const clear = (where: OrnamentAt) => {
    if (!frame || !(CORNERS as readonly string[]).includes(where)) return 4;
    const cut = kindAt(frame, where as Corner) !== "square" ? frame.size : 0;
    const side = where === "tl" || where === "bl" ? "left" : "right";
    return 4 + Math.max(cut, frame.spine?.edge === side ? frame.spine.width : 0, frame.band?.edge === side ? frame.band.width : 0);
  };
  return (
    <div aria-hidden data-pack-decor="ornaments" className="pointer-events-none absolute inset-0">
      {shown.map((o, i) => (
        <Ornament key={`${o.kind}-${o.at}-${i}`} item={o} inset={clear(o.at)} />
      ))}
    </div>
  );
}

/** The size of the page a card sits on, where that is not the window's (the studio canvas draws a page at its own size); unset: the window is the page, as in the kiosk. */
export const PageSizeCtx = createContext<{ width: number; height: number } | undefined>(undefined);

/** A pack's frame and ornaments on one card: two click-through layers in the card chrome; no ornaments where the padding is not over the band. `screen` is the page's size, for `minSizeClass` (else the page context's, else the window's). */
export function PackDecor({ decor, pad, screen: given }: { decor: PackDecorSpec; /** The card's padding, px; a card whose padding is not over the ornament band draws no ornaments, and no spine, tab or second line wider than it (L110 Q4). Unset: unknown, drawn. */ pad?: number; screen?: { width: number; height: number } }) {
  const page = useContext(PageSizeCtx);
  const screen = given ?? page ?? (typeof window === "undefined" ? undefined : { width: window.innerWidth, height: window.innerHeight });
  // the band is 1 px in and `ORNAMENT_MAX` tall, so it clears the content only where the padding is more than that
  const roomy = pad === undefined || pad > ORNAMENT_MAX;
  return (
    <>
      {decor.frame && <Frame frame={decor.frame} pad={pad} />}
      {roomy && decor.ornaments?.length ? <Ornaments items={decor.ornaments} frame={decor.frame} screen={screen} /> : null}
    </>
  );
}
