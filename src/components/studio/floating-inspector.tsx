import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useFocusReturn } from "@/hooks/use-focus-return";
import { cn } from "@/lib/utils";
import { trackPointer } from "./pointer-drag";
import { FLOAT_MARGIN, FLOAT_WIDTH } from "./studio-layout";

interface FloatingInspectorProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** Where a press starts a drag: the inspector's header, but not its buttons and fields. */
const FIELDS = "button, a, input, select, textarea, [role='button'], [contenteditable='true']";

/** A card offset kept inside its box: it may leave its resting corner but never the canvas. */
export function clampFloat(offset: { x: number; y: number }, card: { width: number; height: number }, box: { width: number; height: number }) {
  const room = (boxSize: number, cardSize: number) => Math.max(0, boxSize - cardSize - 2 * FLOAT_MARGIN);
  return {
    x: Math.min(0, Math.max(-room(box.width, card.width), offset.x)),
    y: Math.min(room(box.height, card.height), Math.max(0, offset.y)),
  };
}

/**
 * The narrow window's inspector (SPEC §3.5): a 280 px card inset 10 px from the canvas's right, dragged by its
 * header and closed with Esc or its ✕. It stays mounted while closed, so its tab, scroll and search survive.
 */
export function FloatingInspector({ open, onClose, children }: FloatingInspectorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);
  useFocusReturn(ref, open);

  const begin = (e: PointerEvent<HTMLDivElement>) => {
    const card = ref.current;
    const box = card?.offsetParent;
    if (!card || !box || e.button !== 0 || !(e.target instanceof Element)) return;
    if (!e.target.closest("[data-inspector-header]") || e.target.closest(FIELDS)) return;
    const from = { px: e.clientX, py: e.clientY, ...offset };
    stop.current = trackPointer(
      (m) =>
        setOffset(
          clampFloat(
            { x: from.x + m.clientX - from.px, y: from.y + m.clientY - from.py },
            { width: card.offsetWidth, height: card.offsetHeight },
            { width: box.clientWidth, height: box.clientHeight }
          )
        ),
      () => (stop.current = null)
    );
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape" || e.defaultPrevented || !e.currentTarget.contains(e.target as Node)) return;
    e.preventDefault();
    e.stopPropagation();
    onClose();
  };

  return (
    <div
      ref={ref}
      onPointerDown={begin}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={{ width: FLOAT_WIDTH, margin: FLOAT_MARGIN, transform: `translate(${offset.x}px, ${offset.y}px)` }}
      className={cn(
        "absolute bottom-0 right-0 top-0 z-40 flex overflow-hidden rounded-xl outline-none border border-ui-strong shadow-[0_16px_40px_rgba(0,0,0,.5)] [&_[data-inspector-header]]:cursor-grab [&_[data-inspector-header]]:select-none",
        !open && "hidden"
      )}
    >
      {children}
    </div>
  );
}
