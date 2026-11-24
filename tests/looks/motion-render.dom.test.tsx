// @vitest-environment happy-dom
// A pack's motion in a card (L117, src/looks/motion-render.tsx): a card without motion draws exactly as before; with it, labels and numbers
// keep their real text in the page with an aria-hidden copy beside it, the card carries its arrival and its layer, and reduced motion,
// lite mode and the FX level Off draw none of it.
import { act, render } from "@testing-library/react";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MotionOverride, PerformanceProvider } from "@/hooks/use-performance";
import { GeneralProvider } from "@/hooks/use-general";
import { GENERAL_DEFAULTS, type ResolvedGeneral } from "@/lib/general";
import type { PackMotion } from "@/looks/motion";
import { MotionCtx, MotionRow, MotionText, type MotionSlot } from "@/looks/motion-render";
import { planMotion } from "@/looks/motion";
import { Metric } from "@/widgets/core/primitives";
import { Widget } from "@/widgets/core/Widget";
import fixture from "../fixtures/packs/motion/motion.json";

const ALL = fixture as PackMotion;
const slot = (spec: PackMotion = ALL, knobs = {}): MotionSlot => ({ spec, knobs });
const FULL = planMotion(ALL, {}, { level: "full", lite: false, reduceMotion: false });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
});
afterEach(() => {
  // every run ends on the fake clock, so the runtime's one loop is idle for the next test (the order is shuffled)
  act(() => void vi.advanceTimersByTime(5000));
  vi.useRealTimers();
});

// biome-ignore lint/correctness/noChildrenProp: the Widget takes a render function as children.
const card = (props: Record<string, unknown> = {}) => h(Widget, { size: "lg", title: "CPU", icon: "memory", packId: "p", children: () => h(Metric, { label: "Load", value: 41, unit: "%" }), ...props });
const general = (fx?: "full" | "calm" | "off", motion?: "reduce" | "full"): ResolvedGeneral => ({ ...GENERAL_DEFAULTS, motion: motion ?? "full", ...(fx ? { fx } : null) });
const onScreen = (node: ReturnType<typeof h>, g = general()) =>
  render(
    <GeneralProvider value={g}>
      <PerformanceProvider value={undefined}>{node}</PerformanceProvider>
    </GeneralProvider>
  ).container;

describe("a card without motion", () => {
  it("renders the same markup as before (no slot, or a slot nothing plans)", () => {
    const plain = renderToString(card());
    expect(plain).not.toMatch(/data-mo-/);
    expect(renderToString(card({ slots: { motion: slot({ sweep: { on: false } }) } }))).toBe(plain);
  });

  it("MotionText is the bare text without a plan, and for anything but text", () => {
    const bare = render(<MotionText part="label">Load</MotionText>).container;
    expect(bare.innerHTML).toBe("Load");
    const node = render(
      <MotionCtx.Provider value={FULL}>
        <MotionText part="num">
          <b>7</b>
        </MotionText>
      </MotionCtx.Provider>
    ).container;
    expect(node.innerHTML).toBe("<b>7</b>");
  });
});

describe("a card with motion at Full", () => {
  it("keeps the real text in the page, with an empty aria-hidden copy between runs", () => {
    const root = onScreen(card({ slots: { motion: slot() } }));
    const label = root.querySelector('[data-part="label"] [data-mo-text]')!;
    expect(label.firstChild?.textContent).toBe("Load");
    expect(label.querySelector("[data-mo-copy]")?.getAttribute("aria-hidden")).toBe("true");
    act(() => void vi.advanceTimersByTime(1000));
    expect(label.querySelector("[data-mo-copy]")?.textContent).toBe("");
    expect(root.querySelector('[data-part="num"] [data-mo-text]')?.firstChild?.textContent).toBe("41");
  });

  it("decodes a label as it arrives: the noise is in the copy, never the text", () => {
    const root = onScreen(card({ slots: { motion: slot({ decode: { ms: 400 } }) } }));
    const label = root.querySelector('[data-part="label"] [data-mo-text]')!;
    expect(label.hasAttribute("data-mo-on")).toBe(true);
    act(() => void vi.advanceTimersByTime(100));
    expect(label.querySelector("[data-mo-copy]")?.textContent).toHaveLength(4);
    expect(label.firstChild?.textContent).toBe("Load");
  });

  it("carries its timing on the card, the arrival on its layer, and tears its texts on arrival", () => {
    const root = onScreen(card({ slots: { motion: slot() } }));
    const el = root.querySelector<HTMLElement>('[data-part="card"]')!;
    expect(el.style.getPropertyValue("--mo-glitch-ms")).toBe("240ms");
    expect(root.querySelector('[data-mo-layer][data-mo-arrive="line"]')).not.toBeNull();
    expect(root.querySelectorAll("[data-mo-glitch]").length).toBeGreaterThan(0);
    const faded = onScreen(card({ slots: { motion: slot({ arrival: { style: "fade" } }) } }));
    expect(faded.querySelector('[data-part="card"] > [data-mo-arrive="fade"]')).not.toBeNull();
  });
});

describe("what stops it", () => {
  it.each([
    ["reduced motion", general(undefined, "reduce")],
    ["the FX level Off", general("off")],
  ])("%s draws none of it", (_name, g) => {
    const root = onScreen(card({ slots: { motion: slot() } }), g);
    expect(root.innerHTML).not.toMatch(/data-mo-/);
  });

  it("the frozen preview (MotionOverride) draws none of it", () => {
    const root = onScreen(<MotionOverride reduce>{card({ slots: { motion: slot() } })}</MotionOverride>);
    expect(root.innerHTML).not.toMatch(/data-mo-/);
  });

  it("Calm keeps the one-shots and drops the sweep", () => {
    const root = onScreen(card({ slots: { motion: slot({ sweep: { every: 4 }, decode: {} }) } }), general("calm"));
    expect(root.querySelector("[data-mo-layer]")).toBeNull();
    expect(root.querySelector("[data-mo-text]")).not.toBeNull();
  });
});

describe("values, lists and the boot in a card", () => {
  const metric = (value: number, slotted: MotionSlot) =>
    // biome-ignore lint/correctness/noChildrenProp: the Widget takes a render function as children.
    h(Widget, { size: "lg", title: "CPU", icon: "memory", packId: "p", slots: { motion: slotted }, children: () => h(Metric, { label: "Load", value, unit: "%" }) });
  const wrap = (node: ReturnType<typeof h>) => (
    <GeneralProvider value={general()}>
      <PerformanceProvider value={undefined}>{node}</PerformanceProvider>
    </GeneralProvider>
  );

  it("a number with value rolls when its reading changes, the reading in the page at once; value wins over scramble", () => {
    const motion = slot({ value: { style: "roll", ms: 300, every: 1 }, scramble: { every: 1 } });
    const view = render(wrap(metric(41, motion)));
    act(() => void vi.advanceTimersByTime(2000));
    view.rerender(wrap(metric(57, motion)));
    const num = view.container.querySelector('[data-part="num"] [data-mo-text]')!;
    expect(num.firstChild?.textContent).toBe("57");
    expect(num.hasAttribute("data-mo-on")).toBe(true);
    expect(num.querySelectorAll("[data-mo-reel]")).toHaveLength(2);
  });

  it("a list row carries its key only while the card's plan has a list", () => {
    const plain = render(
      <MotionRow as="li" rowKey="Ada" className="x">
        Ada
      </MotionRow>
    ).container;
    expect(plain.innerHTML).toBe('<li class="x">Ada</li>');
    const listed = render(
      <MotionCtx.Provider value={planMotion({ list: {} }, {}, { level: "full", lite: false, reduceMotion: false })}>
        <MotionRow as="li" rowKey="Ada">
          Ada
        </MotionRow>
      </MotionCtx.Provider>
    ).container;
    expect(listed.querySelector("li")?.getAttribute("data-mo-key")).toBe("Ada");
  });

  it("a boot marks the card's content for it and draws its line layer; a plan without one adds neither", () => {
    const booted = onScreen(card({ slots: { motion: slot({ boot: {} }) } }));
    expect(booted.querySelector('[data-part="card"] > [data-mo-body]')).not.toBeNull();
    expect(booted.querySelector("[data-mo-layer]")).not.toBeNull();
    expect(booted.querySelector('[data-part="header"] [data-mo-text]')).not.toBeNull();
    const old = onScreen(card({ slots: { motion: slot({ decode: {}, scramble: {} }) } }));
    expect(old.innerHTML).not.toMatch(/data-mo-(body|key|layer)/);
  });
});
