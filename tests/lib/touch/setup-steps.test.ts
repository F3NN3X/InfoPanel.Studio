// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { leaveTouchIntent, takeTouchIntent } from "@/lib/touch/intent";
import { firstUnfinished, stepDone, type SetupFacts } from "@/lib/touch/setup-steps";

const none: SetupFacts = { enabled: false, screens: null, paired: false, sizeConfirmed: false, kioskOnline: false, tapped: false };

describe("the guided setup's steps", () => {
  it("opens at the first step not done, in order", () => {
    expect(firstUnfinished(none)).toBe("enable");
    expect(firstUnfinished({ ...none, enabled: true })).toBe("driver");
    expect(firstUnfinished({ ...none, enabled: true, screens: [{ ready: false }] })).toBe("driver");
    expect(firstUnfinished({ ...none, enabled: true, screens: [{ ready: false }, { ready: true }] })).toBe("pair");
    const paired = { ...none, enabled: true, screens: [{ ready: true }], paired: true };
    expect(firstUnfinished(paired)).toBe("size");
    expect(firstUnfinished({ ...paired, sizeConfirmed: true })).toBe("show");
    expect(firstUnfinished({ ...paired, sizeConfirmed: true, kioskOnline: true })).toBe("test");
    expect(firstUnfinished({ ...paired, sizeConfirmed: true, kioskOnline: true, tapped: true })).toBeNull();
  });

  it("resumes past the size for a paired panel InfoPanel already shows", () => {
    const shown = { ...none, enabled: true, screens: [{ ready: true }], paired: true, kioskOnline: true };
    expect(stepDone("size", shown)).toBe(true);
    expect(firstUnfinished(shown)).toBe("test");
    expect(stepDone("size", { ...shown, paired: false })).toBe(false);
  });
});

describe("a touch step asked for in the Studio", () => {
  afterEach(() => localStorage.clear());

  it("is taken once, while fresh", () => {
    leaveTouchIntent({ action: "setup", display: "hall" }, 1000);
    expect(takeTouchIntent(2000)).toEqual({ action: "setup", display: "hall" });
    expect(takeTouchIntent(2000)).toBeNull();
    leaveTouchIntent({ action: "identify", panel: "panel-1" }, 1000);
    expect(takeTouchIntent(1000 + 61_000)).toBeNull();
  });

  it("ignores what isn't a request", () => {
    localStorage.setItem("infopanel.touch-intent", "{");
    expect(takeTouchIntent()).toBeNull();
    localStorage.setItem("infopanel.touch-intent", JSON.stringify({ at: Date.now() }));
    expect(takeTouchIntent()).toBeNull();
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(takeTouchIntent()).toBeNull();
    spy.mockRestore();
  });
});
