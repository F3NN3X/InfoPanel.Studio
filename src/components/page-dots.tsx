import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

/** How long a press must last to toggle auto-rotate. */
export const LONG_PRESS_MS = 600;
/** Bottom padding the grid reserves while the dots show, in px. */
export const PAGE_DOTS_STRIP_PX = 24;
/** The same on a coarse pointer (a touch screen), where targets are 44 px. */
export const PAGE_DOTS_STRIP_TOUCH_PX = 44;
/** The strip height for the pointer in use now. */
export const pageDotsStripPx = () => (window.matchMedia("(pointer: coarse)").matches ? PAGE_DOTS_STRIP_TOUCH_PX : PAGE_DOTS_STRIP_PX);
/** How long the Pause button stays after the last touch, click or key, ms. */
export const PAUSE_SHOW_MS = 4000;

interface PageDotsProps {
  /** The setting (General › Page dots and swipe). */
  enabled: boolean;
  /** A scrolling page: the strip gets a backdrop so content scrolling under it stays legible. */
  scroll?: boolean;
  pages: { id: string; name: string }[];
  current: string;
  /** The profile has auto-rotate saved on. */
  rotateOn: boolean;
  /** The profile has a saved auto-rotate that is not running right now. */
  paused: boolean;
  onSelect: (id: string) => void;
  /** Long-press: pause or resume auto-rotate. */
  onToggleRotate: () => void;
}

/**
 * The kiosk's page dots, centred at the bottom: tap one to switch, long-press
 * (or the Pause button, when auto-rotate is on) to pause or resume auto-rotate. Drawn in the dashboard theme; the grid
 * reserves `PAGE_DOTS_STRIP_PX` so the dots never cover a zone.
 */
export function PageDots({ enabled, scroll, pages, current, rotateOn, paused, onSelect, onToggleRotate }: PageDotsProps) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  const reduced = useReducedMotion();
  // The Pause button shows after any touch, click or key, and while it has keyboard focus.
  const [awake, setAwake] = useState(false);
  const [focused, setFocused] = useState(false);
  const sleep = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!rotateOn) return;
    const wake = () => {
      setAwake(true);
      window.clearTimeout(sleep.current);
      sleep.current = window.setTimeout(() => setAwake(false), PAUSE_SHOW_MS);
    };
    document.addEventListener("pointerdown", wake);
    document.addEventListener("keydown", wake);
    return () => {
      document.removeEventListener("pointerdown", wake);
      document.removeEventListener("keydown", wake);
      window.clearTimeout(sleep.current);
    };
  }, [rotateOn]);
  if (!enabled || pages.length < 2) return null;

  const cancel = () => window.clearTimeout(timer.current);
  return (
    <div
      style={{ height: pageDotsStripPx() }}
      className={cn("pointer-events-none fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-2", scroll && "bg-gradient-to-t from-background to-transparent")}
    >
      <div role="group" aria-label="Pages" className="pointer-events-auto relative flex items-center">
        {pages.map((page) => {
          const active = page.id === current;
          return (
            <button
              key={page.id}
              type="button"
              aria-current={active ? "page" : undefined}
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
              className="flex h-6 w-6 items-center justify-center rounded-full kiosk-focus pointer-coarse:h-11 pointer-coarse:w-11"
            >
              <span className={cn("h-2 rounded-full", active ? "w-4 bg-primary" : "w-2 bg-muted-foreground/70")} />
            </button>
          );
        })}
        {rotateOn && (
          <button
            type="button"
            aria-pressed={paused}
            aria-label="Pause auto-rotate"
            onClick={onToggleRotate}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className={cn(
              "absolute left-full ml-1 flex h-6 w-6 pointer-coarse:h-11 pointer-coarse:w-11 items-center justify-center rounded-full text-muted-foreground kiosk-focus",
              !reduced && "transition-opacity duration-300",
              awake || focused ? "opacity-100" : "pointer-events-none opacity-0"
            )}
          >
            {paused ? <Play aria-hidden="true" className="h-3 w-3" /> : <Pause aria-hidden="true" className="h-3 w-3" />}
          </button>
        )}
      </div>
    </div>
  );
}
