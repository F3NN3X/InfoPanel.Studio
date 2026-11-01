import { useEffect, useRef } from "react";
import { Pause } from "lucide-react";
import { cn } from "@/lib/utils";

/** How long a press must last to toggle auto-rotate. */
export const LONG_PRESS_MS = 600;
/** Bottom padding the grid reserves while the dots show, in px. */
export const PAGE_DOTS_STRIP_PX = 24;

interface PageDotsProps {
  /** The setting (General › Page dots and swipe). */
  enabled: boolean;
  pages: { id: string; name: string }[];
  current: string;
  /** The profile has a saved auto-rotate that is not running right now. */
  paused: boolean;
  onSelect: (id: string) => void;
  /** Long-press: pause or resume auto-rotate. */
  onToggleRotate: () => void;
}

/**
 * The kiosk's page dots, centred at the bottom: tap one to switch, long-press
 * to pause or resume auto-rotate. Drawn in the dashboard theme; the grid
 * reserves `PAGE_DOTS_STRIP_PX` so the dots never cover a zone.
 */
export function PageDots({ enabled, pages, current, paused, onSelect, onToggleRotate }: PageDotsProps) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (!enabled || pages.length < 2) return null;

  const cancel = () => window.clearTimeout(timer.current);
  return (
    <div
      style={{ height: PAGE_DOTS_STRIP_PX }}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-2"
    >
      <div role="tablist" aria-label="Pages" className="pointer-events-auto flex items-center">
        {pages.map((page) => {
          const active = page.id === current;
          return (
            <button
              key={page.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={page.name}
              onPointerDown={() => {
                fired.current = false;
                cancel();
                timer.current = window.setTimeout(() => {
                  fired.current = true;
                  onToggleRotate();
                }, LONG_PRESS_MS);
              }}
              onPointerUp={cancel}
              onPointerLeave={cancel}
              onPointerCancel={cancel}
              onClick={() => {
                if (fired.current) fired.current = false;
                else onSelect(page.id);
              }}
              className="flex h-6 w-6 items-center justify-center"
            >
              <span className={cn("h-2 w-2 rounded-full", active ? "bg-primary" : "bg-muted-foreground/40")} />
            </button>
          );
        })}
      </div>
      {paused && (
        <span role="img" aria-label="Auto-rotate paused" className="inline-flex">
          <Pause aria-hidden="true" className="h-3 w-3 text-muted-foreground" />
        </span>
      )}
    </div>
  );
}
