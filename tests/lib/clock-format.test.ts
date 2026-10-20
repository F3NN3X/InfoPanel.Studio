import { describe, expect, it } from "vitest";
import { customClockText } from "@/lib/clock-format";

const now = new Date(2026, 9, 5, 15, 7, 9);

describe("customClockText", () => {
  it("formats the time with an InfoPanel format", () => {
    expect(customClockText(now, "time", "hh:mm:ss tt")).toBe("03:07:09 PM");
    expect(customClockText(now, "time", "HH:mm")).toBe("15:07");
  });

  it("formats the date at midnight, as a Calendar does", () => {
    expect(customClockText(now, "date", "dd/MM/yyyy")).toBe("05/10/2026");
    expect(customClockText(now, "date", "HH:mm")).toBe("00:00");
  });

  it("is null without a format, or with one .NET rejects", () => {
    expect(customClockText(now, "time", undefined)).toBeNull();
    expect(customClockText(now, "time", "")).toBeNull();
    expect(customClockText(now, "time", "x")).toBeNull();
  });
});
