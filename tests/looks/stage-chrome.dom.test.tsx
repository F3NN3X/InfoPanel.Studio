// @vitest-environment happy-dom
// The stage's page treatments (src/looks/stage-chrome.tsx, Cyberspec v2 lane K): the dot grid and the screen chrome drawn behind the cards,
// gone below their size class; a pack without them draws its stage as before. And the new part hooks a user pack's CSS may style.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GeneralProvider } from "@/hooks/use-general";
import { GENERAL_DEFAULTS } from "@/lib/general";
import type { StageViewProps } from "@/looks/pack";
import PackStageLayers from "@/looks/pack-stage";
import { chromePath, gridPaint, StageChromeLayer } from "@/looks/stage-chrome";
import { userCssIssues } from "@/looks/user-css";

afterEach(cleanup);

const md = { width: 1024, height: 600 };
const view = (stage: StageViewProps["stage"], page = md) =>
  render(
    <GeneralProvider value={GENERAL_DEFAULTS}>
      <PackStageLayers stage={stage} packId="p" page={page} className="absolute inset-0" />
    </GeneralProvider>,
  ).container;

describe("the page's dot grid", () => {
  it("is a dot of the accent every `size` px, at its strength", () => {
    expect(gridPaint({ size: 22, alpha: 0.2 })).toEqual({ backgroundImage: "radial-gradient(circle, color-mix(in srgb, var(--w-accent) 20%, transparent) 1px, transparent 1.5px)", backgroundSize: "22px 22px", backgroundPosition: "11px 11px" });
  });

  it("draws as a stage layer, and not below its size class", () => {
    expect(view({ layers: [], grid: { size: 22 } }).querySelector('[data-pack-layer="grid"]')).not.toBeNull();
    expect(view({ layers: [], grid: { size: 22, minSizeClass: "lg" } }).querySelector('[data-pack-layer="grid"]')).toBeNull();
  });
});

describe("the screen chrome", () => {
  it("is a line with cut corners and the tab's notch dipping from the top centre", () => {
    const d = chromePath(1000, 600, { cut: 48, tab: { width: 200, height: 30 } });
    expect(d).toBe("M4 52 L52 4 L370 4 L400 34 L600 34 L630 4 L948 4 L996 52 L996 548 L948 596 L52 596 L4 548 Z");
    // a cut never takes more than a third of the short side
    expect(chromePath(300, 90, { cut: 64 })).toBe("M4 31.3 L31.3 4 L268.7 4 L296 31.3 L296 58.7 L268.7 86 L31.3 86 L4 58.7 Z");
  });

  it("draws its tab's text as text at the type floor or more, and its reticles", () => {
    const { container } = render(<StageChromeLayer chrome={{ tab: { width: 250, height: 20, text: "DECK // 07" }, reticles: true }} page={md} />);
    const tab = container.querySelector('[data-chrome-part="tab"]') as HTMLElement;
    expect(tab.textContent).toBe("DECK // 07");
    expect(Number.parseFloat(tab.style.fontSize)).toBeGreaterThanOrEqual(11);
    expect(container.querySelector('[data-chrome-part="reticles"]')).not.toBeNull();
    expect(container.querySelector('[data-pack-layer="chrome"]')?.getAttribute("aria-hidden")).toBe("true");
  });

  it("draws as a stage layer, and a stage without grid or chrome draws only its layers", () => {
    expect(view({ layers: [], chrome: { cut: 24 } }).querySelector('[data-pack-layer="chrome"] svg path')).not.toBeNull();
    const plain = view({ layers: [{ fill: "#000" }] });
    expect(plain.querySelectorAll("[data-pack-layer]")).toHaveLength(1);
  });
});

describe("the new part hooks in a user pack's CSS", () => {
  it("are parts the grammar names", () => {
    for (const part of ["row", "row-head", "cell", "decimals", "readout-bar"]) expect(userCssIssues(`[data-part="${part}"] { color: #5EF6FF; }`), part).toEqual([]);
  });
});
