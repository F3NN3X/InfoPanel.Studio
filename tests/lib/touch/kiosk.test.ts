import { describe, expect, it } from "vitest";
import { actionFor, fillsPanel, gestureKey, statusText } from "@/lib/touch/kiosk";

describe("touch gestures on the kiosk", () => {
  it("keys a swipe by direction and fingers, anything else by its type", () => {
    expect(gestureKey({ type: "Swipe", dir: "Left", fingers: 2 })).toBe("Swipe Left x2");
    expect(gestureKey({ type: "LongPressRepeat", n: 3 })).toBe("LongPressRepeat");
    expect(gestureKey({ type: "ThreeFingerTap" })).toBe("ThreeFingerTap");
  });

  it("runs only the action touch.json gives that exact gesture", () => {
    const actions = { "Swipe Left x2": { action: "page", to: "next" } as const };
    expect(actionFor(actions, { type: "Swipe", dir: "Left", fingers: 2 })).toEqual({ action: "page", to: "next" });
    expect(actionFor(actions, { type: "Swipe", dir: "Left", fingers: 1 })).toBeUndefined();
    expect(actionFor({}, { type: "Tap" })).toBeUndefined();
  });
});

describe("whether the kiosk page fills the touch panel", () => {
  const bar = { width_px: 1920, height_px: 550 };

  it("compares the CSS size times the pixel ratio with the panel, within 2 px", () => {
    expect(fillsPanel({ width: 1920, height: 550 }, 1, bar)).toBe(true);
    expect(fillsPanel({ width: 1280, height: 366.67 }, 1.5, bar)).toBe(true);
    expect(fillsPanel({ width: 1920, height: 540 }, 1, bar)).toBe(false);
    expect(fillsPanel({ width: 1920, height: 550 }, 1.25, bar)).toBe(false);
  });
});

describe("the touch notice", () => {
  it("says nothing while connected and names the panel otherwise", () => {
    expect(statusText({ status: "Connected", interface: 0, report_len: 64, port: "1-2" }, "Bar")).toBeNull();
    expect(statusText({ status: "Disconnected" }, "Bar")).toContain("Bar");
    expect(statusText({ status: "Error", message: "no touch device found" }, "Bar")).toBe("Touch: no touch device found");
    for (const status of [null, { status: "Stopped" } as const, { status: "Offline" } as const]) {
      expect(statusText(status, "Bar")).toBeTruthy();
    }
  });
});
