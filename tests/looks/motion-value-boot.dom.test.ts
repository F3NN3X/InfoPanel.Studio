// @vitest-environment happy-dom
// A value's run and a page's boot (src/looks/motion-runtime.ts): the real reading is in the page at once while the copy counts or rolls; the
// runs and the marks keep to their page-wide caps; nothing runs on a hidden page; a page's cards boot once, in page order, staggered.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planMotion, type PackMotion } from "@/looks/motion";
import { addMotionCard, BOOT_SPAN_MAX_MS, FLASH_STARTS_PER_S, flashOk, motionState, VALUE_STARTS_PER_S, valueText } from "@/looks/motion-runtime";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "queueMicrotask"] });
  // a second past what another test may have started on its own fake clock (the limiters are the page's)
  vi.advanceTimersByTime(1100);
});
afterEach(() => {
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

describe("a value's run", () => {
  it("counts a figure in the copy and keeps the real reading in the page", () => {
    const { host, copy } = text("50");
    valueText(host, copy, "50", "10", { ms: 400, style: "tween", mark: "none" });
    expect(host.hasAttribute("data-mo-on")).toBe(true);
    expect(host.firstChild?.textContent).toBe("50");
    vi.advanceTimersByTime(120);
    const mid = Number(copy.textContent);
    expect(mid).toBeGreaterThan(10);
    expect(mid).toBeLessThan(50);
    vi.advanceTimersByTime(400);
    expect(host.hasAttribute("data-mo-on")).toBe(false);
    expect(copy.textContent).toBe("");
  });

  it("rolls a clock's changed digit as a reel from the old digit to the new", () => {
    const { host, copy } = text("12:35");
    valueText(host, copy, "12:35", "12:34", { ms: 300, style: "tween", mark: "none" });
    const reels = copy.querySelectorAll("[data-mo-reel]");
    expect(reels).toHaveLength(1);
    expect(reels[0].textContent).toBe("45");
    expect(copy.textContent).toBe("12:345");
    vi.advanceTimersByTime(400);
    expect(copy.childNodes).toHaveLength(0);
  });

  it("a phosphor mark keeps the old reading for its ghost while it runs, and drops it after", () => {
    const a = text("42");
    valueText(a.host, a.copy, "43", "42", { ms: 480, style: "roll", mark: "phosphor" });
    expect(a.host.getAttribute("data-mo-mark")).toBe("phosphor");
    expect(a.host.getAttribute("data-mo-was")).toBe("42");
    vi.advanceTimersByTime(600);
    expect(a.host.hasAttribute("data-mo-mark") || a.host.hasAttribute("data-mo-was")).toBe(false);
  });

  it("does nothing for an unchanged reading or on a hidden page", () => {
    const a = text("7");
    valueText(a.host, a.copy, "7", "7", { ms: 300, style: "roll", mark: "flash" });
    expect(a.host.hasAttribute("data-mo-on")).toBe(false);
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    valueText(a.host, a.copy, "8", "7", { ms: 300, style: "roll", mark: "flash" });
    expect(a.host.hasAttribute("data-mo-on") || a.host.hasAttribute("data-mo-mark")).toBe(false);
    hidden.mockRestore();
  });

  it("starts at most a few runs a second over the page, and marks at most two of them", () => {
    // each test's fake clock starts again at 0: past the runs the tests above started on theirs
    vi.advanceTimersByTime(2000);
    const runs = Array.from({ length: VALUE_STARTS_PER_S + 2 }, () => text("2"));
    for (const t of runs) valueText(t.host, t.copy, "2", "1", { ms: 300, style: "tween", mark: "flash" });
    expect(runs.filter((t) => t.host.hasAttribute("data-mo-on"))).toHaveLength(VALUE_STARTS_PER_S);
    expect(runs.filter((t) => t.host.getAttribute("data-mo-mark") === "flash")).toHaveLength(FLASH_STARTS_PER_S);
    expect(flashOk()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(flashOk()).toBe(true);
    expect(motionState().texts).toBe(0);
  });
});

const BOOT: PackMotion = { boot: { stagger: 100, ms: 200, style: "clip" } };
const plan = planMotion(BOOT, {}, { level: "full", lite: false, reduceMotion: false })!;

/** A card at `top`, `left` in a page grid. */
function card(page: HTMLElement, top: number, left: number) {
  const el = document.createElement("div");
  const layer = document.createElement("div");
  layer.setAttribute("data-mo-layer", "");
  el.append(layer);
  el.getBoundingClientRect = () => ({ top, left, width: 10, height: 10, right: left + 10, bottom: top + 10, x: left, y: top, toJSON: () => ({}) });
  page.append(el);
  return el;
}

describe("a page's boot", () => {
  it("boots a page's cards once, in page order, each a stagger after the one before, with its line", async () => {
    const page = document.createElement("div");
    page.setAttribute("data-page-grid", "");
    document.body.append(page);
    const late = card(page, 100, 0);
    const first = card(page, 0, 50);
    const second = card(page, 0, 200);
    const offs = [late, first, second].map((el) => addMotionCard(el, plan));
    await vi.advanceTimersByTimeAsync(0);
    expect([first, second, late].map((el) => el.style.getPropertyValue("--mo-boot-delay"))).toEqual(["0ms", "100ms", "200ms"]);
    expect(first.getAttribute("data-mo-boot")).toBe("clip");
    expect(first.querySelector("[data-mo-layer]")?.hasAttribute("data-mo-boot-line")).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(late.hasAttribute("data-mo-boot")).toBe(false);
    // a card that mounts on the page after its boot does not boot again
    vi.advanceTimersByTime(2000);
    const again = card(page, 0, 0);
    offs.push(addMotionCard(again, plan));
    await vi.advanceTimersByTimeAsync(0);
    expect(again.hasAttribute("data-mo-boot")).toBe(false);
    for (const off of offs) off();
  });

  it("a new page boots again, and the stagger stops at its cap", async () => {
    const page = document.createElement("div");
    page.setAttribute("data-page-grid", "");
    document.body.append(page);
    const many = Array.from({ length: 20 }, (_, i) => card(page, i * 10, 0));
    const offs = many.map((el) => addMotionCard(el, plan));
    await vi.advanceTimersByTimeAsync(0);
    expect(many.at(-1)!.style.getPropertyValue("--mo-boot-delay")).toBe(`${BOOT_SPAN_MAX_MS}ms`);
    for (const off of offs) off();
    expect(many[0].hasAttribute("data-mo-boot")).toBe(false);
  });

  it("nothing boots on a hidden page", async () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const page = document.createElement("div");
    page.setAttribute("data-page-grid", "");
    document.body.append(page);
    const el = card(page, 0, 0);
    const off = addMotionCard(el, plan);
    await vi.advanceTimersByTimeAsync(0);
    expect(el.hasAttribute("data-mo-boot")).toBe(false);
    off();
    hidden.mockRestore();
  });
});
