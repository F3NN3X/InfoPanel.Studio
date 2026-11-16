import { describe, expect, it } from "vitest";
import { colourKinds } from "@/components/widgets-page/block-tab";

// B13: the Colour row offers what each block's renderer draws. A heatmap colours its cells on its own heat scale or in a series'
// tints; thresholds (which it never read) are not offered for it.
describe("the Colour row", () => {
  it("offers a heatmap its heat scale and a series, never thresholds", () => {
    expect(colourKinds("heatmap").map((c) => c.value)).toEqual(["accent", "series"]);
    expect(colourKinds("heatmap")[0].label).toBe("Heat");
  });

  it("offers the other blocks the accent, a series and thresholds", () => {
    for (const type of ["ring", "gauge", "bar", "sparkline"] as const) expect(colourKinds(type).map((c) => c.value), type).toEqual(["accent", "series", "thresholds"]);
  });

  // G22 and B19: a value's number is the text colour unless it names one, so Text (unset) and Muted come before the same three
  it("offers a value the text colours, then the accent, a series and thresholds", () => {
    expect(colourKinds("value").map((c) => c.value)).toEqual(["fg", "muted", "accent", "series", "thresholds"]);
    expect(colourKinds("value")[0].label).toBe("Text");
  });
});
