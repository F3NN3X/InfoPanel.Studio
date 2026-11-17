import { useEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { createRecogniser, type GestureHandlers } from "@/lib/gesture";

/**
 * One target's tap, hold and double tap, through the one recogniser (`src/lib/gesture.ts`): pointer events, the raw-USB
 * `tp-gesture` messages and the keyboard. With `keyboard: "click"` (the page rail) a keyboard click (Enter, Space) is a tap.
 * With `keyboard: "press"` (a Keys key) Enter or Space is pressed and lifted as a finger is, so the keyboard has every
 * gesture: a tap, a hold (the key kept down for the hold's length) and a double tap (two quick presses).
 */
export function useGestures(handlers: GestureHandlers, keyboard: "click" | "press" = "click") {
  const latest = useRef(handlers);
  latest.current = handlers;
  const rec = useMemo(() => createRecogniser(() => latest.current), []);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    const onRaw = (e: Event) => {
      const g = (e as CustomEvent<{ gesture: { type: string } }>).detail?.gesture;
      if (g) rec.gesture(g.type);
    };
    el?.addEventListener("tp-gesture", onRaw);
    return () => {
      el?.removeEventListener("tp-gesture", onRaw);
      rec.dispose();
    };
  }, [rec]);
  const isKey = (e: KeyboardEvent) => e.key === "Enter" || e.key === " ";
  return {
    ref,
    onPointerDown: (e: PointerEvent) => rec.down(e.clientX, e.clientY),
    onPointerMove: (e: PointerEvent) => rec.move(e.clientX, e.clientY),
    onPointerUp: () => rec.up(),
    onPointerCancel: () => rec.cancel(),
    onPointerLeave: () => rec.cancel(),
    // a click the keyboard made (Enter, Space) is a tap; a pointer's click was the recogniser's
    onClick: (e: MouseEvent) => {
      if (keyboard === "click" && e.detail === 0) latest.current.tap?.();
    },
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
    ...(keyboard === "press"
      ? {
          onKeyDown: (e: KeyboardEvent) => {
            if (!isKey(e)) return;
            e.preventDefault();
            if (!e.repeat) rec.down(0, 0);
          },
          onKeyUp: (e: KeyboardEvent) => {
            if (!isKey(e)) return;
            e.preventDefault();
            rec.up();
          },
          onBlur: () => rec.cancel(),
        }
      : {}),
  };
}
