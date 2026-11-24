// The kit's card anatomy (T3 `card-style: anatomy`), a card style any widget wears: a category micro-label with the widget's icon in
// tracked capitals, the title large in the display face under it, a rule under the head, and a footer strip with the widget's kind (and
// the layout it draws) as outlined chips. The card's box is the zone's; only a card with room for it (`anatomyFits`) wears it, and a
// smaller one keeps the Look's own header. The names are the widget's catalog entry's (`CardKindCtx`), never the data's.
import { createContext, type ReactNode } from "react";
import { MotionText } from "@/looks/motion-render";
import { Icon } from "./primitives";

/** What the zone's widget is: its catalog name and category, and the name of the layout it draws when that is not the standard one (module.tsx). */
export interface CardKind {
  name: string;
  category: string;
  layout?: string;
}
export const CardKindCtx = createContext<CardKind | undefined>(undefined);

/** The anatomy takes about 70 px of head and footer: a card under these sizes (px, before zoom) keeps the Look's header. */
export const ANATOMY_MIN = { w: 280, h: 240 };
export const anatomyFits = (w: number, h: number): boolean => w >= ANATOMY_MIN.w && h >= ANATOMY_MIN.h;

const RULE = "color-mix(in srgb, var(--w-accent) 35%, transparent)";

/** The micro-label over the title: the category, or the widget's name where the category only repeats the title ("System" over "System"). */
export const anatomyLabel = (kind: CardKind, title: string): string => (kind.category.toLowerCase() === title.trim().toLowerCase() ? kind.name : kind.category);

/** The head: no tone slab (the frame's state tone marks a card in warning), so the display title keeps the card's own colours. */
export function AnatomyHeader({ kind, title, icon, right, w }: { kind: CardKind; title: string; icon?: string; right?: ReactNode; w: number }) {
  const px = Math.round(Math.max(16, Math.min(26, w / 16)));
  return (
    <header data-part="header" data-anatomy="" className="relative z-10 mb-2.5 flex min-w-0 flex-col gap-1 pb-2" style={{ boxShadow: `inset 0 -1px 0 ${RULE}` }}>
      <span data-part="label" className="flex min-w-0 items-center gap-1.5 text-micro font-semibold uppercase leading-none tracking-[0.14em] text-[color:var(--w-accent)]">
        {icon && <Icon name={icon} className="shrink-0 text-caption" />}
        <span className="truncate">{anatomyLabel(kind, title)}</span>
      </span>
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate font-semibold leading-tight text-[color:var(--w-fg)]" style={{ fontSize: px }}>
          <MotionText part="label">{title}</MotionText>
        </span>
        {right && <span className="flex shrink-0 items-center gap-1.5 text-micro">{right}</span>}
      </span>
    </header>
  );
}

export function AnatomyFooter({ kind }: { kind: CardKind }) {
  const chips = [kind.name, kind.layout].filter((c): c is string => !!c);
  return (
    <footer data-anatomy="footer" className="relative z-10 mt-2 flex min-w-0 shrink-0 items-center gap-1.5 overflow-hidden pt-2" style={{ boxShadow: `inset 0 1px 0 ${RULE}` }}>
      {chips.map((c) => (
        <span key={c} data-part="chip" className="shrink-0 truncate px-1.5 py-0.5 text-micro leading-none text-[color:var(--w-muted)]" style={{ boxShadow: `inset 0 0 0 1px ${RULE}` }}>
          {c}
        </span>
      ))}
    </footer>
  );
}
