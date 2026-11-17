// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import snapshot from "@/widgets/__fixtures__/snapshot.json";
import Clock, { clockParts } from "@/widgets/clock/Clock";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 17, 21, 5, 9));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("clockParts", () => {
  it("reads the device clock, with the 12-hour hour and PM", () => {
    expect(clockParts(new Date(2026, 10, 17, 21, 5, 9))).toEqual({ H: 21, h12h: 9, M: 5, S: 9, day: 17, mon: 11, yr: 2026, pm: true });
    expect(clockParts(new Date(2026, 0, 2, 0, 0, 0))).toMatchObject({ H: 0, h12h: 12, pm: false });
    expect(clockParts(new Date(2026, 0, 2, 12, 30, 0))).toMatchObject({ h12h: 12, pm: true });
  });
});

describe("Clock", () => {
  it("shows today's date, not the sensor snapshot's (12 Oct)", () => {
    const data = Object.fromEntries(Object.entries(snapshot.sensors).map(([k, v]) => [k, v]));
    const { container } = render(<Clock data={data as never} />);
    expect(container.textContent).toContain("17 Nov");
    expect(container.textContent).not.toContain("12 Oct");
  });
});
