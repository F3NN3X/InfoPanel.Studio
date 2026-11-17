import { describe, expect, it, vi } from "vitest";
import type { TouchAction } from "@/lib/pinned";
import { needsConfirm, runTouchAction, type TouchActionDeps } from "@/lib/touch-actions";

// What a touch action does on the kiosk (decision 10), and P7's two that ask for a hold: a command marked so, and OBS's go
// live. A hold gesture is the hold; any other gesture opens the card, and nothing runs until it is held.

const deps = (extra: Partial<TouchActionDeps> = {}): TouchActionDeps => ({
  page: vi.fn(),
  toggleRotate: vi.fn(),
  audio: vi.fn(),
  obs: vi.fn(),
  media: vi.fn(),
  ...extra,
});

const RUN: TouchAction = { op: "run", command: "calc.exe" };
const HELD_RUN: TouchAction = { op: "run", command: "shutdown /s", confirm: true };
const LIVE: TouchAction = { op: "obs", body: { op: "stream", state: "toggle" } };

describe("touch actions", () => {
  it("ask for a hold for a command marked so and for OBS's go live only", () => {
    expect(needsConfirm(RUN)).toBe(false);
    expect(needsConfirm(HELD_RUN)).toBe(true);
    expect(needsConfirm(LIVE)).toBe(true);
    expect(needsConfirm({ op: "obs", body: { op: "mic" } })).toBe(false);
  });

  it("run a command through the runner, and do nothing where there is none", () => {
    const run = vi.fn();
    expect(runTouchAction(RUN, deps({ run }))).toBe(true);
    expect(run).toHaveBeenCalledWith("calc.exe");
    expect(runTouchAction(RUN, deps())).toBe(false);
  });

  it("open the card for a tap on an action that needs a hold, and run it only once the card is held", () => {
    const run = vi.fn();
    const confirm = vi.fn();
    expect(runTouchAction(HELD_RUN, deps({ run, confirm }))).toBe(true);
    expect(run).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledWith(HELD_RUN, expect.any(Function));
    confirm.mock.calls[0][1]();
    expect(run).toHaveBeenCalledWith("shutdown /s");
    // OBS's go live goes the same way
    const obs = vi.fn();
    const card = vi.fn();
    runTouchAction(LIVE, deps({ obs, confirm: card }));
    expect(obs).not.toHaveBeenCalled();
    card.mock.calls[0][1]();
    expect(obs).toHaveBeenCalledWith({ op: "stream", state: "toggle" });
  });

  it("take a hold gesture as the hold, and refuse an action that needs one where no card can ask", () => {
    const run = vi.fn();
    const confirm = vi.fn();
    runTouchAction(HELD_RUN, deps({ run, confirm }), true);
    expect(confirm).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith("shutdown /s");
    const unasked = vi.fn();
    expect(runTouchAction(HELD_RUN, deps({ run: unasked }))).toBe(false);
    expect(unasked).not.toHaveBeenCalled();
  });
});
