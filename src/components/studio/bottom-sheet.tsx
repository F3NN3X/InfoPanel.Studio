import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SHEET_MIN, nearestSnap, sheetHeight, type SheetSnap } from "./studio-layout";

/** A handle movement under this many px is a tap. */
const TAP_PX = 4;

interface BottomSheetProps {
  snap: SheetSnap;
  onSnap: (snap: SheetSnap) => void;
  /** The height now (the dragged one while the handle moves). */
  height: number;
  /** The canvas area's height. */
  area: number;
  /** Something is selected (a taller peek). */
  selected: boolean;
  /** The height while the handle is dragged (null at rest). */
  drag: number | null;
  onDrag: (height: number | null) => void;
  children: ReactNode;
}

/**
 * The phone's inspector: a sheet anchored to the bottom of the canvas area
 * that rests at a peek, half or full height. The handle drags it (it snaps
 * to the nearest height on release); a tap toggles peek and half.
 */
export function BottomSheet({ snap, onSnap, height, area, selected, drag, onDrag, children }: BottomSheetProps) {
  const start = useRef<{ y: number; height: number; moved: boolean } | null>(null);
  const full = sheetHeight("full", area, selected);

  return (
    <div
      data-bottom-sheet={snap}
      className={cn(
        "absolute inset-x-0 bottom-0 z-40 flex flex-col overflow-hidden rounded-t-2xl border border-b-0 border-ui-strong bg-ui-panel shadow-[0_-12px_32px_rgba(0,0,0,.5)]",
        drag === null && "transition-[height] duration-[280ms] ease-[cubic-bezier(.2,.8,.2,1)]"
      )}
      style={{ height }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={snap === "peek" ? "Expand the settings sheet" : "Collapse the settings sheet"}
        className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          start.current = { y: e.clientY, height, moved: false };
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const dy = s.y - e.clientY;
          if (!s.moved && Math.abs(dy) < TAP_PX) return;
          s.moved = true;
          onDrag(Math.max(SHEET_MIN, Math.min(full, s.height + dy)));
        }}
        onPointerUp={(e) => {
          const s = start.current;
          start.current = null;
          if (!s) return;
          if (!s.moved) onSnap(snap === "peek" ? "half" : "peek");
          else onSnap(nearestSnap(Math.max(SHEET_MIN, Math.min(full, s.height + s.y - e.clientY)), area, selected));
          onDrag(null);
        }}
        onPointerCancel={() => {
          start.current = null;
          onDrag(null);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          onSnap(snap === "peek" ? "half" : "peek");
        }}
      >
        <span aria-hidden className="h-[5px] w-10 rounded-full bg-ui-control" />
      </div>
      <div className="flex min-h-0 flex-1">{children}</div>
    </div>
  );
}
