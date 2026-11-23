// @vitest-environment happy-dom
// The motion runtime (L117, src/looks/motion-runtime.ts): a scramble keeps the real text in place and puts the noise in the aria-hidden
// copy, the same length, for its time only; a number churns only its changed digits; the repeats share one timer, a second apart at least,
// and stop when the page is hidden or no card is left.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOTION_GAP_MS, planMotion } from "@/looks/motion";
import { addMotionCard, motionState, NUMBER_STARTS_PER_S, scrambleText, TEXT_JOBS_MAX } from "@/looks/motion-runtime";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
});
afterEach(() => {
  // every run ends on the fake clock, so the runtime's one loop is idle for the next test (the order is shuffled)
  vi.advanceTimersByTime(5000);
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function text(content: string) {
  const host = document.createElement("span");
  host.textContent = content;
  const copy = document.createElement("span");
  copy.setAttribute("aria-hidden", "true");
  host.append(copy);
  document.body.append(host);
  return { host, copy };
}

describe("a scramble", () => {
  it("decodes a label in the copy, the same length, and leaves the real text alone", () => {
    const { host, copy } = text("CPU LOAD");
    scrambleText(host, copy, "CPU LOAD", { ms: 300, intensity: 1 });
    expect(host.hasAttribute("data-mo-on")).toBe(true);
    vi.advanceTimersByTime(100);
    expect(copy.textContent).toHaveLength(8);
    expect(host.firstChild?.textContent).toBe("CPU LOAD");
    vi.advanceTimersByTime(300);
    expect(host.hasAttribute("data-mo-on")).toBe(false);
    expect(copy.textContent).toBe("");
  });

  it("churns only a number's changed digits, and nothing for an unchanged one", () => {
    const { host, copy } = text("41.5");
    scrambleText(host, copy, "41.5", { ms: 200, intensity: 1, from: "41.5" });
    expect(host.hasAttribute("data-mo-on")).toBe(false);
    scrambleText(host, copy, "41.7", { ms: 200, intensity: 1, from: "41.5" });
    expect(host.hasAttribute("data-mo-on")).toBe(true);
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(34);
      expect(copy.textContent?.slice(0, 3)).toBe("41.");
      expect(copy.textContent).toMatch(/^41\.\d$/);
    }
    vi.advanceTimersByTime(200);
    expect(motionState().texts).toBe(0);
  });

  it("does nothing on a hidden page, and past the cap", () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const a = text("A1");
    scrambleText(a.host, a.copy, "A1", { ms: 200, intensity: 1 });
    expect(a.host.hasAttribute("data-mo-on")).toBe(false);
    hidden.mockRestore();
    const many = Array.from({ length: TEXT_JOBS_MAX + 1 }, () => text("LABEL"));
    for (const t of many) scrambleText(t.host, t.copy, "LABEL", { ms: 300, intensity: 1 });
    expect(many.filter((t) => t.host.hasAttribute("data-mo-on"))).toHaveLength(TEXT_JOBS_MAX);
    vi.advanceTimersByTime(400);
    expect(motionState().texts).toBe(0);
  });

  it("starts at most a few numbers a second over the page, so readings that change each tick stay mostly still", () => {
    // a second past what another test may have started on its own fake clock
    vi.advanceTimersByTime(1000);
    const run = () => Array.from({ length: NUMBER_STARTS_PER_S + 2 }, () => text("12")).filter((t) => (scrambleText(t.host, t.copy, "13", { ms: 100, intensity: 1, from: "12" }), t.host.hasAttribute("data-mo-on"))).length;
    expect(run()).toBe(NUMBER_STARTS_PER_S);
    vi.advanceTimersByTime(1000);
    expect(run()).toBe(NUMBER_STARTS_PER_S);
  });

  it("stops at once when asked", () => {
    const { host, copy } = text("GPU");
    const stop = scrambleText(host, copy, "GPU", { ms: 300, intensity: 1 });
    stop();
    expect(host.hasAttribute("data-mo-on")).toBe(false);
    expect(copy.textContent).toBe("");
  });
});

describe("the page's repeats", () => {
  const card = () => {
    const el = document.createElement("div");
    el.innerHTML = '<span data-part="label">A</span><header data-part="header">B</header><div data-mo-layer></div>';
    document.body.append(el);
    return el;
  };
  const plan = planMotion({ glitch: { every: 4 }, flicker: { every: 2 }, sweep: { every: 4, ms: 800 } }, {}, { level: "full", lite: false, reduceMotion: false })!;

  it("tears every text once on arrival, then runs one repeat at a time, at least a second apart", () => {
    const el = card();
    const off = addMotionCard(el, plan);
    expect(el.querySelectorAll("[data-mo-glitch]")).toHaveLength(2);
    expect(motionState()).toMatchObject({ cards: 1, timer: true });
    const runs: number[] = [];
    const set = Element.prototype.setAttribute;
    const spy = vi.spyOn(Element.prototype, "setAttribute").mockImplementation(function (this: Element, name: string, value: string) {
      if (/^data-mo-(glitch|flicker|sweep)$/.test(name)) runs.push(performance.now());
      set.call(this, name, value);
    });
    for (let i = 0; i < 40; i++) vi.advanceTimersByTime(500);
    spy.mockRestore();
    off();
    expect(runs.length).toBeGreaterThan(5);
    for (let i = 1; i < runs.length; i++) expect(runs[i] - runs[i - 1]).toBeGreaterThanOrEqual(MOTION_GAP_MS - 1);
    expect(motionState()).toMatchObject({ cards: 0, timer: false });
  });

  it("sets no timer while the page is hidden, and none for a card with one-shots only", () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const off = addMotionCard(card(), plan);
    expect(motionState().timer).toBe(false);
    hidden.mockRestore();
    off();
    const calm = planMotion({ glitch: { every: 4 }, decode: {} }, {}, { level: "calm", lite: false, reduceMotion: false })!;
    const off2 = addMotionCard(card(), calm);
    expect(motionState().timer).toBe(false);
    off2();
  });
});
