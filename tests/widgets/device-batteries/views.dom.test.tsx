// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureSensors } from "@/widgets/__fixtures__";
import DeviceBatteries, { type DeviceBatteriesProps } from "@/widgets/device-batteries/DeviceBatteries";
import { STATE } from "@/widgets/kit";
import { toFlat } from "@/widgets/shared/data-adapter";

// Charge as, the pills, the battery glyph, the one-device rail item and the 1x1 body, over the widget's fixture devices
// (a mouse charging at 93 %, a keyboard asleep and low at 12 %).
const DATA = toFlat(fixtureSensors());
const MOUSE = "1837410529";
const KEYBOARD = "2078156601";

const draw = (props: Partial<DeviceBatteriesProps> = {}) => render(<DeviceBatteries data={DATA} {...props} />);
const rowOf = (c: ParentNode, id: string) => c.querySelector(`[data-device="${id}"]`) as HTMLElement | null;
const fillOf = (el: ParentNode) => el.querySelector('[data-part="charge-bar"]') as SVGElement | null;
const TRACK = ".bg-\\[color\\:var\\(--w-track\\)\\]";
/** A CSS colour as the DOM keeps it. */
const kept = (colour: string) => {
  const probe = document.createElement("div");
  probe.style.color = colour;
  return probe.style.color;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The measured box: the inner content size, and with `borderBox` the outer card too (which gives it a shape). */
const box = (w: number, h: number, borderBox = false) =>
  class {
    constructor(private cb: ResizeObserverCallback) {}
    observe(el: Element) {
      const entry = { target: el, contentRect: { width: w, height: h }, ...(borderBox ? { borderBoxSize: [{ inlineSize: w, blockSize: h }] } : null) };
      this.cb([entry as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  };

describe("Charge as", () => {
  it("percent leaves a list row without its bar; bar leaves it without its number but keeps it in the title", () => {
    const pct = draw({ show: "percent" });
    expect(rowOf(pct.container, MOUSE)?.textContent).toContain("93%");
    expect(rowOf(pct.container, MOUSE)?.querySelector(TRACK)).toBeNull();
    cleanup();
    const bar = draw({ show: "bar" });
    const row = rowOf(bar.container, MOUSE) as HTMLElement;
    expect(row.querySelector('[data-part="num"]')).toBeNull();
    expect(row.getAttribute("title")).toContain("93%");
    expect(row.querySelector(TRACK)).not.toBeNull();
  });

  it("applies to the rail's mini rows", () => {
    vi.stubGlobal("ResizeObserver", box(72, 76));
    const pct = draw({ view: "list", size: "xs", show: "percent" });
    expect(pct.container.textContent).toContain("93%");
    expect(pct.container.querySelectorAll('[data-part="charge-bar"]')).toHaveLength(0);
    cleanup();
    const bar = draw({ view: "list", size: "xs", show: "bar" });
    expect(bar.container.textContent).not.toContain("93%");
    expect(bar.container.querySelectorAll('[data-part="charge-bar"]')).toHaveLength(2);
  });

  it("applies to the pills", () => {
    const pct = draw({ view: "pills", show: "percent" });
    expect(pct.container.querySelectorAll('[data-part="battery-glyph"]')).toHaveLength(0);
    expect(pct.container.textContent).toContain("93%");
    cleanup();
    const bar = draw({ view: "pills", show: "bar" });
    expect(bar.container.querySelectorAll('[data-part="battery-glyph"]')).toHaveLength(2);
    expect(bar.container.textContent).not.toContain("93%");
  });
});

describe("the pills view", () => {
  it("draws a wrapping chip per device with its icon, glyph, bolt and charge", () => {
    const { container } = draw({ view: "pills" });
    expect((container.querySelector(".flex-wrap") as HTMLElement).className).toContain("gap-1.5");
    const mouse = rowOf(container, MOUSE) as HTMLElement;
    expect(mouse.className).toContain("rounded-full");
    // the kind icon and the bolt
    expect(mouse.querySelectorAll('[data-part="icon"]')).toHaveLength(2);
    expect(mouse.querySelector('[data-part="battery-glyph"]')).not.toBeNull();
    expect(mouse.textContent).toContain("93%");
    expect(rowOf(container, KEYBOARD)?.className).toContain("opacity-60");
  });

  it("leaves a disconnected device out unless Options show them", () => {
    const data = { ...DATA, "battery.333.name": "Pad", "battery.333.percent": "55 %", "battery.333.kind": "controller", "battery.333.connected": "no", "battery.333.asleep": "no" };
    expect(rowOf(render(<DeviceBatteries data={data} view="pills" />).container, "333")).toBeNull();
    cleanup();
    expect(rowOf(render(<DeviceBatteries data={data} view="pills" showDisconnected />).container, "333")).not.toBeNull();
  });
});

describe("the battery glyph", () => {
  it("fills the shell by the charge, in the charge's colour", () => {
    const { container } = draw({ view: "pills" });
    const mouse = fillOf(rowOf(container, MOUSE) as HTMLElement) as SVGElement;
    const keyboard = fillOf(rowOf(container, KEYBOARD) as HTMLElement) as SVGElement;
    // 17.5 units of room inside the shell
    expect(Number(mouse.getAttribute("width"))).toBeCloseTo(17.5 * 0.93, 5);
    expect(Number(keyboard.getAttribute("width"))).toBeCloseTo(17.5 * 0.12, 5);
    expect(keyboard.style.fill).toBe(kept(STATE.crit));
    expect(mouse.style.fill).toBe(kept("var(--w-accent)"));
  });

  it("draws no fill for an empty charge or a device that never reported", () => {
    const data = { "battery.1.name": "A", "battery.1.percent": "0 %", "battery.2.name": "B" };
    const { container } = render(<DeviceBatteries data={data} view="pills" />);
    expect(container.querySelectorAll('[data-part="battery-glyph"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-part="charge-bar"]')).toHaveLength(0);
  });
});

describe("the one-device rail item", () => {
  it("stacks the icon, glyph and charge of the picked device in the narrow slot", () => {
    vi.stubGlobal("ResizeObserver", box(72, 76));
    const { container } = draw({ view: "single", size: "xs", singleDevice: KEYBOARD });
    expect(container.querySelectorAll("[data-device]")).toHaveLength(1);
    expect(container.textContent).toContain("12%");
    expect(container.querySelectorAll('[data-part="charge-bar"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-part="ring"]')).toHaveLength(0);
  });

  it("follows Charge as: percent drops the glyph, bar drops the number", () => {
    vi.stubGlobal("ResizeObserver", box(72, 76));
    const pct = draw({ view: "single", size: "xs", show: "percent" });
    expect(pct.container.textContent).toContain("12%");
    expect(fillOf(pct.container)).toBeNull();
    cleanup();
    const bar = draw({ view: "single", size: "xs", show: "bar" });
    expect(bar.container.textContent).not.toContain("12%");
    expect(fillOf(bar.container)).not.toBeNull();
  });
});

describe("a 1x1 zone", () => {
  it("draws the one-device stack of the lowest charge as its body, not the summary card", () => {
    vi.stubGlobal("ResizeObserver", box(140, 140, true));
    const { container } = draw({ view: "list" });
    expect(container.querySelector('[data-wp-view="body"]')).not.toBeNull();
    expect(container.querySelectorAll("[data-device]")).toHaveLength(1);
    expect(rowOf(container, KEYBOARD)).not.toBeNull();
    expect(container.textContent).toContain("12%");
    expect(fillOf(container)).not.toBeNull();
  });

  it("draws the picked device in the single view, and follows Charge as", () => {
    vi.stubGlobal("ResizeObserver", box(140, 140, true));
    const { container } = draw({ view: "single", singleDevice: MOUSE, show: "percent" });
    expect(rowOf(container, MOUSE)).not.toBeNull();
    expect(container.textContent).toContain("93%");
    expect(fillOf(container)).toBeNull();
  });

  it("keeps the summary card when the widget is set to Summary card", () => {
    vi.stubGlobal("ResizeObserver", box(140, 140, true));
    const { container } = draw({ compactView: "on" });
    expect(container.querySelector('[data-wp-view="compact"]')).not.toBeNull();
  });
});
