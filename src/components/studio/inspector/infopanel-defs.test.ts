import { describe, expect, it } from "vitest";
import { fromCss, toCss } from "./infopanel-defs";

describe("colours", () => {
  it("shows #AARRGGBB as #rrggbb and keeps the alpha on write", () => {
    expect(toCss("#80FF0000")).toBe("#ff0000");
    expect(fromCss("#00ff00", "#80FF0000")).toBe("#8000FF00");
    expect(fromCss("#00ff00", "")).toBe("#FF00FF00");
  });
});
