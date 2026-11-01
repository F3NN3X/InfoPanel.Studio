// @vitest-environment happy-dom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KIOSK_WAIT_MS, KioskConnecting } from "@/components/ui/kiosk-connecting";

describe("KioskConnecting", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("stays blank at first, then says it is connecting when the server is slow", () => {
    render(<KioskConnecting />);
    expect(screen.queryByRole("status")).toBeNull();
    act(() => void vi.advanceTimersByTime(KIOSK_WAIT_MS));
    expect(screen.getByRole("status").textContent).toContain("Waiting for InfoPanel Studio");
  });
});
