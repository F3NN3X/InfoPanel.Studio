// @vitest-environment happy-dom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { panScroll, useMiddlePan } from "./use-middle-pan";

const pointer = (type: string, button: number, x: number, y: number) =>
  new PointerEvent(type, { button, clientX: x, clientY: y, pointerId: 1, bubbles: true, cancelable: true });

afterEach(() => {
  document.body.innerHTML = "";
});

describe("panScroll", () => {
  it("moves the scroll against the pointer", () => {
    expect(panScroll({ left: 100, top: 50 }, 30, -20)).toEqual({ left: 70, top: 70 });
  });
});

describe("useMiddlePan", () => {
  const setup = () => {
    const el = document.body.appendChild(document.createElement("div"));
    el.scrollLeft = 100;
    el.scrollTop = 100;
    const hook = renderHook(() => useMiddlePan(el));
    return { el, hook };
  };

  it("pans with the middle button and stops on release", () => {
    const { el } = setup();
    const down = pointer("pointerdown", 1, 10, 10);
    el.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(el.style.cursor).toBe("grabbing");
    el.dispatchEvent(pointer("pointermove", 1, 30, 25));
    expect([el.scrollLeft, el.scrollTop]).toEqual([80, 85]);
    el.dispatchEvent(pointer("pointerup", 1, 30, 25));
    expect(el.style.cursor).toBe("");
    el.dispatchEvent(pointer("pointermove", 1, 60, 60));
    expect([el.scrollLeft, el.scrollTop]).toEqual([80, 85]);
  });

  it("leaves the left button alone", () => {
    const { el } = setup();
    const down = pointer("pointerdown", 0, 10, 10);
    el.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
    el.dispatchEvent(pointer("pointermove", 0, 50, 50));
    expect([el.scrollLeft, el.scrollTop]).toEqual([100, 100]);
  });

  it("cancels the browser's middle-click autoscroll", () => {
    const { el } = setup();
    const e = new MouseEvent("mousedown", { button: 1, cancelable: true });
    el.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it("stops listening on unmount", () => {
    const { el, hook } = setup();
    hook.unmount();
    el.dispatchEvent(pointer("pointerdown", 1, 10, 10));
    el.dispatchEvent(pointer("pointermove", 1, 50, 50));
    expect([el.scrollLeft, el.scrollTop]).toEqual([100, 100]);
  });
});
