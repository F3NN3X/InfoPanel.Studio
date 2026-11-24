// @vitest-environment happy-dom
// The render check's verdict and its studio half (L94). What the measures read needs a real browser (tests/e2e/user-pack-css.spec.ts and
// the pack specs); here is what is decided from their numbers, and that everything but a frame's clean answer refuses the pack.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderRefusals, unlit, type Measured } from "@/looks/pack-render-measures";
import { CHECK_URL, runRenderCheck } from "@/looks/pack-render-check";
import type { PackSource } from "@/looks/pack-validate";

const page = (over: Partial<Measured> = {}): Measured => ({ clips: [], cardClips: [], masks: [], borders: [], problems: [], cards: 2, gradients: 0, gauges: [{ key: "a", lit: true }], texts: [{ key: "0:0", ratio: 7, text: "CPU" }], marks: [{ key: "0:0", part: "spark", ratio: 5 }], bars: 1, barIssues: [], ...over });

describe("what the pack's CSS changed, and only that", () => {
  it("a page the CSS leaves alone passes", () => {
    expect(renderRefusals({ worn: page(), bare: page() })).toEqual([]);
  });

  it("a problem the tokens already have is not the stylesheet's", () => {
    const low = { texts: [{ key: "0:0", ratio: 2, text: "CPU" }], problems: ["a ring's value arc is faint"], barIssues: ["x"] };
    expect(renderRefusals({ worn: page(low), bare: page(low) })).toEqual([]);
  });

  it("a new problem, a bar issue or an unlit gauge refuses", () => {
    expect(renderRefusals({ worn: page({ problems: ['text "CPU" is at opacity 0.25'] }), bare: page() })).toEqual(['text "CPU" is at opacity 0.25']);
    expect(renderRefusals({ worn: page({ barIssues: ["x"] }), bare: page() })).toEqual(["x"]);
    expect(renderRefusals({ worn: page({ gauges: [{ key: "a", lit: false }] }), bare: page() })[0]).toContain("no longer lit");
  });

  it("text is held to 3:1, and to no less than it had", () => {
    const at = (ratio: number | null) => page({ texts: [{ key: "0:0", ratio, text: "CPU" }] });
    expect(renderRefusals({ worn: at(2.99), bare: at(7) })[0]).toContain("under 3:1");
    expect(renderRefusals({ worn: at(3), bare: at(7) })).toEqual([]);
    expect(renderRefusals({ worn: at(1.5), bare: at(2) })[0]).toContain("under 3:1");
    expect(renderRefusals({ worn: at(2.5), bare: at(null) })[0]).toContain("under 3:1");
  });

  it("a mark the CSS paints away is refused, one it only changes is not", () => {
    const at = (ratio: number | null) => page({ marks: [{ key: "0:0", part: "spark", ratio }] });
    expect(renderRefusals({ worn: at(1.1), bare: at(5) })[0]).toContain("a spark");
    expect(renderRefusals({ worn: at(null), bare: at(5) })[0]).toContain("a spark");
    expect(renderRefusals({ worn: at(1.4), bare: at(5) })).toEqual([]);
    expect(renderRefusals({ worn: at(1.1), bare: at(1.1) })).toEqual([]);
    expect(renderRefusals({ worn: at(null), bare: at(null) })).toEqual([]);
  });

  it("a clip-path keeps 90% of a text, against what it kept without the pack", () => {
    const seen = (v: number | null) => page({ clips: [{ key: "0:0", text: "CPU", seen: v }] });
    expect(renderRefusals({ worn: seen(0.9), bare: page() })).toEqual([]);
    expect(renderRefusals({ worn: seen(0.89), bare: page() })[0]).toContain("cut by a clip-path");
    expect(renderRefusals({ worn: seen(0.5), bare: seen(0.5) })).toEqual([]);
    expect(renderRefusals({ worn: seen(0.4), bare: seen(0.5) })[0]).toContain("cut by a clip-path");
    expect(renderRefusals({ worn: seen(null), bare: page() })[0]).toContain("an unreadable share");
    expect(renderRefusals({ worn: seen(null), bare: seen(null) })).toEqual([]);
  });

  it("a card's clip-path takes at most 10% of it and none of its content's corners", () => {
    const card = (removed: number | null, corners: number | null) => page({ cardClips: [{ key: "0", place: "CPU@1x1", removed, corners }] });
    expect(renderRefusals({ worn: card(0.1, 0), bare: page() })).toEqual([]);
    expect(renderRefusals({ worn: card(0.11, 0), bare: page() })[0]).toContain("removes 11% of a card");
    expect(renderRefusals({ worn: card(0.02, 1), bare: page() })[0]).toContain("cuts 1 of the corners");
    expect(renderRefusals({ worn: card(null, null), bare: page() })[0]).toContain("cannot be read");
    expect(renderRefusals({ worn: card(0.3, 2), bare: card(0.3, 2) })).toEqual([]);
  });

  it("a mask leaves a text at 0.5 or more, against what it left without the pack; one that cannot be read refuses", () => {
    const alpha = (v: number | null) => page({ masks: [{ key: "0:0", text: "CPU", alpha: v }] });
    expect(renderRefusals({ worn: alpha(0.5), bare: page() })).toEqual([]);
    expect(renderRefusals({ worn: alpha(0.49), bare: page() })[0]).toContain("at 0.49");
    expect(renderRefusals({ worn: alpha(0.2), bare: alpha(0.1) })).toEqual([]);
    expect(renderRefusals({ worn: alpha(0.2), bare: alpha(0.9) })[0]).toContain("under a mask");
    // the same mask read over a box the pack's face moved a pixel: within 5% of what it left without the pack
    expect(renderRefusals({ worn: alpha(0.3403), bare: alpha(0.34375) })).toEqual([]);
    expect(renderRefusals({ worn: alpha(0.32), bare: alpha(0.34375) })[0]).toContain("under a mask");
    expect(renderRefusals({ worn: alpha(null), bare: page() })[0]).toContain("cannot be read");
    expect(renderRefusals({ worn: alpha(null), bare: alpha(null) })).toEqual([]);
  });

  it("a border keeps every width it had without the pack, whatever its style or colour", () => {
    const edge = (widths?: string) => page({ borders: widths ? [{ key: "0:3", name: "div num [CPU@1x1]", widths }] : [] });
    expect(renderRefusals({ worn: edge("2px 2px 2px 2px"), bare: edge("2px 2px 2px 2px") })).toEqual([]);
    expect(renderRefusals({ worn: edge("3px 3px 3px 3px"), bare: edge() })[0]).toContain("div num [CPU@1x1] is 3px 3px 3px 3px, not 0px 0px 0px 0px");
    expect(renderRefusals({ worn: edge("2px 4px 2px 2px"), bare: edge("2px 2px 2px 2px") })[0]).toContain("not as wide as without the pack");
    // a border the pack takes away moves what the element holds as much as one it adds
    expect(renderRefusals({ worn: edge(), bare: edge("2px 2px 2px 2px") })[0]).toContain("is 0px 0px 0px 0px, not 2px 2px 2px 2px");
  });

  it("nothing drawn is no pass", () => {
    expect(renderRefusals({ worn: page({ cards: 0 }), bare: page({ cards: 0 }) })[0]).toContain("no widget was drawn");
    expect(renderRefusals({ worn: page({ texts: [] }), bare: page() })[0]).toContain("could not be read");
  });

  it("a gauge is unlit when it is gone as well as when it is dark", () => {
    expect(unlit([{ key: "a", lit: true }, { key: "b", lit: false }], [])).toEqual(["a"]);
  });
});

describe("the studio's half fails closed", () => {
  const src: PackSource = { pack: {}, look: {}, css: "x", files: [] };
  /** The frame's window: happy-dom gives an iframe none of its own. */
  const inner = { postMessage: vi.fn() };
  beforeEach(() => {
    inner.postMessage.mockClear();
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", { configurable: true, get: () => inner });
  });
  afterEach(() => {
    delete (HTMLIFrameElement.prototype as { contentWindow?: unknown }).contentWindow;
    document.body.replaceChildren();
  });

  /** Answers the iframe as a frame would: a message from a window, as `event.source`. */
  const answer = (_frame: HTMLIFrameElement, data: unknown, origin = window.location.origin, source: unknown = inner) => {
    const event = new MessageEvent("message", { data, origin });
    Object.defineProperty(event, "source", { value: source });
    window.dispatchEvent(event);
  };
  const frame = () => document.querySelector("iframe") as HTMLIFrameElement;

  it("a frame that never answers refuses the pack, and the frame goes", async () => {
    await expect(runRenderCheck(src, 20)).resolves.toEqual(["the render check could not finish, so the pack was not stored"]);
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("opens the one page the server opens for it, on the layout and off the screen", async () => {
    const run = runRenderCheck(src, 1);
    expect(frame().getAttribute("src")).toBe(CHECK_URL);
    expect(frame().style.display).toBe("");
    expect(frame().style.left).toBe("-20000px");
    // its timer runs out inside the test: one that fires after the environment is gone throws there
    await run;
  });

  it("sends the candidate only to its own frame, and only after it says it is ready", async () => {
    const run = runRenderCheck(src, 5);
    answer(frame(), { kind: "pack-check-ready" }, "http://evil.test");
    answer(frame(), { kind: "pack-check-ready" }, window.location.origin, window);
    expect(inner.postMessage).not.toHaveBeenCalled();
    answer(frame(), { kind: "pack-check-ready" });
    expect(inner.postMessage).toHaveBeenCalledWith({ kind: "pack-check-run", src }, window.location.origin);
    await run;
  });

  it("a clean answer passes, a refusal is passed on, and an answer of the wrong shape refuses", async () => {
    for (const [refusals, want] of [[[], []], [["hidden"], ["hidden"]], [undefined, undefined], [[1], undefined], ["hidden", undefined]] as const) {
      const run = runRenderCheck(src, 1000);
      answer(frame(), { kind: "pack-check-done", refusals });
      expect(await run).toEqual(want ?? ["the render check could not finish, so the pack was not stored"]);
    }
  });

  it("an answer from elsewhere is not the frame's", async () => {
    const run = runRenderCheck(src, 30);
    answer(frame(), { kind: "pack-check-done", refusals: [] }, "http://evil.test");
    answer(frame(), { kind: "pack-check-done", refusals: [] }, window.location.origin, window);
    expect(await run).toEqual(["the render check could not finish, so the pack was not stored"]);
  });
});
