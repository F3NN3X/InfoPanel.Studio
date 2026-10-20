import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { WindowControls } from "@/components/studio/window-controls";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { startWindowDrag } from "@/lib/desktop";
import { cn } from "@/lib/utils";

/** The strip stays this long after the pointer leaves it. */
const HIDE_DELAY_MS = 1200;

interface KioskStripProps {
  /** Return to the studio. */
  onBack: () => void;
  /** Close the window (the shell hides it to the tray or quits). */
  onClose: () => void;
}

/**
 * Drags the window from the strip's empty space. Done by hand rather than with
 * `data-tauri-drag-region`, whose double-click would maximize the fixed-size Kiosk view.
 */
const dragWindow = (e: React.MouseEvent) => {
  if (e.button === 0 && e.detail === 1 && !(e.target as Element).closest("button")) void startWindowDrag();
};

/**
 * The desktop app's Kiosk view has no title bar. An invisible 8px zone along the top edge fades in a
 * 32px strip over the page (drag region, Back to studio, Minimize, Close); it goes about 1.2 s after
 * the pointer leaves it. It takes no layout space and, hidden, no clicks.
 */
export function KioskStrip({ onBack, onClose }: KioskStripProps) {
  const [shown, setShown] = useState(false);
  const timer = useRef<number>(undefined);
  const reduced = useReducedMotion();
  const cancel = () => window.clearTimeout(timer.current);
  const show = () => {
    cancel();
    setShown(true);
  };
  const hideSoon = () => {
    cancel();
    timer.current = window.setTimeout(() => setShown(false), HIDE_DELAY_MS);
  };
  useEffect(() => cancel, []);
  return (
    <>
      <div aria-hidden className={cn("fixed inset-x-0 top-0 z-[60] h-2", shown && "pointer-events-none")} onPointerEnter={show} />
      <div
        inert={!shown}
        onMouseDown={dragWindow}
        onPointerEnter={show}
        onPointerLeave={hideSoon}
        className={cn(
          "fixed inset-x-0 top-0 z-[61] flex h-8 select-none items-center border-b border-ui-subtle bg-ui-chrome font-ui",
          !reduced && "transition-opacity duration-150",
          shown ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <button
          type="button"
          onClick={onBack}
          className="ml-1 flex h-6 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-ui-2 transition-colors hover:bg-ui-hover hover:text-ui-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} /> Back to studio
        </button>
        <div className="flex-1 self-stretch" />
        <WindowControls maximize={false} onClose={onClose} />
      </div>
    </>
  );
}
