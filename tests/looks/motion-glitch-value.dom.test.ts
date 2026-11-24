// @vitest-environment happy-dom
// A glitch on numbers (src/looks/motion-runtime.ts `glitchValue`, motion.ts `glitch.target`, `value.mark: "glitch"`): the number's text is torn
// in its aria-hidden copy for one short run while the real value stays in the page under it; a glitch aimed at numbers leaves the labels
// alone (and the other way round); a change mark of glitch shares the page's flash cap; Calm keeps only the arrival run and drops the mark.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planMotion, type MotionEnv } from "@/looks/motion";
import { addMotionCard, FLASH_STARTS_PER_S, flashOk, glitchValue, motionState, TEXT_JOBS_MAX, valueText } from "@/looks/motion-runtime";

const FULL: MotionEnv = { level: "full", lite: false, reduceMotion: false };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "queueMicrotask"] });
  // each test's fake clock starts again at 0: past the runs another test started on its own (the limiters are the page's)
  vi.advanceTimersByTime(3000);
});
afterEach(() => {
  vi.advanceTimersByTime(5000);
  vi.useRealTimers();
  document.body.innerHTML = "";
});

/** A number as MotionText draws it: its text, then its empty aria-hidden copy, inside a `num` part. */
function num(content: string, into: HTMLElement = document.body) {
  const part = document.createElement("span");
  part.setAttribute("data-part", "num");
  const host = document.createElement("span");
  host.setAttribute("data-mo-text", "");
  host.textContent = content;
  const copy = document.createElement("span");
  copy.setAttribute("data-mo-copy", "");
  copy.setAttribute("aria-hidden", "true");
  host.append(copy);
  part.append(host);
  into.append(part);
  return { host, copy };
}

describe("a number's glitch", () => {
  it("tears the number in its copy for its run, the real value and its text in place", () => {
    const { host, copy } = num("41.5");
    glitchValue(host, 240);
    expect(host.hasAttribute("data-mo-on")).toBe(true);
    expect(copy.textContent).toBe("41.5");
    expect(copy.hasAttribute("data-mo-glitch")).toBe(true);
    expect(host.firstChild?.textContent).toBe("41.5");
    vi.advanceTimersByTime(260);
    expect(host.hasAttribute("data-mo-on") || copy.hasAttribute("data-mo-glitch")).toBe(false);
    expect(copy.textContent).toBe("");
    expect(motionState().texts).toBe(0);
  });

  it("leaves a number that is already running, and keeps to the cap of runs at once", () => {
    const busy = num("7");
    valueText(busy.host, busy.copy, "8", "7", { ms: 400, style: "roll", mark: "none" });
    glitchValue(busy.host, 240);
    expect(busy.copy.hasAttribute("data-mo-glitch")).toBe(false);
    vi.advanceTimersByTime(500);
    const many = Array.from({ length: TEXT_JOBS_MAX + 2 }, () => num("3"));
    for (const n of many) glitchValue(n.host, 240);
    expect(many.filter((n) => n.copy.hasAttribute("data-mo-glitch"))).toHaveLength(TEXT_JOBS_MAX);
  });

  it("does nothing on a hidden page", () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const { host } = num("1");
    glitchValue(host, 240);
    expect(host.hasAttribute("data-mo-on")).toBe(false);
    hidden.mockRestore();
  });

  it("a glitch aimed at numbers tears them on arrival and not the labels; one aimed at text the other way round", () => {
    const card = () => {
      const el = document.createElement("div");
      const label = document.createElement("span");
      label.setAttribute("data-part", "label");
      el.append(label);
      document.body.append(el);
      return { el, label, n: num("12", el) };
    };
    const a = card();
    const offA = addMotionCard(a.el, planMotion({ glitch: { target: "value" } }, {}, FULL)!);
    expect(a.n.copy.hasAttribute("data-mo-glitch")).toBe(true);
    expect(a.label.hasAttribute("data-mo-glitch")).toBe(false);
    const b = card();
    const offB = addMotionCard(b.el, planMotion({ glitch: {} }, {}, FULL)!);
    expect(b.label.hasAttribute("data-mo-glitch")).toBe(true);
    expect(b.n.copy.hasAttribute("data-mo-glitch")).toBe(false);
    offA();
    offB();
  });

  it("a change mark of glitch tears the run's copy, and shares the page's flash cap", () => {
    const runs = Array.from({ length: FLASH_STARTS_PER_S + 1 }, () => num("1"));
    for (const n of runs) valueText(n.host, n.copy, "2", "1", { ms: 300, style: "roll", mark: "glitch" });
    expect(runs.filter((n) => n.host.getAttribute("data-mo-mark") === "glitch")).toHaveLength(FLASH_STARTS_PER_S);
    expect(flashOk()).toBe(false);
  });

  it("Calm keeps a glitch's arrival run on numbers and drops the glitch mark; Off, lite and reduced motion plan nothing", () => {
    const motion = { glitch: { target: "value" as const, every: 8 }, value: { mark: "glitch" as const } };
    const calm = planMotion(motion, {}, { ...FULL, level: "calm" })!;
    expect(calm.glitch).toMatchObject({ target: "value", every: 0 });
    expect(calm.value?.mark).toBe("none");
    expect(planMotion(motion, {}, FULL)!.glitch!.every).toBe(8);
    for (const env of [{ ...FULL, level: "off" as const }, { ...FULL, lite: true }, { ...FULL, reduceMotion: true }]) expect(planMotion(motion, {}, env)).toBeUndefined();
  });
});
