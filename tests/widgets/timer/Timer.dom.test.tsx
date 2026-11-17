// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Timer, { BTN_H } from "@/widgets/timer/Timer";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A 2x1 box once the widget measures itself (an unmeasured one draws the 4x4 tiles). */
class SmallBox {
  constructor(private cb: ResizeObserverCallback) {}
  observe(el: Element) {
    this.cb([{ target: el, contentRect: { width: 200, height: 100 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

describe("Timer touch targets", () => {
  it("makes the preset chips at least 44 px tall", () => {
    vi.stubGlobal("ResizeObserver", SmallBox);
    render(<Timer data={{}} />);
    const chip = screen.getByLabelText("Start 5 minute timer");
    expect(chip.className).toContain("h-11");
    expect(BTN_H).toBeGreaterThanOrEqual(44);
  });
});
