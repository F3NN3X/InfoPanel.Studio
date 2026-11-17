// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Timer, { BTN_H, presetsThatFit } from "@/widgets/timer/Timer";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A box of `w` × `h` once the widget measures itself (an unmeasured one draws the 4x4 tiles). */
const box = (w: number, h: number) =>
  class {
    constructor(private cb: ResizeObserverCallback) {}
    observe(el: Element) {
      this.cb([{ target: el, contentRect: { width: w, height: h } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  };

describe("Timer touch targets", () => {
  it("makes the preset chips at least 44 px tall", () => {
    vi.stubGlobal("ResizeObserver", box(200, 100));
    render(<Timer data={{}} />);
    const chip = screen.getByLabelText("Start 5 minute timer");
    expect(chip.className).toContain("h-11");
    expect(BTN_H).toBeGreaterThanOrEqual(44);
  });

  it("keeps both chips a 1x1 Timer had (90 x 90 inside its padding), each 44 px at least each way", () => {
    vi.stubGlobal("ResizeObserver", box(90, 90));
    render(<Timer data={{}} />);
    for (const m of [5, 15]) {
      const chip = screen.getByLabelText(`Start ${m} minute timer`);
      expect(chip.className).toContain("h-11");
      expect(chip.className).toContain("min-w-11");
    }
    // two across, two rows of 44 px with 2 px gaps: nothing the 90 px box could hold is dropped
    expect(presetsThatFit(3, 90, 90)).toBe(3);
    expect(presetsThatFit(3, 90, 43)).toBe(2);
  });
});
