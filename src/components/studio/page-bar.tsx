import type { ReactNode } from "react";
import { isTauri } from "@/lib/desktop";
import { cn } from "@/lib/utils";
import { WindowControls } from "./window-controls";

/**
 * The top bar of every page but Edit's, in Edit's bar's size and tokens (56 px, 40 px under 960 px): the page's title and
 * controls, and in the desktop app the window's title bar, with the caption buttons at the end. A browser has its own
 * frame, so it shows the same header without them. Its empty space (and `BarTitle`, `BarFill`) drags the window.
 * On a phone the studio's own top bar is above, so the header wraps in its row under it.
 */
export function PageBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    // data-tauri-drag-region only acts on the element itself: the empty space is the bar, the gaps and BarFill.
    <header
      data-tauri-drag-region
      className={cn(
        "flex h-14 shrink-0 items-center gap-3 border-b border-ui-subtle bg-ui-chrome pl-4 pr-4 font-ui max-bar:h-10 max-bar:gap-2 max-bar:pl-2 max-bar:pr-2 max-sm:h-auto max-sm:flex-wrap max-sm:px-3 max-sm:py-2",
        isTauri() && "pr-0 max-bar:pr-0",
        className
      )}
    >
      {children}
      <div className="flex self-stretch max-sm:hidden">
        <WindowControls />
      </div>
    </header>
  );
}

/** The empty stretch of the bar: it takes the free width, and drags the window. */
export function BarFill() {
  return <div data-tauri-drag-region className="min-w-0 flex-1 max-sm:hidden" />;
}

/** The page's title, and beside it a note (a count, what the page holds) that shrinks first and goes under 1280 px. */
export function BarTitle({ title, note }: { title: string; note?: ReactNode }) {
  return (
    <>
      <h1 data-tauri-drag-region className="m-0 shrink-0 whitespace-nowrap text-title font-medium text-ui-1">
        {title}
      </h1>
      {note && (
        <span data-tauri-drag-region className="min-w-0 truncate whitespace-nowrap text-caption text-ui-3 max-xl:hidden">
          {note}
        </span>
      )}
    </>
  );
}

/** A page still loading: its bar (so the window keeps its title bar) over the empty page. */
export function PageLoading({ title }: { title: string }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-ui-app">
      <PageBar>
        <BarTitle title={title} />
      </PageBar>
    </div>
  );
}
