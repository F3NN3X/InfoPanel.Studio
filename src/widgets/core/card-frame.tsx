// What the shell draws over a card only when a skin or Look asks: a frame, an ornament, a tab band. Each is an absolute,
// click-through child, so none of them changes the card's padding or the rows a widget fits.
import type { ComponentType } from "react";
import { safeFill } from "./t3-tokens";
import { mix } from "./tokens";
import type { SkinTokens } from "./types";

const HUD_CORNERS = ["left-1.5 top-1.5 border-l border-t", "right-1.5 top-1.5 border-r border-t", "left-1.5 bottom-1.5 border-l border-b", "right-1.5 bottom-1.5 border-r border-b"];

const GRADIENT_MASK = "linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0)";

/** `inset`: a thin border set in from the edge (tui). `legend`: the same, 6 px in, under a box-legend title. `corners`: four brackets (hud). `gradient`: a border painted with `fill` (a gradient or colour; anything else, `none` included, draws the accent). */
export function CardFrame({ kind, fill }: { kind: NonNullable<SkinTokens["frame"]>; fill?: string }) {
  if (kind === "gradient")
    return <div className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ border: "1.5px solid transparent", background: `${safeFill(fill) ?? "var(--w-accent)"} border-box`, mask: GRADIENT_MASK, WebkitMask: GRADIENT_MASK, maskComposite: "exclude", WebkitMaskComposite: "xor" }} />;
  // `legend`: a thin border set in 6 px, the line a `box-legend` header's title sits on (the card keeps its own padding).
  if (kind === "legend") return <div className="pointer-events-none absolute inset-1.5 rounded-2 border" style={{ borderColor: mix(45) }} />;
  if (kind === "inset") return <div className="pointer-events-none absolute inset-1.25 rounded-4 border" style={{ borderColor: mix(45, "#3f3f46") }} />;
  return HUD_CORNERS.map((c) => <span key={c} className={`pointer-events-none absolute h-2.5 w-2.5 ${c}`} style={{ borderColor: "var(--w-accent)" }} />);
}

/** A Look's ornament or tab band: `Slot` in a click-through layer over the card, hidden from assistive tech. */
export function CardLayer({ part, Slot }: { part: "ornament" | "tab-band"; Slot: ComponentType }) {
  return (
    <div aria-hidden data-wp-layer={part} className="pointer-events-none absolute inset-0">
      <Slot />
    </div>
  );
}
