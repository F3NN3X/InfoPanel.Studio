// @vitest-environment happy-dom
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useElementSize } from "./use-element-size";

let fire: (w: number, h: number) => void = () => {};
class Observer {
  constructor(private cb: ResizeObserverCallback) {}
  observe(target: Element) {
    fire = (w, h) => this.cb([{ target, contentRect: { width: w, height: h } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

function Probe({ hold }: { hold: boolean }) {
  const { ref, w, h } = useElementSize(hold);
  return (
    <div ref={ref} data-testid="probe">
      {w}x{h}
    </div>
  );
}

describe("useElementSize", () => {
  beforeEach(() => void vi.stubGlobal("ResizeObserver", Observer));

  it("follows a hidden element down to 0 x 0 by default", () => {
    const { getByTestId } = render(<Probe hold={false} />);
    act(() => fire(500, 300));
    act(() => fire(0, 0));
    expect(getByTestId("probe").textContent).toBe("0x0");
  });

  it("keeps the last real size while hidden when asked to, and follows again once shown", () => {
    const { getByTestId } = render(<Probe hold />);
    act(() => fire(500, 300));
    act(() => fire(0, 0));
    expect(getByTestId("probe").textContent).toBe("500x300");
    act(() => fire(640, 360));
    expect(getByTestId("probe").textContent).toBe("640x360");
  });
});
