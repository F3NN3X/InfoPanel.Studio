// The studio slows down while nobody is looking at it: a minute after its window loses focus the shared ticker
// drops to 5 fps and ambient effects (weather, visualisers, drifting art) pause; while the page is hidden the ticker
// stops. Focus comes from the shell's `studio-focus` event in the app (with the reduceUnfocusedAnimation setting),
// from the window's blur and focus in a browser. Kiosks never use this: they are meant to be watched.
import { useEffect } from "react";
import { isTauri, onShellEvent } from "@/lib/desktop";
import { setTickerThrottle, type TickerThrottle } from "@/lib/ticker";

/** How long the studio may sit unfocused before it slows down. */
export const UNFOCUSED_DELAY_MS = 60_000;

export interface FocusState {
  focused: boolean;
  visible: boolean;
  /** When focus was lost; null while focused. */
  blurredAt: number | null;
  /** The reduceUnfocusedAnimation setting (always on in a browser). */
  reduce: boolean;
}

export const initialFocus = (focused: boolean, visible: boolean): FocusState => ({ focused, visible, blurredAt: null, reduce: true });

/** The state after a focus change at `now` (a repeated blur keeps the first time). */
export function focusChanged(s: FocusState, focused: boolean, now: number): FocusState {
  return { ...s, focused, blurredAt: focused ? null : (s.blurredAt ?? now) };
}

/** How the ticker runs in state `s` at `now`. */
export function throttleOf(s: FocusState, now: number): TickerThrottle {
  if (!s.visible) return "stop";
  if (s.focused || !s.reduce || s.blurredAt === null) return "run";
  return now - s.blurredAt >= UNFOCUSED_DELAY_MS ? "slow" : "run";
}

/**
 * Unfocused for the whole delay, whatever the reduceUnfocusedAnimation setting (the Design preview's
 * `frozenWhenUnfocused` follows this).
 */
export function unfocusedLong(s: FocusState, now: number): boolean {
  return !s.focused && s.blurredAt !== null && now - s.blurredAt >= UNFOCUSED_DELAY_MS;
}

/** When `throttleOf` or `unfocusedLong` next changes on its own (the unfocused delay running out), or null. */
export function nextChangeAt(s: FocusState, now: number): number | null {
  if (s.focused || s.blurredAt === null || unfocusedLong(s, now)) return null;
  return s.blurredAt + UNFOCUSED_DELAY_MS;
}

/** `unfocusedLong` for the studio page, published while `useStudioFocusThrottle` runs. */
let longUnfocused = false;
const longListeners = new Set<() => void>();
export const isStudioUnfocusedLong = (): boolean => longUnfocused;
export function subscribeStudioUnfocusedLong(listener: () => void): () => void {
  longListeners.add(listener);
  return () => void longListeners.delete(listener);
}
function publishUnfocusedLong(next: boolean): void {
  if (next === longUnfocused) return;
  longUnfocused = next;
  for (const l of longListeners) l();
}

/** Follows the studio's focus and visibility while `enabled`, throttling the shared ticker; restores it on cleanup. */
export function useStudioFocusThrottle(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let state = initialFocus(document.hasFocus(), document.visibilityState !== "hidden");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const apply = () => {
      clearTimeout(timer);
      const now = performance.now();
      setTickerThrottle(throttleOf(state, now));
      publishUnfocusedLong(unfocusedLong(state, now));
      const at = nextChangeAt(state, now);
      if (at !== null) timer = setTimeout(apply, at - now);
    };
    const onFocus = (focused: boolean) => {
      state = focusChanged(state, focused, performance.now());
      apply();
    };
    const onVisibility = () => {
      state = { ...state, visible: document.visibilityState !== "hidden" };
      apply();
    };
    // Focus moving into one of the studio's own frames is still the studio.
    const onBlur = () => {
      if (!(document.activeElement instanceof HTMLIFrameElement)) onFocus(false);
    };
    const onWindowFocus = () => onFocus(true);
    document.addEventListener("visibilitychange", onVisibility);
    let unlisten: (() => void) | undefined;
    let disposed = false;
    if (isTauri()) {
      // The shell knows the native window's focus; WebView2's own blur and focus don't always follow it.
      void onShellEvent<{ focused: boolean; reduce: boolean }>("studio-focus", (e) => {
        state = { ...state, reduce: e.reduce };
        onFocus(e.focused);
      }).then((off) => (disposed ? off() : (unlisten = off)));
    } else {
      window.addEventListener("blur", onBlur);
      window.addEventListener("focus", onWindowFocus);
    }
    apply();
    return () => {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onWindowFocus);
      unlisten?.();
      setTickerThrottle("run");
      publishUnfocusedLong(false);
    };
  }, [enabled]);
}
