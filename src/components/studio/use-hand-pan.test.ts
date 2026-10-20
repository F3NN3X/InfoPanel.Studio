// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NO_PAN, panBy, useHandPan } from "./use-hand-pan";

const pointer = (type: string, button: number, x: number, y: number) =>
  new PointerEvent(type, { button, clientX: x, clientY: y, pointerId: 1, bubbles: true, cancelable: true });
const key = (type: string, target: EventTarget = document.body) => {
  const e = new KeyboardEvent(type, { code: "Space", key: " ", bubbles: true, cancelable: true });
  act(() => void target.dispatchEvent(e));
  return e;
};

afterEach(() => {
  document.body.replaceChildren();
});

const setup = () => {
  const el = document.body.appendChild(document.createElement("div"));
  const child = el.appendChild(document.createElement("div"));
  const hook = renderHook(() => useHandPan(el));
  const send = (e: Event, target: EventTarget = el) => act(() => void target.dispatchEvent(e));
  return { el, child, hook, send };
};

describe("panBy", () => {
  it("adds the drag to the offset", () => {
    expect(panBy({ x: 5, y: -5 }, 10, 20)).toEqual({ x: 15, y: 15 });
  });
});

describe("useHandPan", () => {
  it("pans with the middle button at any zoom, and keeps the zone's pointerdown from firing", () => {
    const { el, child, hook, send } = setup();
    const zoneDown = vi.fn();
    child.addEventListener("pointerdown", zoneDown);
    const down = pointer("pointerdown", 1, 10, 10);
    send(down, child);
    expect(down.defaultPrevented).toBe(true);
    expect(zoneDown).not.toHaveBeenCalled();
    expect(el.dataset.hand).toBe("grabbing");
    send(pointer("pointermove", 1, 40, 30));
    expect(hook.result.current.pan).toEqual({ x: 30, y: 20 });
    send(pointer("pointerup", 1, 40, 30));
    expect(el.dataset.hand).toBeUndefined();
  });

  it("pans with Space + left drag, from where the last pan ended", () => {
    const { el, hook, send } = setup();
    expect(key("keydown").defaultPrevented).toBe(true);
    expect(el.dataset.hand).toBe("grab");
    send(pointer("pointerdown", 0, 0, 0));
    send(pointer("pointermove", 0, 10, 0));
    send(pointer("pointerup", 0, 10, 0));
    send(pointer("pointerdown", 0, 0, 0));
    send(pointer("pointermove", 0, 5, 5));
    expect(hook.result.current.pan).toEqual({ x: 15, y: 5 });
    key("keyup");
    send(pointer("pointerup", 0, 5, 5));
    expect(el.dataset.hand).toBeUndefined();
  });

  it("leaves a plain left drag to the canvas", () => {
    const { child, hook, send } = setup();
    const zoneDown = vi.fn();
    child.addEventListener("pointerdown", zoneDown);
    send(pointer("pointerdown", 0, 0, 0), child);
    send(pointer("pointermove", 0, 50, 50));
    expect(zoneDown).toHaveBeenCalled();
    expect(hook.result.current.pan).toEqual(NO_PAN);
  });

  it("swallows the click that ends a drag", () => {
    const { el, send } = setup();
    const onClick = vi.fn();
    el.addEventListener("click", onClick);
    send(pointer("pointerdown", 1, 0, 0));
    send(pointer("pointermove", 1, 20, 0));
    send(pointer("pointerup", 1, 20, 0));
    send(new MouseEvent("click", { bubbles: true }));
    expect(onClick).not.toHaveBeenCalled();
    send(new MouseEvent("click", { bubbles: true }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("leaves Space to a focused button or a field", () => {
    const { el } = setup();
    const button = document.body.appendChild(document.createElement("button"));
    const input = document.body.appendChild(document.createElement("input"));
    expect(key("keydown", button).defaultPrevented).toBe(false);
    expect(key("keydown", input).defaultPrevented).toBe(false);
    expect(el.dataset.hand).toBeUndefined();
  });

  it("resets, and the next drag starts from the centre", () => {
    const { hook, send } = setup();
    send(pointer("pointerdown", 1, 0, 0));
    send(pointer("pointermove", 1, 30, 30));
    send(pointer("pointerup", 1, 30, 30));
    act(() => hook.result.current.resetPan());
    expect(hook.result.current.pan).toEqual(NO_PAN);
    send(pointer("pointerdown", 1, 0, 0));
    send(pointer("pointermove", 1, 5, 0));
    expect(hook.result.current.pan).toEqual({ x: 5, y: 0 });
  });

  it("cancels the browser's middle-click autoscroll", () => {
    const { el, send } = setup();
    const e = new MouseEvent("mousedown", { button: 1, cancelable: true });
    send(e, el);
    expect(e.defaultPrevented).toBe(true);
  });
});
