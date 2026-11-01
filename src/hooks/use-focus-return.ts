import { useEffect, type RefObject } from "react";

/**
 * While `active`, focus moves onto `ref` (give it `tabIndex={-1}`) and, when it ends, goes back to what had it: a
 * panel that opens from a button hands the keyboard back to that button.
 */
export function useFocusReturn(ref: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    if (!active) return;
    const before = document.activeElement;
    ref.current?.focus({ preventScroll: true });
    const surface = ref.current;
    return () => {
      // Only when the focus is still in the closing surface (or nowhere): not if the user has moved on.
      const now = document.activeElement;
      const here = !now || now === document.body || (surface?.contains(now) ?? false);
      if (here && before instanceof HTMLElement && before.isConnected) before.focus({ preventScroll: true });
    };
  }, [active, ref]);
}
