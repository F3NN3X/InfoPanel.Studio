/**
 * The frame both card lists share, Screens and the InfoPanel home, so the two read as one page: the title with its
 * count, the card grid, a section heading and the empty state.
 */
import type { ReactNode } from "react";

/** The column the title, the toolbar and the cards sit in. On a phone it stops scrolling on its own, its page does. */
export const LIST_COLUMN = "flex min-w-0 flex-1 flex-col gap-4 overflow-auto px-6 py-5 max-[899px]:shrink-0 max-[899px]:overflow-visible max-[899px]:px-3";

/** The cards' grid. */
export const CARD_GRID = "grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3";

/** The page title and its count ("Screens · 3 screens"). */
export function ListTitle({ title, count }: { title: string; count: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <h1 className="m-0 text-[15px] font-semibold text-ui-1">{title}</h1>
      <span className="text-caption text-ui-4">{count}</span>
    </div>
  );
}

/** A section's heading over its own grid ("Saved in your Library"). */
export function ListSection({ title }: { title: string }) {
  return <h2 className="m-0 mt-1 text-body font-semibold text-ui-1">{title}</h2>;
}

/** What the page shows when no card is left: nothing matches the search, or nothing exists yet. */
export function ListEmpty({ children }: { children: ReactNode }) {
  return <p className="rounded-[10px] border border-dashed border-ui-default px-4 py-8 text-center text-[12.5px] text-ui-4">{children}</p>;
}
