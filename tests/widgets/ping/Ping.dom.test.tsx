// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureSensors } from "@/widgets/__fixtures__";
import Ping from "@/widgets/ping/Ping";
import { toFlat } from "@/widgets/shared/data-adapter";

const DATA = toFlat(fixtureSensors());
const KEY = "ping.example-net-443.";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A box of `w` x `h` once the widget measures itself. */
const box = (w: number, h: number) =>
  class {
    constructor(private cb: ResizeObserverCallback) {}
    observe(el: Element) {
      this.cb([{ target: el, contentRect: { width: w, height: h }, borderBoxSize: [{ inlineSize: w, blockSize: h }] } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  };

describe("Ping", () => {
  it("draws the round trip with its word, so the state is not colour alone", () => {
    const { container } = render(<Ping data={DATA} host="example.net" />);
    expect(container.querySelector('[data-part="num"]')?.textContent).toContain("23");
    expect(container.textContent).toContain("Up");
  });

  it("says Slow with a warning glyph and word when the time passes the warn level", () => {
    const { container } = render(<Ping data={{ ...DATA, [`${KEY}ms`]: "180" }} host="example.net" warnMs={100} critMs={250} />);
    expect(container.textContent).toContain("Slow");
    expect(container.textContent).toContain("▲");
    expect(container.textContent).toContain("warning:");
  });

  it("says Down, with a dash and no unit, when the server has no time for a host", () => {
    const data: Record<string, unknown> = { ...DATA, [`${KEY}status`]: "down" };
    delete data[`${KEY}ms`];
    const { container } = render(<Ping data={data as typeof DATA} host="example.net" />);
    expect(container.textContent).toContain("Down");
    expect(container.textContent).toContain("✕");
    expect(container.querySelector('[data-part="num"]')?.textContent).not.toContain("ms");
  });

  it("reads the port in the key: another port is another target, not this one's reading", () => {
    const { container } = render(<Ping data={DATA} host="example.net" port={8080} />);
    expect(container.textContent).toContain("Checking");
    expect(container.textContent).not.toContain("23");
  });

  it("says no host is set instead of reading anything", () => {
    const { container } = render(<Ping data={DATA} />);
    expect(container.textContent).toContain("No host");
  });

  it("draws the average, jitter and loss in a roomy box", () => {
    vi.stubGlobal("ResizeObserver", box(520, 600));
    const { container } = render(<Ping data={DATA} host="example.net" />);
    expect(container.textContent).toContain("Average");
    expect(container.textContent).toContain("Jitter");
    expect(container.textContent).toContain("Loss");
  });
});
