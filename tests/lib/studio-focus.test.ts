import { describe, expect, it } from "vitest";
import { focusChanged, initialFocus, nextChangeAt, throttleOf, UNFOCUSED_DELAY_MS } from "@/lib/studio-focus";

describe("the unfocused studio throttle", () => {
  const focused = initialFocus(true, true);

  it("runs while focused", () => {
    expect(throttleOf(focused, 1e9)).toBe("run");
    expect(nextChangeAt(focused, 0)).toBeNull();
  });

  it("slows only once the delay has passed unfocused, and says when", () => {
    const blurred = focusChanged(focused, false, 1000);
    expect(throttleOf(blurred, 1000 + UNFOCUSED_DELAY_MS - 1)).toBe("run");
    expect(nextChangeAt(blurred, 2000)).toBe(1000 + UNFOCUSED_DELAY_MS);
    expect(throttleOf(blurred, 1000 + UNFOCUSED_DELAY_MS)).toBe("slow");
    expect(nextChangeAt(blurred, 1000 + UNFOCUSED_DELAY_MS)).toBeNull();
  });

  it("keeps the first blur's time when blurred again", () => {
    const again = focusChanged(focusChanged(focused, false, 1000), false, 50_000);
    expect(again.blurredAt).toBe(1000);
  });

  it("restores at once on focus", () => {
    const back = focusChanged(focusChanged(focused, false, 0), true, UNFOCUSED_DELAY_MS * 2);
    expect(throttleOf(back, UNFOCUSED_DELAY_MS * 2)).toBe("run");
  });

  it("stops while hidden, focused or not", () => {
    expect(throttleOf({ ...focused, visible: false }, 0)).toBe("stop");
    expect(nextChangeAt({ ...focusChanged(focused, false, 0), visible: false }, 0)).toBeNull();
  });

  it("never slows with the setting off", () => {
    const off = { ...focusChanged(focused, false, 0), reduce: false };
    expect(throttleOf(off, UNFOCUSED_DELAY_MS * 10)).toBe("run");
    expect(nextChangeAt(off, 0)).toBeNull();
  });
});
