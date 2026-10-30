// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectTouch, onTouchMessage, TOUCH_POINTER_BASE } from "@/lib/touch/bridge";
import type { TouchMsg } from "@/lib/touch/types";

/** The page's one EventSource, driven by the test. */
class FakeSource {
  static last: FakeSource | undefined;
  onmessage: ((e: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    FakeSource.last = this;
  }
  send(m: object) {
    this.onmessage?.({ data: JSON.stringify(m) } as MessageEvent<string>);
  }
  close() {
    this.closed = true;
  }
}

const setup = { name: "Bar", width_px: 1920, height_px: 550, prediction_ms: 16, touch_dots: false, debug: false, slop_px: 12, actions: {} };
const pointer = (kind: "Down" | "Move" | "Up", x: number, y = 100) => ({ type: "Pointer", kind, id: 0, x, y, t_ms: 0, sent_ms: 1 });

let button: HTMLButtonElement;
let close: () => void;
let source: FakeSource;
let events: string[];

beforeEach(() => {
  vi.stubGlobal("EventSource", FakeSource);
  // happy-dom lays nothing out: every point is over the button.
  document.elementFromPoint = () => button;
  Object.defineProperty(window, "devicePixelRatio", { value: 2, configurable: true });
  button = document.createElement("button");
  document.body.append(button);
  events = [];
  for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "click", "tp-gesture"]) {
    button.addEventListener(type, (e) => {
      const p = e as PointerEvent;
      events.push(type.startsWith("pointer") ? `${type} ${p.pointerType} ${p.pointerId} ${p.clientX},${p.clientY}` : type);
    });
  }
  close = connectTouch("left bar");
  source = FakeSource.last!;
});

afterEach(() => {
  close();
  button.remove();
  vi.unstubAllGlobals();
});

describe("the kiosk's touch bridge", () => {
  it("reads the panel's stream from this page's server", () => {
    expect(source.url).toBe("/events/touch?panel=left%20bar");
    close();
    expect(source.closed).toBe(true);
  });

  it("turns a tap into touch pointer events in CSS px and a click", () => {
    source.send({ setup }); // slop 12 panel px = 6 CSS px
    source.send(pointer("Down", 200));
    source.send(pointer("Up", 210));
    expect(events).toEqual([
      `pointerdown touch ${TOUCH_POINTER_BASE} 100,50`,
      `pointerup touch ${TOUCH_POINTER_BASE} 105,50`,
      "click",
    ]);
  });

  it("gives no click once the contact moved past the slop (panel px ÷ the pixel ratio)", () => {
    source.send({ setup: { ...setup, slop_px: 12 } });
    source.send(pointer("Down", 200));
    source.send(pointer("Up", 214)); // 7 CSS px: past 6
    expect(events).not.toContain("click");
  });

  it("cancels a live contact when the touchscreen or the connection goes", () => {
    source.send(pointer("Down", 200));
    source.send({ status: "Disconnected", sent_ms: 1 });
    expect(events.at(-1)).toBe(`pointercancel touch ${TOUCH_POINTER_BASE} 100,50`);

    source.send(pointer("Down", 200));
    source.onerror?.();
    expect(events.at(-1)).toBe(`pointercancel touch ${TOUCH_POINTER_BASE} 100,50`);
  });

  it("fires a gesture on the element under it and hands every message to listeners", () => {
    const heard: TouchMsg[] = [];
    const off = onTouchMessage((m) => heard.push(m));
    source.send({ setup });
    source.send({ type: "Gesture", gesture: { type: "Swipe", dir: "Left", fingers: 2 }, x: 400, y: 200, t_ms: 0, sent_ms: 1 });
    source.onerror?.();
    off();
    expect(events).toEqual(["tp-gesture"]);
    expect(heard.map((m) => ("setup" in m ? "setup" : "status" in m ? m.status : m.type))).toEqual(["setup", "Gesture", "Offline"]);
  });

  it("ignores a message that isn't JSON", () => {
    source.onmessage?.({ data: "not json" } as MessageEvent<string>);
    expect(events).toEqual([]);
  });
});
