// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GeneralProvider } from "@/hooks/use-general";
import { GENERAL_DEFAULTS, type ResolvedGeneral } from "@/lib/general";
import PackStageLayers from "@/looks/pack-stage";
import type { StageViewProps } from "@/looks/pack";

const stage: StageViewProps["stage"] = {
  layers: [{ fill: "linear-gradient(#000, #111)" }, { image: "art.svg", minSizeClass: "md" }],
  effects: [{ kind: "grain", cost: "animated" }, { kind: "glow", cost: "filter", px: 10 }],
};

const view = (general: Partial<ResolvedGeneral>, props: Partial<StageViewProps> = {}) =>
  render(
    <GeneralProvider value={{ ...GENERAL_DEFAULTS, ...general }}>
      <PackStageLayers stage={stage} packId="p" {...props} />
    </GeneralProvider>,
  );

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const Overlay = () => <i />;

describe("the pack stage: effects, burn-in and size classes", () => {
  it("marks layers for the drift only on a needs-shift pack with Pixel shift on", () => {
    view({ pixelShift: true }, { burnIn: "needs-shift" });
    expect(document.querySelector("[data-pack-layer='0']")?.getAttribute("data-pack-deco")).toBe("shift");
    cleanup();
    view({ pixelShift: true }, { burnIn: "static-safe" });
    expect(document.querySelector("[data-pack-layer='0']")?.getAttribute("data-pack-deco")).toBe("");
    cleanup();
    view({}, { burnIn: "needs-shift" });
    expect(document.querySelector("[data-pack-layer='0']")?.getAttribute("data-pack-deco")).toBe("");
  });

  it("dims the layers after the idle time without input, and wakes on input", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    view({ idleDim: 5 }, { burnIn: "needs-dim" });
    const layer = () => document.querySelector("[data-pack-layer='0']")!;
    expect(layer().hasAttribute("data-idle")).toBe(false);
    act(() => vi.advanceTimersByTime(5 * 60_000 + 10));
    expect(layer().hasAttribute("data-idle")).toBe(true);
    act(() => window.dispatchEvent(new Event("pointerdown")));
    expect(layer().hasAttribute("data-idle")).toBe(false);
  });

  it("hides a layer under its size class and draws the effects the plan keeps", () => {
    view({}, { page: { width: 800, height: 480 } });
    expect(document.querySelectorAll("[data-pack-layer]")).toHaveLength(1);
    expect(document.querySelector("[data-pack-effect='grain']")?.hasAttribute("data-pack-animate")).toBe(true);
    // a plain fill takes no glow: its shadow would fall off the screen (L81)
    expect(document.querySelector(".wp-pack-fx")).toBeNull();
    cleanup();
    view({}, { page: { width: 1920, height: 1080 } });
    expect(document.querySelectorAll("[data-pack-layer]")).toHaveLength(2);
  });

  it("puts the glow on the layer with art, in the Look's accent, and on no plain fill", () => {
    view({}, { stage: { ...stage, accent: "#2BD46F" } });
    const fx = document.querySelectorAll<HTMLElement>(".wp-pack-fx");
    expect(fx).toHaveLength(1);
    expect(fx[0].getAttribute("data-pack-layer")).toBe("1");
    expect(fx[0].style.getPropertyValue("--wp-fx-glow")).toBe("10px");
    expect(fx[0].style.getPropertyValue("--w-accent")).toBe("#2BD46F");
    expect(document.querySelector("[data-pack-layer='0']")?.getAttribute("style")).not.toContain("--wp-fx");
  });

  it("drops the animated effects in lite mode", () => {
    view({ maxFps: 30 });
    expect(document.querySelector("[data-pack-effect='grain']")).toBeNull();
  });

  describe("FX levels", () => {
    const flash: StageViewProps["stage"] = {
      layers: [{ fill: "#111" }],
      effects: [
        { kind: "scanlines", cost: "animated", calm: "static" },
        { kind: "glitch", cost: "animated", rate: 2, calm: "off" },
      ],
    };
    const fxView = (general: Partial<ResolvedGeneral>) =>
      render(
        <GeneralProvider value={{ ...GENERAL_DEFAULTS, ...general }}>
          <PackStageLayers stage={flash} packId="p" />
        </GeneralProvider>,
      );
    const effect = (kind: string) => document.querySelector<HTMLElement>(`[data-pack-effect='${kind}']`);

    it("full animates the flashing overlay at its rate, a pointer-transparent div that carries its pulse strength", () => {
      fxView({});
      expect(effect("glitch")?.hasAttribute("data-pack-animate")).toBe(true);
      expect(effect("glitch")?.style.getPropertyValue("--wp-fx-rate")).toBe("2");
      expect(effect("glitch")?.style.getPropertyValue("--wp-fx-op")).toBe("0.25");
      expect(effect("glitch")?.className).toContain("pointer-events-none");
    });

    it("calm draws the calm variants: scanlines still, glitch gone", () => {
      fxView({ fx: "calm" });
      expect(effect("scanlines")?.hasAttribute("data-pack-animate")).toBe(false);
      expect(effect("glitch")).toBeNull();
    });

    it("off draws no effect but keeps the page layers", () => {
      fxView({ fx: "off" });
      expect(document.querySelector("[data-pack-effect]")).toBeNull();
      expect(document.querySelector("[data-pack-layer='0']")).not.toBeNull();
    });

    it("an explicit full still caps at calm in lite mode, and unset follows reduced motion", () => {
      fxView({ fx: "full", maxFps: 30 });
      expect(effect("scanlines")?.hasAttribute("data-pack-animate")).toBe(false);
      expect(effect("glitch")).toBeNull();
      cleanup();
      fxView({ motion: "reduce" });
      expect(document.querySelector("[data-pack-effect]")).toBeNull();
    });
  });

  it("keeps data-pack-layer as the pack's own index when the size class hides an earlier layer", () => {
    const hidden: StageViewProps["stage"] = { layers: [{ fill: "#111", minSizeClass: "md" }, { fill: "#222" }] };
    render(
      <GeneralProvider value={GENERAL_DEFAULTS}>
        <PackStageLayers stage={hidden} packId="p" page={{ width: 800, height: 480 }} />
      </GeneralProvider>,
    );
    expect([...document.querySelectorAll("[data-pack-layer]")].map((el) => el.getAttribute("data-pack-layer"))).toEqual(["1"]);
  });

  describe("burn-in protection", () => {
    const faint: StageViewProps["stage"] = { layers: [{ fill: "#222", opacity: 0.1 }], effects: [{ kind: "vignette", cost: "static", opacity: 0.5 }] };
    const faintView = (general: Partial<ResolvedGeneral>, props: Partial<StageViewProps> = {}) =>
      render(
        <GeneralProvider value={{ ...GENERAL_DEFAULTS, ...general }}>
          <PackStageLayers stage={faint} packId="p" {...props} />
        </GeneralProvider>,
      );

    it("idle dim scales a layer's own opacity, so a faint layer gets dimmer and never brighter", () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
      faintView({ idleDim: 5 }, { burnIn: "needs-dim" });
      const layer = () => document.querySelector<HTMLElement>("[data-pack-layer='0']")!;
      expect(Number(layer().style.opacity)).toBeCloseTo(0.1);
      const fx = () => document.querySelector<HTMLElement>("[data-pack-effect='vignette']")!;
      const awake = Number(fx().style.opacity);
      act(() => vi.advanceTimersByTime(5 * 60_000 + 10));
      expect(Number(layer().style.opacity)).toBeCloseTo(0.035);
      expect(Number(fx().style.opacity)).toBeCloseTo(awake * 0.35);
      act(() => window.dispatchEvent(new Event("pointerdown")));
      expect(Number(layer().style.opacity)).toBeCloseTo(0.1);
    });

    it("dims the overlay and the connectors with the layers", () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
      faintView({ idleDim: 5 }, { burnIn: "needs-dim", stage: { ...faint, overlay: Overlay }, connectors: { style: "line" }, links: [["a", "b"]] });
      act(() => vi.advanceTimersByTime(5 * 60_000 + 10));
      expect(document.querySelector<HTMLElement>("[data-pack-layer='overlay']")!.style.opacity).toBe("0.35");
      expect(document.querySelector<HTMLElement>("[data-pack-connectors]")!.style.opacity).toBe("0.35");
    });

    it.each([
      ["Max FPS under 60", { maxFps: 30 }],
      ["reduced motion", { motion: "reduce" as const }],
    ])("pixel shift still steps its offset with %s, layers, effects and connectors together", (_, perf) => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      faintView({ pixelShift: true, ...perf }, { burnIn: "needs-shift", connectors: { style: "line" }, links: [["a", "b"]] });
      const at = (sel: string) => document.querySelector<HTMLElement>(sel)!.style.transform;
      expect(at("[data-pack-layer='0']")).toContain("translate(0px, 0px)");
      act(() => vi.advanceTimersByTime(150_000));
      expect(at("[data-pack-layer='0']")).toContain("translate(1px, 0px)");
      expect(at("[data-pack-connectors]")).toContain("translate(1px, 0px)");
    });
  });
});

describe("the effects' colour (v3): the screen's accent, a variant's, not the pack's own", () => {
  const flashing: StageViewProps["stage"] = { layers: [{ image: "art.svg" }], effects: [{ kind: "glitch", cost: "animated", rate: 0.25 }, { kind: "glow", cost: "filter", px: 10 }], accent: "#FF3B45" };
  const accentOf = (sel: string) => document.querySelector<HTMLElement>(sel)!.style.getPropertyValue("--w-accent");
  it("an overlay and a layer's glow take the screen's accent, the pack's own where the screen sets none", () => {
    view({}, { stage: flashing, accent: "#B96AFF" });
    expect(accentOf("[data-pack-effect='glitch']")).toBe("#B96AFF");
    expect(accentOf("[data-pack-layer='0']")).toBe("#B96AFF");
    cleanup();
    view({}, { stage: flashing });
    expect(accentOf("[data-pack-effect='glitch']")).toBe("#FF3B45");
    cleanup();
    // a stage with no accent at all sets none: the overlay's own fallback colour stays
    view({}, { stage: { ...flashing, accent: undefined } });
    expect(accentOf("[data-pack-effect='glitch']")).toBe("");
  });
});

describe("an animated page layer", () => {
  const moving: StageViewProps["stage"] = { layers: [{ image: "orbit.svg", animated: true }, { image: "art.svg" }] };
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="3"><animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite"/></circle></svg>';
  const bg = (i: number) => document.querySelector<HTMLElement>(`[data-pack-layer='${i}']`)!.style.backgroundImage;
  const read = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

  it("moves at Full, and its neighbour draws as before", () => {
    view({ fx: "full" }, { stage: moving, base: "/p/" });
    expect(bg(0)).toBe('url("/p/orbit.svg")');
    expect(document.querySelector("[data-pack-layer='0']")?.getAttribute("data-pack-moving")).toBe("on");
    expect(bg(1)).toBe('url("/p/art.svg")');
    expect(document.querySelector("[data-pack-layer='1']")?.hasAttribute("data-pack-moving")).toBe(false);
  });

  it.each([
    ["calm", { fx: "calm" as const }],
    ["off", { fx: "off" as const }],
    ["reduce", { motion: "reduce" as const }],
  ])("draws its still copy at %s, and nothing until that is read", async (name, general) => {
    const fetched = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(SVG));
    view(general, { stage: moving, base: `/${name}/` });
    expect(bg(0)).toBe("none");
    await read();
    expect(bg(0)).toMatch(/^url\("data:image\/svg\+xml;charset=utf-8,/);
    expect(decodeURIComponent(bg(0))).not.toMatch(/animate/);
    expect(bg(1)).toBe(`url("/${name}/art.svg")`);
    fetched.mockRestore();
  });

  it("draws nothing for a still copy that cannot be read or is not a pack SVG", async () => {
    const fetched = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<svg><script>1</script></svg>"));
    view({ fx: "calm" }, { stage: moving, base: "/bad/" });
    await read();
    expect(bg(0)).toBe("none");
    fetched.mockRestore();
  });
});
