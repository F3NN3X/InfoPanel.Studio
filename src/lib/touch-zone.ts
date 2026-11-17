/**
 * A widget's own touch actions on the kiosk (decision 10, `Placement.touch`, pinned layer P6): a tap, a hold and a double
 * tap on the widget each run their action, through the one recogniser (`gesture.ts`), from pointer events, the raw-USB
 * `tp-gesture` messages and, for the tap, Enter or Space on the focused widget. A press that starts on one of the widget's
 * own controls (a button, a slider, a link) is the control's, so a mute button in a widget with a tap action still mutes.
 * Loaded only by a screen with a widget that has a touch map (`use-touch-zone.ts`), so the kiosk entry carries none of it.
 */
import { createRecogniser, type GestureHandlers, type GestureTimers } from "./gesture";
import type { TouchAction, TouchMap } from "./pinned";

/** What counts as a widget's own control: a press on one is left to it. */
export const CONTROL = "button, a[href], input, select, textarea, [role=button], [role=slider], [role=switch], [role=checkbox], [role=link], [contenteditable=true], [data-no-touch]";

/** Whether `target` lies in one of `root`'s own controls (the root itself is not one). */
export function onControl(target: EventTarget | null, root: Element): boolean {
  const el = target instanceof Element ? target.closest(CONTROL) : null;
  return el !== null && el !== root && root.contains(el);
}

/** A touch map's gestures as the recogniser's handlers: an unset gesture does nothing. */
export const touchHandlers = (touch: TouchMap | undefined, run: (a: TouchAction) => void): GestureHandlers =>
  Object.fromEntries(
    (["tap", "hold", "doubleTap"] as const).flatMap((g) => {
      const action = touch?.[g];
      return action ? [[g, () => run(action)]] : [];
    })
  );

/**
 * Listens on `el` (the widget's box) for its gestures; `handlers` is read at each one, so the map may change. Returns the
 * function that stops listening and drops a waiting tap or hold.
 */
export function attachTouch(el: HTMLElement, handlers: () => GestureHandlers, timers?: GestureTimers): () => void {
  const rec = createRecogniser(handlers, timers);
  const down = (e: PointerEvent) => {
    if (e.button === 0 && !onControl(e.target, el)) rec.down(e.clientX, e.clientY);
  };
  const move = (e: PointerEvent) => rec.move(e.clientX, e.clientY);
  const up = () => rec.up();
  const cancel = () => rec.cancel();
  const raw = (e: Event) => {
    const g = (e as CustomEvent<{ gesture?: { type: string } }>).detail?.gesture;
    if (g && !onControl(e.target, el)) rec.gesture(g.type);
  };
  // the keyboard's tap: Enter or Space on the widget itself, never on a control inside it
  const key = (e: KeyboardEvent) => {
    if (e.target !== el || (e.key !== "Enter" && e.key !== " ")) return;
    const tap = handlers().tap;
    if (!tap) return;
    e.preventDefault();
    tap();
  };
  // a long press on a touch screen opens the context menu; with a hold set, the hold is what it does
  const menu = (e: Event) => {
    if (handlers().hold && !onControl(e.target, el)) e.preventDefault();
  };
  const on: [string, EventListener][] = [
    ["pointerdown", down as EventListener],
    ["pointermove", move as EventListener],
    ["pointerup", up],
    ["pointercancel", cancel],
    ["pointerleave", cancel],
    ["tp-gesture", raw],
    ["keydown", key as EventListener],
    ["contextmenu", menu],
  ];
  for (const [type, fn] of on) el.addEventListener(type, fn);
  return () => {
    for (const [type, fn] of on) el.removeEventListener(type, fn);
    rec.dispose();
  };
}
