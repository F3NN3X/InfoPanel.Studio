import { describe, expect, it } from "vitest";
import { msUntilNextRefresh } from "@/lib/kiosk-refresh";

const HOUR = 3_600_000;

describe("msUntilNextRefresh", () => {
  it("before 04:00 it is the same day", () => {
    expect(msUntilNextRefresh(new Date(2026, 9, 12, 1, 0))).toBe(3 * HOUR);
  });

  it("after 04:00 it is the next day", () => {
    expect(msUntilNextRefresh(new Date(2026, 9, 12, 5, 0))).toBe(23 * HOUR);
  });

  it("exactly 04:00 it is the next day", () => {
    expect(msUntilNextRefresh(new Date(2026, 9, 12, 4, 0, 0, 0))).toBe(24 * HOUR);
  });

  it("adds the jitter", () => {
    expect(msUntilNextRefresh(new Date(2026, 9, 12, 1, 0), 90_000)).toBe(3 * HOUR + 90_000);
  });

  it("never goes negative across DST changes", () => {
    for (const day of [[2026, 2, 29], [2026, 9, 25], [2026, 10, 1], [2026, 2, 8]]) {
      for (const hour of [0, 1, 2, 3, 4, 5, 23]) {
        const ms = msUntilNextRefresh(new Date(day[0], day[1], day[2], hour, 30));
        expect(ms).toBeGreaterThan(0);
        expect(ms).toBeLessThanOrEqual(25 * HOUR);
      }
    }
  });
});
