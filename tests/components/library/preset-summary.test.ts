import { describe, expect, it } from "vitest";
import { styleRows } from "@/components/library/preset-summary";

describe("styleRows", () => {
  it("reads keys by their setting's label and an option by its label", () => {
    const rows = styleRows({ surface: "glass", madeUp: 3 });
    expect(rows[0].value.toLowerCase()).toContain("glass");
    expect(rows[0].label).not.toBe("surface");
    expect(rows[1]).toEqual({ label: "madeUp", value: "3" });
  });
});
