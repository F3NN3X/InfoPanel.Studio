import { describe, expect, it } from "vitest";
import { fpsSubLine } from "@/widgets/fps-line";

describe("fpsSubLine", () => {
  it("joins the 1% low and the frame time", () => {
    expect(fpsSubLine(58, 12.6)).toBe("1% low 58 · 12.6 ms");
  });

  it("leaves out a 1% low that is 0 or unknown", () => {
    expect(fpsSubLine(0, 12.6)).toBe("12.6 ms");
    expect(fpsSubLine(Number.NaN, 12.6)).toBe("12.6 ms");
  });

  it("is empty when there is no reading at all", () => {
    expect(fpsSubLine(0, 0)).toBe("");
  });
});
