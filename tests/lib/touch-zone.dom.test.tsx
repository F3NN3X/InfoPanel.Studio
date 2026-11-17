// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RailHostContext, type RailHost } from "@/components/rail-host";
import { useTouchZone } from "@/components/use-touch-zone";
import { DOUBLE_TAP_MS, HOLD_MS } from "@/lib/gesture";
import type { TouchAction, TouchMap } from "@/lib/pinned";
import { attachTouch, onControl, touchHandlers } from "@/lib/touch-zone";

// A widget's own touch actions (Placement.touch, P6): tap, hold and double tap on the widget's box, from pointer events,
// raw-USB gestures and the keyboard, with a press on the widget's own controls left to them.

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

/** A widget box with a body and a button of its own. */
function widget() {
  const el = document.createElement("div");
  el.tabIndex = 0;
  el.innerHTML = `<div data-body><span data-text>42 %</span></div><button type="button">Mute</button><div role="slider" aria-valuenow="3"></div>`;
  document.body.append(el);
  return { el, body: el.querySelector<HTMLElement>("[data-text]")!, button: el.querySelector("button")!, slider: el.querySelector<HTMLElement>("[role=slider]")! };
}

const press = (target: Element, x = 10, y = 10) => {
  target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: x, clientY: y }));
  target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: x, clientY: y }));
};

const PAGE: TouchAction = { op: "page", to: "next" };
const MUTE: TouchAction = { op: "audio", body: { target: "windows", op: "mute", kind: "input", id: "mic" } };
const MEDIA: TouchAction = { op: "media", key: "play-pause" };

describe("attachTouch", () => {
  it("runs the tap, the hold and the double tap, each once", () => {
    const { el, body } = widget();
    const ran: TouchAction[] = [];
    const stop = attachTouch(el, () => touchHandlers({ tap: PAGE, hold: MUTE, doubleTap: MEDIA }, (a) => ran.push(a)));
    press(body);
    vi.advanceTimersByTime(DOUBLE_TAP_MS + 1);
    expect(ran).toEqual([PAGE]);
    body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    vi.advanceTimersByTime(HOLD_MS);
    body.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    expect(ran).toEqual([PAGE, MUTE]);
    press(body);
    press(body);
    vi.advanceTimersByTime(DOUBLE_TAP_MS + 1);
    expect(ran).toEqual([PAGE, MUTE, MEDIA]);
    stop();
  });

  it("leaves a press on the widget's own controls to them, and a drag to the page's swipe", () => {
    const { el, body, button, slider } = widget();
    const ran: TouchAction[] = [];
    const stop = attachTouch(el, () => touchHandlers({ tap: PAGE }, (a) => ran.push(a)));
    press(button);
    press(slider);
    body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    body.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 60, clientY: 10 }));
    body.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    vi.advanceTimersByTime(1000);
    expect(ran).toEqual([]);
    expect(onControl(button, el)).toBe(true);
    expect(onControl(body, el)).toBe(false);
    expect(onControl(el, el)).toBe(false);
    stop();
  });

  it("takes a raw-USB gesture and the keyboard's tap, and stops listening when stopped", () => {
    const { el, body, button } = widget();
    const ran: TouchAction[] = [];
    const stop = attachTouch(el, () => touchHandlers({ tap: PAGE, hold: MUTE }, (a) => ran.push(a)));
    body.dispatchEvent(new CustomEvent("tp-gesture", { bubbles: true, detail: { gesture: { type: "LongPress" } } }));
    button.dispatchEvent(new CustomEvent("tp-gesture", { bubbles: true, detail: { gesture: { type: "Tap" } } }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(ran).toEqual([MUTE, PAGE]);
    stop();
    press(body);
    vi.advanceTimersByTime(1000);
    expect(ran).toEqual([MUTE, PAGE]);
  });

  it("keeps the context menu from a long press only while a hold is set", () => {
    const { el, body } = widget();
    let map: TouchMap = { hold: MUTE };
    const stop = attachTouch(el, () => touchHandlers(map, () => {}));
    const menu = () => body.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(menu()).toBe(false);
    map = { tap: PAGE };
    expect(menu()).toBe(true);
    stop();
  });
});

/** A widget box whose touch map the hook listens for. */
function Widget({ touch }: { touch?: TouchMap }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useTouchZone(el, touch);
  return <div ref={setEl} data-testid="w" />;
}

describe("useTouchZone", () => {
  it("runs through the screen's runner, and not where there is none", async () => {
    const ran: TouchAction[] = [];
    const host = { run: (a: TouchAction) => ran.push(a) } as unknown as RailHost;
    const { getByTestId } = render(
      <RailHostContext.Provider value={host}>
        <Widget touch={{ tap: PAGE }} />
      </RailHostContext.Provider>
    );
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    press(getByTestId("w"));
    expect(ran).toEqual([PAGE]);
    cleanup();
    render(<Widget touch={{ tap: PAGE }} />);
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    press(document.querySelector("[data-testid=w]")!);
    expect(ran).toEqual([PAGE]);
  });

  it("hears a widget the instant it mounts, as a page a tap just showed (P-B12), and says which gesture ran", async () => {
    const ran: [TouchAction, string | undefined][] = [];
    const host = { run: (a: TouchAction, g?: string) => ran.push([a, g]) } as unknown as RailHost;
    // page one's widget loads the listeners
    render(
      <RailHostContext.Provider value={host}>
        <Widget touch={{ tap: PAGE }} />
      </RailHostContext.Provider>
    );
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    cleanup();
    // page two's widget: a double tap sent before anything else settles lands
    const { getByTestId } = render(
      <RailHostContext.Provider value={host}>
        <Widget touch={{ doubleTap: MEDIA }} />
      </RailHostContext.Provider>
    );
    press(getByTestId("w"));
    press(getByTestId("w"));
    vi.advanceTimersByTime(DOUBLE_TAP_MS + 1);
    expect(ran).toEqual([[MEDIA, "doubleTap"]]);
  });
});
